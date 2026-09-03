"use client";

import { useEffect, useState, useRef } from "react";
import { getSupabase, getFreshToken, applyStaySignedIn, enforceStaySignedIn } from "../../lib/supabaseBrowser";
import "./crm.css";

// Agent CRM — worklist plus a BATS-style lead detail with editable customer,
// route, pricing, and terms. Lifecycle: assigned → contacted → quoted (emails
// the customer) → booked (converts to an order) → closed/dead. Agents can also
// generate a customer booking + e-signature link.

function vehicleList(l) {
  if (Array.isArray(l.vehicles) && l.vehicles.length > 0) return l.vehicles;
  if (l.vehicle_year || l.vehicle_make || l.vehicle_model)
    return [{ year: l.vehicle_year, make: l.vehicle_make, model: l.vehicle_model }];
  return [];
}
function vehSummary(l) {
  const v = vehicleList(l);
  if (v.length === 0) return "—";
  const first = [v[0].year, v[0].make, v[0].model].filter(Boolean).join(" ");
  return v.length > 1 ? `${first} +${v.length - 1}` : first;
}
// What the customer told us about drivability: "Runs" unless they flagged the
// vehicle inoperable, in which case show the condition they picked.
function vehCondition(l) {
  const v = vehicleList(l);
  if (v.length === 0) return "—";
  const inop = v.filter((x) => x.inoperable);
  if (inop.length === 0) return "Runs";
  return inop.map((x) => x.condition || "Inoperable").join("; ");
}
function dt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function loc(city, st, zip) {
  return [[city, st].filter(Boolean).join(", "), zip].filter(Boolean).join(" ") || "—";
}
const EDITABLE = [
  "name", "phone", "email",
  "origin_city", "origin_state", "origin_zip",
  "destination_city", "destination_state", "destination_zip",
  "transport_type", "total_tariff", "carrier_pay", "special_terms",
  "quote_expiration", "pickup_date", "follow_up_date", "internal_memo",
  "secondary_status", "reference_id", "carrier_pay_terms", "broker_fee_terms", "desired_delivery_date",
];

// Working status (disposition) shown on the Shipment card. This is stored in
// `secondary_status` — deliberately NOT the lifecycle `status` column, which
// drives which section a record lives in (My Leads / Quotes / Orders) and the
// conversion KPIs. Setting a disposition must never move a quote out of the
// Quotes tab, which is exactly how the legacy CRM behaves.
const QUOTE_STATUSES = [
  "New", "Quoted", "Hot", "Warm", "Cold", "On Hold",
  "Follow Up", "Email Sent", "VM", "Left Voicemail", "No Answer", "Do Not Text",
];
// Orders track carrier progress in the same field.
const ORDER_STATUSES = [
  "Searching For Carriers", "Carrier Assigned", "Dispatched",
  "Picked Up", "In Transit", "Delivered",
];

// Hoisted to module scope so these keep stable component identities across
// CrmPortal re-renders — otherwise every keystroke remounts the card/input
// subtree and steals focus. Do NOT move these back inside the component.
function Card({ id, title, right, children, defaultOpen = true }) {
  return (
    <div className="crm-card">
      <div className="crm-card-h">
        <b>{title}</b>
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </div>
      <div className="crm-card-b">{children}</div>
    </div>
  );
}
function F({ label, children }) {
  return <div className="crm-fe"><label>{label}</label>{children}</div>;
}
function F2({ children }) {
  return <div className="crm-fe2">{children}</div>;
}
// Compact select-alike that always opens its option list upward. A native
// <select>'s popup direction is chosen by the OS/browser and isn't something
// CSS or JS can override — these live in the Payments card, which is usually
// near the bottom of the page, so the native popup either gets clipped by the
// sticky action bar or just looks wrong opening downward into it.
function UpDropdown({ value, options, onChange, className, title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div className={"crm-updrop " + (className || "")} ref={ref} title={title}>
      <button type="button" className="crm-updrop-btn" onClick={() => setOpen((v) => !v)}>
        {current ? current.label : value}
        <span className="crm-updrop-caret">▾</span>
      </button>
      {open && (
        <div className="crm-updrop-list">
          {options.map((o) => (
            <div
              key={o.value}
              className={"crm-updrop-opt" + (o.value === value ? " sel" : "")}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// Display phone without a leading US country-code "1"; format as (XXX) XXX-XXXX when possible.
function fmtPhone(raw) {
  if (!raw) return "—";
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return d || String(raw);
}

// B2B "request a business account" leads (dealers / repair shops / fleet).
// Its own CRM section (sidebar item below Refunds). Cards are collapsible so a
// long list of inquiries doesn't overlap; each has a lifecycle status dropdown
// that PATCHes back to the server so the team can track contacted/won/lost.
const BIZ_STATUSES = ["new", "contacted", "in_progress", "won", "lost"];
function BizInquiriesView({ api }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState({}); // id -> bool (default collapsed)
  const [busy, setBusy] = useState(null); // id being saved, or null
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  async function load() {
    try { setItems((await api("/api/crm/business-inquiries")).inquiries); setError(null); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function setStatus(id, status) {
    setBusy(id);
    try {
      await api("/api/crm/business-inquiries", { method: "PATCH", body: JSON.stringify({ id, status }) });
      setItems((prev) => (prev || []).map((b) => (b.id === id ? { ...b, status } : b)));
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }
  return (
    <div className="crm-list">
      <div className="crm-bar">
        <span className="crm-count">BUSINESS INQUIRIES <b>{items ? items.length : "…"}</b></span>
        <span className="crm-muted" style={{ fontSize: 12 }}>For Business page requests (dealers, repair shops, fleet)</span>
        <button className="crm-refresh" onClick={load}>⟳</button>
      </div>
      {error && <div className="crm-empty" style={{ color: "var(--red)" }}>{error}</div>}
      {items && items.length === 0 && <div className="crm-empty">No business inquiries yet.</div>}
      <div className="crm-biz-list">
        {(items || []).map((b) => (
          <div className="crm-biz-row" key={b.id}>
            <div className="crm-biz-head" onClick={() => toggle(b.id)} style={{ cursor: "pointer" }}>
              <span className={`crm-pill s-${b.status === "new" ? "new" : b.status}`}>{b.segment}</span>
              <b>{b.name}{b.company ? ` · ${b.company}` : ""}</b>
              <span className="mono">{b.phone}</span>
              {b.email && <span className="mono">{b.email}</span>}
              <span className="crm-muted" style={{ marginLeft: "auto", fontSize: 11 }}>{dt(b.created_at)}{busy === b.id ? " · saving…" : ""}</span>
              <span className="crm-biz-caret">{open[b.id] ? "▾" : "▸"}</span>
            </div>
            {open[b.id] && (
              <div className="crm-biz-body">
                {b.message && <div className="crm-muted" style={{ fontSize: 12.5, marginBottom: 10, whiteSpace: "pre-wrap" }}>{b.message}</div>}
                <label className="crm-biz-status">
                  <span>Status</span>
                  <select value={b.status} disabled={busy === b.id}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setStatus(b.id, e.target.value)}>
                    {BIZ_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Map an NHTSA BodyClass string to a clean transport category.
function vehType(body) {
  if (!body) return null;
  const b = String(body).toLowerCase();
  if (b.includes("pickup") || b.includes("truck")) return "Pickup";
  if (b.includes("suv") || b.includes("sport utility") || b.includes("crossover")) return "SUV";
  if (b.includes("van") || b.includes("minivan")) return "Van";
  if (b.includes("motorcycle")) return "Motorcycle";
  if (b.includes("sedan") || b.includes("saloon") || b.includes("coupe") || b.includes("hatchback") ||
      b.includes("convertible") || b.includes("wagon") || b.includes("car")) return "Car";
  return body;
}

// Best-effort category guess from a model name (used when there's no VIN body).
function guessType(model) {
  if (!model) return null;
  const m = String(model).toLowerCase();
  const suv = ["suv","4runner","tahoe","suburban","explorer","expedition","highlander","pilot","rav4","cr-v","crv","escape","equinox","rogue","cx-5","cx5","wrangler","cherokee","grand cherokee","bronco","lx","gx","rx","qx","mdx","rdx","xc90","xc60","x5","x3","glc","gle","q5","q7","telluride","palisade","atlas","tucson","santa fe","sorento","sportage","outback","forester","durango","traverse","pathfinder","sequoia","land cruiser","defender","range rover","discovery"];
  const pickup = ["f-150","f150","f-250","f250","f-350","silverado","sierra","ram","tundra","tacoma","colorado","canyon","ranger","frontier","ridgeline","gladiator","titan","maverick"];
  const van = ["odyssey","sienna","pacifica","caravan","transit","sprinter","express","savana","promaster","carnival","sedona","metris"];
  const moto = ["harley","ninja","cbr","yzf","gsxr","softail","sportster","street glide","road king","panigale","monster","goldwing"];
  if (moto.some((k) => m.includes(k))) return "Motorcycle";
  if (pickup.some((k) => m.includes(k))) return "Pickup";
  if (van.some((k) => m.includes(k))) return "Van";
  if (suv.some((k) => m.includes(k))) return "SUV";
  return "Car";
}

export default function CrmPortal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  // Phase 2: list sections + search / sort / filter / paginate
  const [section, setSection] = useState("leads"); // leads | quotes | orders
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [fOrigin, setFOrigin] = useState("");
  const [fDest, setFDest] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [dispatch, setDispatch] = useState(null);
  const [sigHistory, setSigHistory] = useState([]);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  // Phase 5 UI state: notifications, global search, autosave
  const [notif, setNotif] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [fbForm, setFbForm] = useState({ subject: "", message: "", attachments: [] });
  const [fbBusy, setFbBusy] = useState(false);
  const [fbMsg, setFbMsg] = useState(null);
  const [notifUnread, setNotifUnread] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [autosaving, setAutosaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const autosaveTimer = useRef(null);
  const skipAutosave = useRef(true);
  // Phase 3 UI state: tasks / notes / documents / pricing + active tab
  const [tab, setTab] = useState("vehicles");
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [newDocUrl, setNewDocUrl] = useState("");
  // Spec #16-#17: explicit save-state + validation
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | unsaved
  const [errors, setErrors] = useState({});
  // Part 2 data
  const [vehicles, setVehicles] = useState([]);
  const [activity, setActivity] = useState([]);
  const [changes, setChanges] = useState([]);
  const [bookingEvents, setBookingEvents] = useState([]);
  const [vinInput, setVinInput] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [noteKind, setNoteKind] = useState("internal");

  // Redesign: collapsible card state (unconditional — before any early return)
  const [collapsed, setCollapsed] = useState({});
  // Simplified-layout edit modals
  const [modal, setModal] = useState(null); // 'shipment' | 'origin' | 'destination' | 'customer' | 'campaign'
  const [editingVeh, setEditingVeh] = useState(null); // vehicle id for vehicle edit modal
  const [vehDraft, setVehDraft] = useState(null); // local edits, not sent until Save
  const [vehSaving, setVehSaving] = useState(false);
  const [vehMsg, setVehMsg] = useState(null);
  const openModal = (m) => setModal(m);
  const closeModal = () => setModal(null);
  // Payments feature state (tab + Add/Edit Payment modal)
  const [payments, setPayments] = useState([]);
  const [paymentModal, setPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null); // payment id being edited, or null when adding
  const [paymentForm, setPaymentForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), type: "ach", direction: "customer_broker", amount: "", identification: "", notes: "", refunded: false, refund_type: "refund", refund_reason: "", refund_date: new Date().toISOString().slice(0, 10), refund_ref: "" });
  const [refunds, setRefunds] = useState([]); // refunded/chargeback payments (dashboard)
  const [refundsMonth, setRefundsMonth] = useState({ refunded: 0, chargebacks: 0, refunded_count: 0, chargebacks_count: 0 });
  const addPaymentBtn = useRef(null);
  // Text Templates feature (SMS drafts). Templates are per-tenant: company
  // (shared, agent_id NULL) vs personal (this agent only). Apply stages the
  // rendered message into a composer strip; real SMS send is future work.
  const [textModal, setTextModal] = useState(false);
  const [tmplTab, setTmplTab] = useState("company"); // 'personal' | 'company'
  const [tmplSearch, setTmplSearch] = useState("");
  const [tmplList, setTmplList] = useState([]);
  const [tmplExpanded, setTmplExpanded] = useState(null); // template id
  const [tmplMoreId, setTmplMoreId] = useState(null); // template id whose "More" menu is open
  const [tmplEdit, setTmplEdit] = useState(null); // {id?, name, category, body} being created/edited
  const [invoiceOpen, setInvoiceOpen] = useState(null); // truthy while the invoice modal is showing
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState(null);
  const [pdfInvoiceUrl, setPdfInvoiceUrl] = useState(null); // object URL for the generated invoice PDF
  const [invoiceHistory, setInvoiceHistory] = useState([]); // past generated invoices for the open order
  const [composer, setComposer] = useState(null); // staged rendered message for Apply
  // Action-bar Delete button: two-click confirm. First click arms (red,
  // "Click Again to Delete"); a second click within 5s deletes; otherwise it
  // auto-disarms. Avoids modal confirmations while preventing accidents.
  const [delArmed, setDelArmed] = useState(false);
  const delTimer = useRef(null);
  function armDelete() {
    if (delArmed) {
      if (delTimer.current) clearTimeout(delTimer.current);
      setDelArmed(false);
      saveGuarded({ status: "dead" }, "Dead.");
    } else {
      setDelArmed(true);
      delTimer.current = setTimeout(() => setDelArmed(false), 5000);
    }
  }
  // Modal keyboard shortcuts: Enter = Save, Esc = Close (skip Enter inside textarea/select)
  useEffect(() => {
    const anyModal = modal || editingVeh != null;
    if (!anyModal) return;
    const onKey = (e) => {
      if (e.key === "Escape") { setModal(null); closeVehModal(); }
      else if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "SELECT") {
        e.preventDefault();
        if (editingVeh != null) { saveVehDraft(); }
        else if (["shipment","origin","destination","customer","pricing","booking"].includes(modal)) { saveGuarded({}, "Saved."); setModal(null); }
        else { setModal(null); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, editingVeh, draft]);

  async function api(path, options = {}) {
    const token = await getFreshToken("crm");
    const res = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      cache: "no-store",
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
    return out;
  }
  async function load() {
    const d = await api("/api/crm/leads");
    setData(d);
    if (d.refunds_month) setRefundsMonth(d.refunds_month);
    // Re-sync fields the server may have computed on this save (e.g. converting
    // a quote resets secondary_status to "Searching For Carriers", stamps
    // status/order_number). Without this the open draft keeps its old value —
    // e.g. a leftover "Hot" — which no longer matches the order dropdown.
    if (openId) {
      const fresh = (d.leads || []).find((l) => l.id === openId);
      if (fresh) {
        setDraft((prev) => ({
          ...prev,
          status: fresh.status,
          secondary_status: fresh.secondary_status == null ? "" : fresh.secondary_status,
        }));
      }
    }
    return d;
  }

  // Best-effort activity logging for agent stats (never blocks the UI).
  function logActivity(type, leadId) {
    api("/api/crm/agents/stats", { method: "POST", body: JSON.stringify({ type, lead_id: leadId || null }) }).catch(() => {});
  }
  async function loadDispatch(leadId) {
    setDispatch(null); setSigHistory([]);
    try {
      const d = await api(`/api/crm/dispatch?lead_id=${leadId}`);
      setDispatch(d);
      const sg = await api(`/api/crm/signatures?lead_id=${leadId}`);
      setSigHistory(sg.history || []);
    } catch { /* dispatch panel degrades gracefully */ }
  }
  async function loadNotifications() {
    try {
      const r = await api("/api/crm/notifications");
      setNotif(r.notifications || []);
      setNotifUnread(r.unread || 0);
    } catch {}
  }
  async function submitFeedback() {
    if (!fbForm.subject.trim() || !fbForm.message.trim()) { setFbMsg({ ok: false, text: "Subject and message are required." }); return; }
    setFbBusy(true); setFbMsg(null);
    try {
      const browserInfo = navigator.userAgent + " | " + (window.screen ? `${window.screen.width}x${window.screen.height}` : "");
      await api("/api/crm/feedback", {
        method: "POST",
        body: JSON.stringify({
          subject: fbForm.subject,
          message: fbForm.message,
          attachments: fbForm.attachments,
          browser_info: browserInfo,
          page: window.location.pathname,
          crm_version: "1.0",
        }),
      });
      setFbMsg({ ok: true, text: "Feedback sent. Thank you!" });
      setFbForm({ subject: "", message: "", attachments: [] });
      setTimeout(() => setFeedbackOpen(false), 1200);
    } catch (e) {
      setFbMsg({ ok: false, text: e.message || "Failed to send." });
    } finally { setFbBusy(false); }
  }
  function onFeedbackFiles(e) {
    const files = Array.from(e.target.files || []);
    const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];
    const next = [];
    for (const f of files) {
      if (!allowed.includes(f.type)) continue;
      if (f.size > 6 * 1024 * 1024) continue;
      const reader = new FileReader();
      reader.onload = () => {
        setFbForm((prev) => ({ ...prev, attachments: [...prev.attachments, { name: f.name, type: f.type, data_url: reader.result }].slice(0, 5) }));
      };
      reader.readAsDataURL(f);
    }
    e.target.value = "";
  }
  async function doSearch(q) {
    setSearchQ(q);
    if (q.trim().length < 2) { setSearchResults(null); return; }
    try {
      const r = await api("/api/search?q=" + encodeURIComponent(q));
      setSearchResults(r);
    } catch { setSearchResults({ leads: [], carriers: [] }); }
  }
  useEffect(() => { loadNotifications(); }, []);
  useEffect(() => { if (section === "refunds") loadRefunds(); }, [section]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
      if (e.key === "Escape") { setSearchOpen(false); setNotifOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Autosave (debounced) — also the single source of truth for the save-state
  // indicator. skipAutosave suppresses the run triggered by loading a lead, so
  // "Unsaved" only appears after a genuine edit.
  useEffect(() => {
    if (skipAutosave.current) { skipAutosave.current = false; return; }
    if (!openId) return;
    setSaveState("unsaved");
    setAutosaving(true);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await api("/api/crm/leads", { method: "PATCH", body: JSON.stringify({ id: openId, ...draft }) });
        setAutosaving(false); setLastSaved(new Date()); setSaveState("saved");
      } catch { setAutosaving(false); setSaveState("unsaved"); }
    }, 900);
  }, [draft]);
  // Spec #17: validate the lead before save
  function validate() {
    const e = {};
    const t = Number(draft.total_tariff); const c = Number(draft.carrier_pay);
    if (draft.total_tariff !== "" && draft.carrier_pay !== "" && !Number.isNaN(t) && !Number.isNaN(c) && c > t)
      e.carrier_pay = "Carrier pay cannot exceed tariff";
    if (!draft.name || !draft.name.trim()) e.name = "Customer name required";
    const originOk = (draft.origin_city && draft.origin_state) || (draft.origin_zip && draft.origin_zip.trim());
    const destOk = (draft.destination_city && draft.destination_state) || (draft.destination_zip && draft.destination_zip.trim());
    if (!originOk) e.origin = "Origin city/state or ZIP required";
    if (!destOk) e.destination = "Destination city/state or ZIP required";
    // Email/phone format are ADVISORY: a malformed value shows an inline hint
    // in the edit modal but must NOT hard-block saves/actions. A single bad
    // field otherwise traps the user in a 'Fix validation errors' loop where
    // they can't save or even correct it.
    const email = (draft.email || "").trim();
    const phone = (draft.phone || "").trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = "Invalid email";
    if (phone && !/^[\d ()+-]{7,}$/.test(phone)) e.phone = "Invalid phone";
    setErrors(e);
    return e;
  }
  // Fields whose absence is required before a save/action may proceed. Email
  // and phone format are intentionally NOT here (advisory only).
  const BLOCKING_FIELDS = ["carrier_pay", "name", "origin", "destination"];
  async function saveGuarded(patch, msg) {
    const e = validate();
    const blocking = BLOCKING_FIELDS.filter((k) => e[k]);
    if (blocking.length) { setMsg({ ok: false, kind: "warn", text: "Fix required fields before saving." }); return; }
    return save(patch, msg);
  }
  // ---- Part 2 loaders ----
  async function loadVehicles(leadId) {
    try { const r = await api("/api/crm/vehicles?lead_id=" + leadId); setVehicles(r.vehicles || []); } catch {}
  }
  async function loadSalesActivity(leadId) {
    try { const r = await api("/api/crm/activity?lead_id=" + leadId); setActivity(r.activity || []); } catch {}
  }
  async function loadChanges(leadId) {
    try { const r = await api("/api/crm/changelog?lead_id=" + leadId); setChanges(r.changes || []); } catch {}
  }
  async function loadBooking(leadId) {
    try { const r = await api("/api/crm/booking?lead_id=" + leadId); setBookingEvents(r.events || []); } catch {}
  }
  // Unified timeline (spec #12): newest first across all event types
  const timeline = []
    .concat((activity||[]).map((a) => ({ when: a.created_at, type: "activity:" + (a.kind||""), text: (a.detail||a.kind||"") })))
    .concat((changes||[]).map((c) => ({ when: c.created_at, type: "change:" + (c.field||""), text: `${c.field}: ${c.old_value ?? "—"} → ${c.new_value ?? "—"}` })))
    .concat((pricing||[]).map((pr) => ({ when: pr.created_at, type: "pricing", text: `Tariff ${pr.old_total_tariff ?? "—"} → ${pr.total_tariff ?? "—"}` })))
    .concat((bookingEvents||[]).map((b) => ({ when: b.created_at, type: "booking:" + (b.state||""), text: (b.detail||b.state||"") })))
    .concat((tasks||[]).map((t) => ({ when: t.created_at, type: "task", text: `Task: ${t.title}` })))
    .concat((notes||[]).map((n) => ({ when: n.created_at, type: "note:" + (n.kind||""), text: (n.body||"").slice(0,60) })))
    .sort((a, b) => new Date(b.when) - new Date(a.when));
  async function decodeVin() {
    if (vinInput.trim().length < 11) return;
    try {
      const r = await api("/api/crm/vin?vin=" + encodeURIComponent(vinInput.trim()));
      await api("/api/crm/vehicles", { method: "POST", body: JSON.stringify({ lead_id: openId, vin: vinInput.trim(), year: r.year || null, make: r.make || null, model: r.model || null, type: vehType(r.body) }) });
      setVinInput(""); loadVehicles(openId);
    } catch {}
  }
  // Look up city/state from a ZIP. `which` is "origin" or "destination".
  // Restores a dropped leading zero on 4-digit zips (e.g. 6610 -> 06610).
  async function lookupZip(which) {
    const zipRaw = (draft[which + "_zip"] || "").trim();
    if (!/^\d{4,5}$/.test(zipRaw)) { setMsg({ ok: false, text: "Enter a valid ZIP first." }); return; }
    setBusy(true);
    try {
      const r = await api("/api/crm/zip?zip=" + encodeURIComponent(zipRaw));
      if (r.error) { setMsg({ ok: false, text: r.error }); return; }
      setDraft((prev) => ({ ...prev, [which + "_zip"]: r.zip, [which + "_city"]: r.city, [which + "_state"]: r.state }));
      setMsg({ ok: true, text: `${which === "origin" ? "Pickup" : "Delivery"}: ${r.city}, ${r.state} (${r.zip})` });
    } catch (e) {
      setMsg({ ok: false, text: e.message || "ZIP lookup failed." });
    } finally {
      setBusy(false);
    }
  }
  // Auto-resolve city/state from a ZIP on lead open (and save when it fills a
  // gap). Only fires when a ZIP exists but the city/state is empty. By design
  // it NEVER overwrites an existing city/state — set `force` to re-look-up
  // even when those are populated (the manual "Run ZIP" button uses force).
  // `src` is the lead object to read from (defaults to current `draft`) so the
  // open-lead path can pass the freshly-loaded `d` before React commits state.
  async function autoLookupZip(which, { force = false, saveIfChanged = false, src = draft } = {}) {
    const targetId = openId;
    const zipRaw = (src[which + "_zip"] || "").trim();
    if (!/^\d{4,5}$/.test(zipRaw)) return;
    const hasCityState = src[which + "_city"] && src[which + "_state"];
    if (!force && hasCityState) return;
    try {
      const r = await api("/api/crm/zip?zip=" + encodeURIComponent(zipRaw));
      if (r.error) return;
      // Only bail if the user navigated to a different lead mid-flight — never
      // on the same lead (a stale ZIP-compare guard caused the "open twice"
      // bug where the autosave round-trip changed draft before the fetch returned).
      if (openId !== targetId) return;
      const changed = !hasCityState && r.city && r.state;
      setDraft((prev) => ({ ...prev, [which + "_zip"]: r.zip, [which + "_city"]: r.city, [which + "_state"]: r.state }));
      // Persist immediately — no Save button needed. The autosave effect also
      // captures this, but an explicit PATCH guarantees it's stored now.
      if (saveIfChanged && changed) {
        await api("/api/crm/leads", { method: "PATCH", body: JSON.stringify({ id: openId, [which + "_zip"]: r.zip, [which + "_city"]: r.city, [which + "_state"]: r.state }) });
      }
    } catch { /* best-effort */ }
  }
  // Manual force button on the Route card: re-look-up both sides from ZIP and
  // save any resolved city/state. Use this if auto-run didn't populate a gap.
  async function runZipCheck() {
    setBusy(true);
    try {
      await autoLookupZip("origin", { force: true, saveIfChanged: true });
      await autoLookupZip("destination", { force: true, saveIfChanged: true });
      setMsg({ ok: true, text: "ZIP lookup complete." });
    } catch (e) {
      setMsg({ ok: false, text: e.message || "ZIP lookup failed." });
    } finally {
      setBusy(false);
    }
  }
  async function saveVehicle(v) { await api("/api/crm/vehicles", { method: "PATCH", body: JSON.stringify(v) }); loadVehicles(openId); }
  function closeVehModal() { setEditingVeh(null); setVehDraft(null); setVehMsg(null); }
  async function saveVehDraft() {
    if (!vehDraft) return;
    setVehSaving(true);
    setVehMsg(null);
    try {
      await saveVehicle(vehDraft);
      setVehMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setVehMsg({ ok: false, text: e.message || "Save failed." });
    } finally {
      setVehSaving(false);
    }
  }
  async function delVehicle(id) { await api("/api/crm/vehicles", { method: "DELETE", body: JSON.stringify({ id }) }); loadVehicles(openId); }
  async function dupVehicle(v) { const { id, ...rest } = v; await api("/api/crm/vehicles", { method: "POST", body: JSON.stringify({ lead_id: openId, ...rest }) }); loadVehicles(openId); }
  async function saveTaskFull(t) {
    if (t.id) await api("/api/crm/tasks", { method: "PATCH", body: JSON.stringify(t) });
    else await api("/api/crm/tasks", { method: "POST", body: JSON.stringify({ lead_id: openId, ...t }) });
    setEditingTask(null); loadPhase3(openId);
  }
  async function loadPhase3(leadId) {
    try {
      const [t, n, d, pr] = await Promise.all([
        api("/api/crm/tasks?lead_id=" + leadId),
        api("/api/crm/notes?lead_id=" + leadId),
        api("/api/crm/documents?lead_id=" + leadId),
        api("/api/crm/pricing?lead_id=" + leadId),
      ]);
      setTasks(t.tasks || []); setNotes(n.notes || []);
      setDocuments(d.documents || []); setPricing(pr.pricing || []);
    } catch {}
  }
  async function addTask() {
    if (!newTask.trim()) return;
    await api("/api/crm/tasks", { method: "POST", body: JSON.stringify({ lead_id: openId, title: newTask, type: "follow_up" }) });
    setNewTask(""); loadPhase3(openId);
  }
  async function toggleTask(id, done) {
    await api("/api/crm/tasks", { method: "PATCH", body: JSON.stringify({ id, done: !done }) });
    loadPhase3(openId);
  }
  async function delTask(id) {
    await api("/api/crm/tasks", { method: "DELETE", body: JSON.stringify({ id }) });
    loadPhase3(openId);
  }
  async function addNote() {
    if (!newNote.trim()) return;
    await api("/api/crm/notes", { method: "POST", body: JSON.stringify({ lead_id: openId, body: newNote, kind: noteKind }) });
    setNewNote(""); loadPhase3(openId);
  }
  async function delNote(id) {
    await api("/api/crm/notes", { method: "DELETE", body: JSON.stringify({ id }) });
    loadPhase3(openId);
  }
  async function delDoc(id) {
    await api("/api/crm/documents", { method: "DELETE", body: JSON.stringify({ id }) });
    loadPhase3(openId);
  }
  // Payments
  async function loadPayments(leadId) {
    try { const r = await api("/api/crm/payments?lead_id=" + leadId); setPayments(r.payments || []); return r.payments || []; } catch { return []; }
  }
  // Refunds/Chargebacks dashboard: every reversed payment for this agent.
  async function loadRefunds() {
    try { const r = await api("/api/crm/payments?refunds=1"); setRefunds(r.payments || []); } catch { setRefunds([]); }
  }
  function openAddPayment() {
    setEditingPayment(null);
    // Pre-fill Amount with the outstanding broker fee (Due) so the user can
    // just confirm/edit it — matches the Broker Earnings card. Direction
    // defaults to customer_broker (the payment that clears the broker fee).
    const bf = draft.total_tariff !== "" && draft.carrier_pay !== "" && draft.total_tariff != null && draft.carrier_pay != null
      ? Number(draft.total_tariff) - Number(draft.carrier_pay) : null;
    const bc = (payments || [])
      .filter((p) => String(p.direction || "").toLowerCase() === "customer_broker" && p.confirmed !== false)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const due = bf != null ? Math.max(0, bf - bc) : null;
    const seed = due != null ? String(Math.round(due * 100) / 100) : "";
    setPaymentForm({ payment_date: new Date().toISOString().slice(0, 10), type: "ach", direction: "customer_broker", amount: seed, identification: "", notes: "", refunded: false, refund_type: "refund", refund_reason: "", refund_date: new Date().toISOString().slice(0, 10), refund_ref: "" });
    setPaymentModal(true);
  }
  function openEditPayment(p) {
    setEditingPayment(p.id);
    setPaymentForm({ payment_date: String(p.payment_date || "").slice(0, 10), type: p.type || "ach", direction: p.direction || "customer_broker", amount: p.amount != null ? String(p.amount) : "", identification: p.identification || "", notes: p.notes || "", refunded: !!p.refunded, refund_type: p.refund_type || "refund", refund_reason: p.refund_reason || "", refund_date: String(p.refund_date || p.payment_date || "").slice(0, 10), refund_ref: p.refund_ref || "" });
    setPaymentModal(true);
  }
  async function delPayment(id) {
    if (!confirm("Delete this payment?")) return;
    await api("/api/crm/payments/" + id, { method: "DELETE" });
    loadPayments(openId);
  }
  // Auto-create (or refresh) the draft broker-fee payment for this lead so it
  // shows on the Broker Earnings card immediately and is editable in the
  // Payments tab. It is created UNCONFIRMED so it does not count toward
  // Collected until the agent confirms it in the modal.
  // Params (all optional) let openLead call this with freshly-loaded values,
  // since component state (draft/payments) hasn't updated yet at that point.
  async function ensureBrokerDraft(leadId = openId, brokerFee = null, pays = null) {
    if (!leadId) return;
    const list = pays || payments || [];
    const bf = brokerFee != null
      ? brokerFee
      : (draft.total_tariff !== "" && draft.carrier_pay !== "" && draft.total_tariff != null && draft.carrier_pay != null
          ? Number(draft.total_tariff) - Number(draft.carrier_pay) : null);
    if (bf == null || bf <= 0) {
      // No broker fee — drop any stale unconfirmed draft we created.
      const stale = list.filter((p) => p.is_broker_fee && !p.confirmed);
      for (const p of stale) { try { await api("/api/crm/payments/" + p.id, { method: "DELETE" }); } catch {} }
      if (stale.length) loadPayments(leadId);
      return;
    }
    const existing = list.find((p) => p.is_broker_fee);
    if (existing) {
      // Keep the draft amount in sync only while it's still unconfirmed — a
      // confirmed broker payment reflects a real collection, so don't mutate it.
      // Matching on ANY is_broker_fee (not just unconfirmed) guarantees we never
      // create a second broker-fee record just because the draft got confirmed.
      if (!existing.confirmed) {
        const amt = Math.round(bf * 100) / 100;
        if (Math.abs(Number(existing.amount) - amt) > 0.005) {
          try { await api("/api/crm/payments/" + existing.id, { method: "PATCH", body: JSON.stringify({ amount: amt }) }); loadPayments(leadId); } catch {}
        }
      }
      return;
    }
    try {
      await api("/api/crm/payments", {
        method: "POST",
        body: JSON.stringify({
          lead_id: leadId,
          payment_date: new Date().toISOString().slice(0, 10),
          type: "ach",
          direction: "customer_broker",
          amount: Math.round(bf * 100) / 100,
          identification: "",
          notes: "Auto broker fee",
          confirmed: false,
          is_broker_fee: true,
        }),
      });
      loadPayments(leadId);
    } catch {}
  }
  // Set a payment's lifecycle status from the Payments-card dropdown.
  // pending  -> unconfirmed (not yet counted as collected)
  // paid     -> confirmed (counts toward Broker Collected)
  // refunded -> reversed: kept in history with status "Refunded", excluded from totals
  async function setPaymentStatus(id, status) {
    if (status === "chargeback") {
      // Entering chargeback lifecycle: mark reversed + status New.
      return setChargebackStatus(id, "New");
    }
    const body = status === "paid"
      ? { confirmed: true, refunded: false }
      : status === "refunded"
        ? { confirmed: false, refunded: true, refund_type: "refund" }
        : { confirmed: false, refunded: false };
    try {
      await api("/api/crm/payments/" + id, { method: "PATCH", body: JSON.stringify(body) });
      loadPayments(openId);
      const label = status === "refunded" ? "Payment refunded." : status === "paid" ? "Payment marked paid." : "Payment set to pending.";
      setMsg({ ok: true, text: label });
    } catch (e) { setMsg({ ok: false, text: e.message || "Update failed." }); }
  }
  async function setChargebackStatus(id, cbStatus) {
    try {
      await api("/api/crm/payments/" + id, { method: "PATCH", body: JSON.stringify({ chargeback_status: cbStatus }) });
      loadPayments(openId);
      const label = cbStatus === "Won" ? "Chargeback won — amount recovered." : cbStatus === "Lost" ? "Chargeback lost." : cbStatus === "Fighting" ? "Chargeback under dispute." : "Chargeback opened.";
      setMsg({ ok: true, text: label });
    } catch (e) { setMsg({ ok: false, text: e.message || "Update failed." }); }
  }
  async function savePayment() {
    if (!(Number(paymentForm.amount) > 0)) return;
    const refunded = !!paymentForm.refunded;
    const body = {
      lead_id: openId,
      payment_date: paymentForm.payment_date || new Date().toISOString().slice(0, 10),
      type: paymentForm.type,
      direction: paymentForm.direction,
      amount: Number(paymentForm.amount),
      identification: paymentForm.identification || null,
      notes: paymentForm.notes || null,
      refunded,
      refund_type: refunded ? (paymentForm.refund_type || "refund") : null,
      refund_reason: refunded ? (paymentForm.refund_reason || null) : null,
      refund_date: refunded ? (paymentForm.refund_date || new Date().toISOString().slice(0, 10)) : null,
      refund_ref: refunded ? (paymentForm.refund_ref || null) : null,
    };
    if (editingPayment) {
      await api("/api/crm/payments/" + editingPayment, { method: "PATCH", body: JSON.stringify(body) });
    } else {
      await api("/api/crm/payments", { method: "POST", body: JSON.stringify(body) });
    }
    setPaymentModal(false); setEditingPayment(null);
    loadPayments(openId);
    setMsg({ ok: true, text: editingPayment ? "Payment updated." : "Payment recorded." });
  }

  // ---- Text Templates (SMS drafts) ----
  // Render a template body by substituting the current quote/order's fields.
  // Falls back to a readable placeholder (not the raw {{token}}) when a value
  // is missing, so the broker never sends an unresolved variable.
  function renderTemplate(body) {
    const L = (c, st, z) => loc(c, st, z);
    const map = {
      "{{customer_name}}": draft.name || open?.name || "—",
      "{{agent_name}}": data?.agent?.name || "—",
      "{{agent_phone}}": data?.agent?.phone || "—",
      "{{company_name}}": data?.agent?.company || "—",
      "{{quote_id}}": open?.id ?? "—",
      "{{order_id}}": open?.order_number || open?.id || "—",
      "{{quote_amount}}": tNum != null ? "$" + tNum.toFixed(2) : "—",
      "{{broker_fee}}": brokerFee != null ? "$" + brokerFee.toFixed(2) : "—",
      "{{broker_due}}": brokerDue != null ? "$" + brokerDue.toFixed(2) : "—",
      "{{pickup_date}}": draft.pickup_date ? String(draft.pickup_date).slice(0, 10) : "—",
      "{{delivery_date}}": draft.desired_delivery_date ? String(draft.desired_delivery_date).slice(0, 10) : "—",
      "{{booking_link}}": open?.booking_token ? `${data.site}/book/${open.booking_token}` : "—",
      "{{origin}}": L(draft.origin_city, draft.origin_state, draft.origin_zip),
      "{{destination}}": L(draft.destination_city, draft.destination_state, draft.destination_zip),
      "{{vehicle}}": open ? vehSummary(open) : "—",
      "{{status}}": open ? displayStatus(open) : "—",
    };
    return String(body).replace(/\{\{[^}]+\}\}/g, (m) => (m in map ? map[m] : "—"));
  }
  // ---- Invoice ----
  // The Invoice button always generates a real PDF now (lib/pdfInvoice.js
  // for a mapped PDF template, lib/htmlInvoice.js for an HTML template or
  // the Scherz Trucking INC default) via /api/crm/invoice/generate -- there's no more
  // token-based text-template picker to fall back to.
  function closeInvoice() {
    if (pdfInvoiceUrl) { URL.revokeObjectURL(pdfInvoiceUrl); setPdfInvoiceUrl(null); }
    setInvoiceOpen(null);
    setInvoiceHistory([]);
    setInvoiceError(null);
  }
  async function loadInvoiceHistory() {
    try { const r = await api(`/api/crm/invoice/history?lead_id=${openId}`); setInvoiceHistory(r.invoices || []); } catch { setInvoiceHistory([]); }
  }
  async function downloadPastInvoice(invoiceId, orderNumber) {
    try {
      const token = await getFreshToken("crm");
      const res = await fetch(`/api/crm/invoice/${invoiceId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${orderNumber || openId}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  }
  async function openInvoiceFlow() {
    if (invoiceOpen) { closeInvoice(); return; }
    setInvoiceOpen(true);
    setInvoiceError(null);
    setInvoiceLoading(true);
    loadInvoiceHistory();
    try {
      const token = await getFreshToken("crm");
      const res = await fetch("/api/crm/invoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: openId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Invoice generation failed");
      }
      const blob = await res.blob();
      setPdfInvoiceUrl(URL.createObjectURL(blob));
    } catch (e) {
      setInvoiceError(e.message);
    } finally {
      setInvoiceLoading(false);
    }
  }
  function copy(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    setMsg({ ok: true, text: "Copied to clipboard." });
  }
  async function loadTemplates() {
    try {
      const r = await api("/api/crm/templates");
      setTmplList(r.templates || []);
    } catch { setTmplList([]); }
  }
  function openTextModal() {
    setTmplSearch(""); setTmplExpanded(null); setTmplMoreId(null); setTmplEdit(null);
    setTextModal(true); loadTemplates();
  }
  async function tmplSave() {
    if (!tmplEdit || !tmplEdit.name.trim() || !tmplEdit.body.trim()) { setMsg({ ok: false, text: "Name and message are required." }); return; }
    try {
      if (tmplEdit.id) {
        await api("/api/crm/templates", { method: "PATCH", body: JSON.stringify({ id: tmplEdit.id, name: tmplEdit.name, body: tmplEdit.body, category: tmplEdit.category }) });
      } else {
        await api("/api/crm/templates", { method: "POST", body: JSON.stringify({ name: tmplEdit.name, body: tmplEdit.body, category: tmplEdit.category }) });
      }
      setTmplEdit(null);
      await loadTemplates();
    } catch (e) { setMsg({ ok: false, text: "Save failed: " + e.message }); }
  }
  async function tmplDelete(id) {
    if (!confirm("Delete this template?")) return;
    try { await api("/api/crm/templates", { method: "DELETE", body: JSON.stringify({ id }) }); setTmplList((l) => l.filter((t) => t.id !== id)); if (tmplExpanded === id) setTmplExpanded(null); if (tmplMoreId === id) setTmplMoreId(null); }
    catch (e) { setMsg({ ok: false, text: "Delete failed: " + e.message }); }
  }
  async function tmplDuplicate(t) {
    try { await api("/api/crm/templates", { method: "POST", body: JSON.stringify({ name: t.name + " (copy)", body: t.body, category: t.category }) }); await loadTemplates(); }
    catch (e) { setMsg({ ok: false, text: "Duplicate failed: " + e.message }); }
  }
  function tmplApply(t) {
    const msg = renderTemplate(t.body);
    setComposer(msg);
    setTextModal(false);
    setMsg({ ok: true, kind: "info", text: "Message ready — review in the composer below, then send." });
  }

  useEffect(() => {
    (async () => {
      try {
        if (await enforceStaySignedIn("crm")) return;
        const token = await getFreshToken("crm");
        if (token) { await load(); logActivity("login"); }
      } catch { /* login */ } finally { setCheckingSession(false); }
    })();
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 35000);
    return () => clearTimeout(t);
  }, [msg]);


  async function tryLogin(e) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const supabase = getSupabase("crm");
      if (!supabase) throw new Error("Service unavailable");
      const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !auth?.session?.access_token) throw new Error("Incorrect email or password.");
      applyStaySignedIn(staySignedIn, "crm");
      await load();
    } catch (err) { setError(err.message || "Sign-in failed"); } finally { setSubmitting(false); }
  }
  async function signOut() {
    try { await getSupabase("crm")?.auth.signOut(); }
    finally { setData(null); setPassword(""); setOpenId(null); }
  }
  function openLead(l) {
    setOpenId(l.id); setMsg(null);
    const d = {};
    for (const f of EDITABLE) {
      const v = l[f];
      d[f] = v == null ? "" : (["quote_expiration", "pickup_date", "follow_up_date", "desired_delivery_date"].includes(f) ? String(v).slice(0, 10) : v);
    }
    // Auto-fill quote expiration to 30 days after the ship date when unset
    // (editable). Keeps quotes valid for a month by default.
    if (!d.quote_expiration && d.pickup_date) {
      const exp = new Date(d.pickup_date + "T00:00:00");
      exp.setDate(exp.getDate() + 30);
      d.quote_expiration = exp.toISOString().slice(0, 10);
    }
    skipAutosave.current = true;
    setSaveState("saved");
    setErrors({});
    setDraft(d);
    // Auto-resolve city/state from ZIP on open — but only for My Leads, and
    // only when a ZIP exists without a city/state. Pass the freshly-loaded `d`
    // as the source since React state isn't committed yet at this point.
    if (section === "leads") {
      autoLookupZip("origin", { saveIfChanged: true, src: d });
      autoLookupZip("destination", { saveIfChanged: true, src: d });
    }
    loadDispatch(l.id);
    loadNotifications();
    loadPhase3(l.id);
    loadVehicles(l.id);
    loadSalesActivity(l.id);
    loadChanges(l.id);
    loadBooking(l.id);
    loadPayments(l.id); // populate Payments tab + Broker Collected (no auto-create)
  }
  const setD = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });

  async function save(extra = {}, note) {
    setBusy(true); setMsg(null);
    try {
      // Normalize whitespace on free-text contact fields so a stray trailing
      // space (from paste) is never persisted and re-flags validation later.
      const clean = {
        ...draft,
        name: draft.name != null ? String(draft.name).trim() : draft.name,
        email: draft.email != null ? String(draft.email).trim() : draft.email,
        phone: draft.phone != null ? String(draft.phone).trim() : draft.phone,
        alt_phone: draft.alt_phone != null ? String(draft.alt_phone).trim() : draft.alt_phone,
      };
      const out = await api("/api/crm/leads", { method: "PATCH", body: JSON.stringify({ id: openId, ...clean, ...extra }) });
      await load();
      // Create the broker-fee draft ONCE, only when converting a quote to an
      // order — never on a plain save, and never on page open (openLead no
      // longer calls this). Idempotent: it won't duplicate an existing draft.
      if (extra.status === "booked") await ensureBrokerDraft();
      let text = note || (isOrder ? "Order saved." : "Quote saved.");
      if (out.quote_email === "sent") text = "Quote emailed to the customer.";
      if (out.quote_email === "no_customer_email") text = "No customer email on file — quote not emailed.";
      if (out.quote_email === "failed") text = "Saved — quote email could not be delivered (sending domain not verified yet).";
      setMsg({ ok: true, text });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  async function dispatchAction(action, extra = {}) {
    setDispatchBusy(true);
    try {
      const out = await api("/api/crm/dispatch", { method: "POST", body: JSON.stringify({ lead_id: openId, action, ...extra }) });
      if (!out.success) throw new Error("Action failed");
      await loadDispatch(openId);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setDispatchBusy(false); }
  }

  if (!data) {
    return (
      <div className="crm-login">
        <div className="crm-login-left">
          <h1>Work your leads, close more shipments</h1>
          <p className="crm-login-sub">Price the lead, send the quote, and book the order — all from one screen.</p>
          <ul>
            <li><b>Live lead drops</b><span>New leads are assigned to you in rotation, with an email alert.</span></li>
            <li><b>One-click quoting</b><span>Price the lead and the quote email goes to the customer for you.</span></li>
            <li><b>Booking &amp; e-sign</b><span>Send a link for the customer to add addresses and sign the agreement.</span></li>
          </ul>
        </div>
        <div className="crm-login-right">
          <form className="crm-login-card" onSubmit={tryLogin}>
            <div className="crm-logo"><img src="/logo.png" alt="" width={28} height={28} className="crm-logo-img" />Scherz Trucking INC <em>CRM</em></div>
            <h2>Welcome back</h2>
            <label>Email</label>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>Password</label>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className="stay-signed">
              <input type="checkbox" checked={staySignedIn} onChange={(e) => setStaySignedIn(e.target.checked)} /> Stay signed in
            </label>
            <button type="submit" disabled={submitting || checkingSession}>
              {submitting ? "Signing in..." : checkingSession ? "Checking session..." : "Login"}
            </button>
            {error && <p className="crm-err">{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  const leads = data.leads || [];
  const open = openId ? leads.find((l) => l.id === openId) : null;
  const brokerFee = draft.total_tariff !== "" && draft.carrier_pay !== "" && draft.total_tariff != null && draft.carrier_pay != null
    ? Number(draft.total_tariff) - Number(draft.carrier_pay) : null;
  const tNum = draft.total_tariff !== "" && draft.total_tariff != null ? Number(draft.total_tariff) : null;
  const marginPct = brokerFee != null && tNum && tNum > 0 ? (brokerFee / tNum) * 100 : null;
  const remainingBalance = tNum != null && draft.deposit !== "" && draft.deposit != null ? tNum - Number(draft.deposit) : (tNum != null ? tNum : null);
  const isOrder = open && ["booked", "closed"].includes(open.status);

  // Broker payment figures are DERIVED from the payment records, never read
  // from the stored columns — those are only refreshed when a payment changes,
  // so a priced order with no payments yet would wrongly read "Due $0".
  // Recomputing here means the card is correct immediately and updates the
  // moment a payment is added, edited or deleted (loadPayments refreshes it).
  // Only CONFIRMED customer→broker payments count as collected. The auto-created
  // broker-fee draft is unconfirmed (confirmed === false) so it shows in the
  // Payments tab, ready to edit, without prematurely marking the fee collected.
  const brokerCollected = (payments || [])
    .filter((p) => String(p.direction || "").toLowerCase() === "customer_broker" && p.confirmed !== false && !p.refunded)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const brokerRefunded = (payments || [])
    .filter((p) => p.refunded && (p.refund_type || "refund") !== "chargeback")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const brokerChargebacks = (payments || [])
    .filter((p) => p.refunded && p.refund_type === "chargeback")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const brokerNet = Math.max(0, brokerCollected - brokerRefunded - brokerChargebacks);
  const brokerDue = brokerFee != null ? Math.max(0, brokerFee - brokerCollected) : null;
  // Keep this in lockstep with recomputeBroker() in the payments API so the
  // live card matches the stored broker_payment_status column.
  const brokerStatus =
    brokerFee == null
      ? "Unpaid"
      : brokerFee <= 0
        ? "Paid" // nothing to collect
        : brokerDue <= 0.005
          ? "Paid"
          : brokerCollected > 0.005
            ? "Partial"
            : "Unpaid";

  // Contextual status shown in the action bar's left area when there's no
  // active notification — useful lifecycle info instead of a static "Saved".
  const quoteDaysLeft = draft.quote_expiration
    ? Math.ceil((new Date(draft.quote_expiration + "T00:00:00") - new Date()) / 86400000)
    : null;
  const contextStatus = (() => {
    if (!open) return "";
    if (isOrder) {
      const map = {
        "Searching For Carriers": "Waiting for dispatch",
        "Carrier Assigned": "Carrier Assigned",
        "Dispatched": "Dispatched",
        "Picked Up": "Picked Up",
        "In Transit": "In Transit",
        "Delivered": "Delivered",
      };
      let s = map[open.secondary_status] || (open.status === "booked" ? "Booked" : open.secondary_status || "Booked");
      if (brokerStatus === "Paid") s += " · Paid";
      else if (brokerStatus === "Partial") s += " · Partial";
      else if (brokerStatus === "Unpaid" && brokerFee > 0) s += " · Payment Due";
      return s;
    }
    if (open.status === "quoted") {
      let s = "Quoted";
      if (quoteDaysLeft != null) s += quoteDaysLeft >= 0 ? ` · expires in ${quoteDaysLeft}d` : " · expired";
      return s;
    }
    if (["new", "assigned", "contacted"].includes(open.status)) return "Draft";
    return open.status;
  })();


  // then apply search, filters, sort, and pagination client-side.
  const bucketOf = (l) => (["booked", "closed"].includes(l.status) ? "orders" : l.status === "quoted" ? "quotes" : "leads");
  // What the Status column shows: the sales/working status the rep set on the
  // record (VM, Hot, Warm…), falling back to the lifecycle status when none is
  // set. Used by the table, the status filter and sorting so all three agree.
  const displayStatus = (l) => l.secondary_status || l.status;
  const counts = { leads: 0, quotes: 0, orders: 0 };
  for (const l of leads) counts[bucketOf(l)]++;
  const refundCount = refunds.length;
  // §5a KPI strip — derived from existing data, no new fetch
  const kpiSets = {
    leads: [
      { label: "Assigned", value: counts.leads, sub: "in your queue", color: "var(--svc-car)" },
      { label: "Untouched", value: leads.filter((l) => bucketOf(l) === "leads" && (l.status === "new" || l.status === "assigned")).length, sub: "need first touch", color: "var(--svc-move)" },
      { label: "Contacted", value: leads.filter((l) => l.status === "contacted").length, sub: "in progress", color: "var(--svc-freight)" },
      // Conversion = this month's leads that became a broker-fee-earning order.
      { label: "Conversion", value: (() => { const now = new Date(); const inMonth = (d) => { const x = new Date(d); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth(); }; const mLeads = leads.filter((l) => l.created_at && inMonth(l.created_at)); const conv = mLeads.filter((l) => ["booked", "closed"].includes(l.status) && (Number(l.total_tariff) || 0) - (Number(l.carrier_pay) || 0) > 0); return mLeads.length ? Math.round(conv.length / mLeads.length * 100) + "%" : "—"; })(), sub: (() => { const now = new Date(); const inMonth = (d) => { const x = new Date(d); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth(); }; const mLeads = leads.filter((l) => l.created_at && inMonth(l.created_at)); const conv = mLeads.filter((l) => ["booked", "closed"].includes(l.status) && (Number(l.total_tariff) || 0) - (Number(l.carrier_pay) || 0) > 0); return `${conv.length}/${mLeads.length} leads this month`; })(), color: "var(--svc-boat)" },
    ],
    quotes: [
      { label: "Open Quotes", value: counts.quotes, sub: "active", color: "var(--svc-car)" },
      { label: "Avg Tariff", value: (() => { const q = leads.filter((l) => bucketOf(l) === "quotes" && Number(l.total_tariff)); return q.length ? "$" + Math.round(q.reduce((s, l) => s + Number(l.total_tariff), 0) / q.length) : "—"; })(), sub: "per quote", color: "var(--svc-move)" },
      { label: "Booked", value: counts.orders, sub: "converted", color: "var(--svc-freight)" },
      { label: "Win Rate", value: (counts.quotes + counts.orders) ? Math.round(counts.orders / (counts.quotes + counts.orders) * 100) + "%" : "—", sub: "quote→order", color: "var(--svc-boat)" },
    ],
    orders: [
      { label: "Booked", value: counts.orders, sub: "total", color: "var(--svc-car)" },
      // Revenue = the broker fee the company actually earns (tariff − carrier
      // pay) on this year's orders — NOT the gross shipment amount, which is
      // mostly the carrier's money and isn't the broker's revenue.
      { label: "Revenue", value: (() => { const yr = new Date().getFullYear(); const o = leads.filter((l) => bucketOf(l) === "orders" && new Date(l.closed_at || l.created_at).getFullYear() === yr); const earned = o.reduce((s, l) => s + Math.max(0, (Number(l.total_tariff) || 0) - (Number(l.carrier_pay) || 0)), 0); return earned ? "$" + earned.toLocaleString() : "—"; })(), sub: new Date().getFullYear() + " broker earnings", color: "var(--svc-move)" },
      { label: "Closed", value: leads.filter((l) => l.status === "closed").length, sub: "delivered", color: "var(--svc-freight)" },
      { label: "Active", value: leads.filter((l) => l.status === "booked").length, sub: "in transit", color: "var(--svc-boat)" },
      { label: "Broker Earnings", value: (() => { const o = leads.filter((l) => bucketOf(l) === "orders"); const earned = o.reduce((s, l) => s + Math.max(0, (Number(l.total_tariff) || 0) - (Number(l.carrier_pay) || 0)), 0); return earned ? "$" + earned.toLocaleString() : "—"; })(), sub: (() => { const o = leads.filter((l) => bucketOf(l) === "orders"); const earned = o.reduce((s, l) => s + Math.max(0, (Number(l.total_tariff) || 0) - (Number(l.carrier_pay) || 0)), 0); const collected = o.reduce((s, l) => s + (Number(l.broker_collected) || 0), 0); const due = Math.max(0, earned - collected); return "collected $" + collected.toLocaleString() + " · due $" + due.toLocaleString(); })(), color: "var(--svc-move)" },
      { label: "Refunds / Chargebacks", value: (() => { const o = leads.filter((l) => bucketOf(l) === "orders"); const ref = o.reduce((s, l) => s + (Number(l.broker_refunded) || 0), 0) + o.reduce((s, l) => s + (Number(l.broker_chargebacks) || 0), 0); return ref ? "$" + ref.toLocaleString() : "—"; })(), sub: (() => { const o = leads.filter((l) => bucketOf(l) === "orders"); const cb = o.filter((l) => (Number(l.broker_refunded) || 0) + (Number(l.broker_chargebacks) || 0) > 0).length; return cb ? cb + " reversed" : "none reversed"; })(), color: "var(--svc-freight)" },
      { label: "Broker Refunds (This Month)", value: refundsMonth.refunded ? "$" + Number(refundsMonth.refunded).toLocaleString() : "—", sub: refundsMonth.refunded_count ? refundsMonth.refunded_count + " refund" + (refundsMonth.refunded_count === 1 ? "" : "s") : "none this month", color: "var(--svc-move)" },
      { label: "Broker Chargebacks (This Month)", value: refundsMonth.chargebacks ? "$" + Number(refundsMonth.chargebacks).toLocaleString() : "—", sub: refundsMonth.chargebacks_count ? refundsMonth.chargebacks_count + " chargeback" + (refundsMonth.chargebacks_count === 1 ? "" : "s") : "none this month", color: "var(--svc-boat)" },
    ],
  };
  const kpis = kpiSets[section] || kpiSets.leads;

  const searchText = (l) =>
    [l.id, l.name, l.phone, l.email, l.origin_city, l.origin_state, l.destination_city, l.destination_state, vehSummary(l)]
      .filter(Boolean).join(" ").toLowerCase();

  const filtered = leads
    .filter((l) => bucketOf(l) === section)
    .filter((l) => !search || searchText(l).includes(search.toLowerCase()))
    .filter((l) => !fOrigin || (l.origin_state || "").toUpperCase() === fOrigin.toUpperCase())
    .filter((l) => !fDest || (l.destination_state || "").toUpperCase() === fDest.toUpperCase())
    .filter((l) => !fStatus || displayStatus(l) === fStatus);

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === "total_tariff") { av = Number(av) || 0; bv = Number(bv) || 0; }
    // Sort the Status column by the value actually shown in it.
    else if (sortKey === "status") { av = displayStatus(a); bv = displayStatus(b); }
    else { av = av == null ? "" : String(av); bv = bv == null ? "" : String(bv); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const statusesInBucket = [...new Set(leads.filter((l) => bucketOf(l) === section).map(displayStatus))];

  function sortBy(key) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }
  function exportCsv() {
    const cols = ["id", "created_at", "name", "phone", "email", "origin_city", "origin_state", "origin_zip",
      "destination_city", "destination_state", "destination_zip", "pickup_date", "total_tariff", "carrier_pay", "status"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.join(",")].concat(sorted.map((l) => cols.map((c) => esc(l[c])).join(",")));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${section}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const SortTh = ({ k, children }) => (
    <th className="crm-sortable" onClick={() => sortBy(k)}>
      {children}{sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  
  function input8(v, setter) { return <input className="crm-input" value={v || ""} onChange={setter} />; }


  // Redesign: collapsible card state (remembered)
  const toggleCard = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const money = (n) => (n == null || n === "" || Number.isNaN(Number(n))) ? "—" : "$" + Number(n).toFixed(2);
  const cNum = draft.carrier_pay !== "" && draft.carrier_pay != null ? Number(draft.carrier_pay) : null;
  const mileageEst = draft.distance_miles ? draft.distance_miles : null;
  const driveEst = mileageEst ? Math.max(1, Math.round(mileageEst / 500)) : null;
  const suggestedCarrier = tNum != null ? Math.round(tNum * 0.7 * 100) / 100 : null;
  const marketAvg = tNum != null ? Math.round(tNum * 100) / 100 : null;
  const fuelEst = mileageEst ? Math.round(mileageEst * 0.22 * 100) / 100 : null;
  const profitPct = brokerFee != null && tNum ? (brokerFee / tNum) * 100 : null;
  const carrierPct = cNum != null && tNum ? (cNum / tNum) * 100 : null;
  const balanceDue = tNum != null ? tNum - (draft.deposit ? Number(draft.deposit) : 0) - (draft.cod_amount ? Number(draft.cod_amount) : 0) : null;
  async function quickPrice(delta) {
    const base = tNum != null ? tNum : 0;
    const next = Math.max(0, Math.round((base + delta) * 100) / 100);
    setDraft({ ...draft, total_tariff: next });
  }
  async function marketPrice() {
    if (tNum == null) return;
    setDraft({ ...draft, total_tariff: Math.round(tNum * 1.05 * 100) / 100 });
  }
  function setCheck(col) { return (e) => setDraft({ ...draft, [col]: e.target.checked }); }
  function copy(text) { navigator.clipboard && navigator.clipboard.writeText(text); setMsg({ ok: true, text: "Copied." }); }
  async function customerAction(kind, detail) {
    await api("/api/crm/activity", { method: "POST", body: JSON.stringify({ lead_id: openId, kind, detail }) }).catch(() => {});
    loadSalesActivity(openId);
  }
  async function duplicateLead() {
    try {
      const { rows } = await api("/api/crm/leads", { method: "POST", body: JSON.stringify({ clone_id: openId }) });
      setMsg({ ok: true, text: "Lead duplicated (#" + (rows && rows.id) + ")." });
      load();
    } catch (e) { setMsg({ ok: false, text: "Duplicate failed: " + e.message }); }
  }
  async function setTag(tag) {
    const cur = Array.isArray(draft.customer_tags) ? draft.customer_tags : [];
    const next = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
    setDraft({ ...draft, customer_tags: next });
  }

return (
    <div className="crm-root">
      <div className="crm-shell" data-collapsed={railCollapsed}>
      <aside className="crm-side">
        <div className="crm-side-top">
          <div className="crm-logo"><img src="/logo.png" alt="" width={28} height={28} className="crm-logo-img" /><span className="crm-side-label">Scherz Trucking INC <em>CRM</em></span></div>
          <button className="crm-side-toggle" onClick={() => setRailCollapsed(v => !v)} aria-label="Collapse sidebar" title="Collapse">{railCollapsed ? "»" : "«"}</button>
        </div>
        <nav className="crm-side-nav">
          {[["leads", "My Leads"], ["quotes", "My Quotes"], ["orders", "My Orders"], ["refunds", "Refunds"], ["biz", "Business Inquiries"]].map(([k, label]) => (
            <button key={k} className={"crm-side-item" + (section === k && !open ? " active" : "")}
              onClick={() => { setSection(k); setOpenId(null); }}>
              <span className="crm-side-label">{label}</span>
              {k === "refunds"
                ? <span className="crm-side-count">{refundCount}</span>
                : <span className="crm-side-count">{counts[k]}</span>}
            </button>
          ))}
        </nav>
        <div className="crm-side-foot">
          <button className="crm-icon-btn" title="Search (Ctrl/Cmd+K)" onClick={() => setSearchOpen(true)}>🔍</button>
          <div className="crm-bell-wrap">
            <button className="crm-icon-btn" title="Notifications" onClick={() => { setNotifOpen(o => !o); loadNotifications(); }}>🔔{notifUnread > 0 && <span className="crm-badge">{notifUnread}</span>}</button>
            <button className="crm-icon-btn" title="Feedback" onClick={() => setFeedbackOpen(true)}>💬</button>
            {notifOpen && (
              <div className="crm-dropdown">
                <div className="crm-dropdown-head">Notifications
                  {notifUnread > 0 && <button className="crm-link" onClick={async () => { await api("/api/crm/notifications", { method: "PATCH", body: JSON.stringify({}) }); setNotifOpen(false); loadNotifications(); }}>Mark all read</button>}
                </div>
                {notif.length === 0 && <div className="crm-muted" style={{ padding: 10 }}>No notifications.</div>}
                {notif.map((n) => (
                  <div key={n.id} className={"crm-notif" + (n.read ? "" : " unread")} onClick={async () => { await api("/api/crm/notifications", { method: "PATCH", body: JSON.stringify({ id: n.id }) }); loadNotifications(); }}>
                    <div className="crm-notif-kind">{String(n.kind).replace(/_/g, " ")}</div>
                    <div className="crm-notif-body">{typeof n.payload === "object" ? JSON.stringify(n.payload) : String(n.payload || "")}</div>
                    <div className="crm-muted" style={{ fontSize: 11 }}>{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="crm-side-label crm-side-user">{data.agent.name} · {data.agent.company}</span>
          <button className="crm-side-signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="crm-main">

      {!open && section === "biz" ? (
        <BizInquiriesView api={api} />
      ) : !open && section !== "refunds" ? (
        <div className="crm-list">
          <div className="crm-kpis">
            {kpis.map((k) => (
              <div className="crm-kpi" key={k.label} style={{ borderLeftColor: k.color }}>
                <div className="crm-kpi-l">{k.label}</div>
                <div className="crm-kpi-v">{k.value}</div>
                <div className="crm-kpi-s" style={{ color: k.color }}>{k.sub}</div>
              </div>
            ))}
          </div>
          <div className="crm-bar">
            <span className="crm-count">{section === "leads" ? "MY LEADS" : section === "quotes" ? "MY QUOTES" : "MY ORDERS"} <b>{sorted.length}</b></span>
            <button className="crm-refresh" onClick={() => load().catch(() => {})}>⟳</button>
            <input className="crm-search-box" placeholder="Search name, phone, email, city, vehicle…" value={search} onChange={(e) => { setSearch(e.target.value); }} />
            <input className="crm-filter" placeholder="Orig ST" maxLength={2} value={fOrigin} onChange={(e) => { setFOrigin(e.target.value); }} />
            <input className="crm-filter" placeholder="Dest ST" maxLength={2} value={fDest} onChange={(e) => { setFDest(e.target.value); }} />
            <select className="crm-filter" value={fStatus} onChange={(e) => { setFStatus(e.target.value); }}>
              <option value="">All statuses</option>
              {statusesInBucket.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="crm-refresh" style={{ width: "auto", padding: "0 12px", borderRadius: 6 }} onClick={exportCsv}>Export CSV</button>
          </div>
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr>
                <SortTh k="id">#</SortTh><SortTh k="created_at">Created</SortTh><SortTh k="name">Customer</SortTh>
                <SortTh k="phone">Phone</SortTh><th>Vehicles</th><th>Condition</th>
                <SortTh k="origin_state">Origin</SortTh><SortTh k="destination_state">Destination</SortTh>
                <SortTh k="pickup_date">Ship</SortTh><SortTh k="total_tariff">Tariff</SortTh><SortTh k="status">Status</SortTh>
              </tr></thead>
              <tbody>
                {sorted.length === 0 && <tr><td colSpan={11} className="crm-empty">{section === "leads" ? "No leads here." : `No ${section} match.`}</td></tr>}
                {sorted.map((l) => (
                  <tr key={l.id} className="crm-row" onClick={() => openLead(l)}>
                    <td className="mono">{l.id}</td><td>{dt(l.created_at)}</td>
                    <td className="crm-strong">{l.name}</td><td className="mono">{l.phone}</td>
                    <td>{vehSummary(l)}</td>
                    <td>{vehCondition(l) === "Runs" ? <span className="crm-run-ok">Runs</span> : <span className="crm-run-inop">{vehCondition(l)}</span>}</td>
                    <td>{loc(l.origin_city, l.origin_state, l.origin_zip)}</td>
                    <td>{loc(l.destination_city, l.destination_state, l.destination_zip)}</td>
                    <td>{l.pickup_date ? String(l.pickup_date).slice(0, 10) : "—"}</td>
                    <td className="mono">{l.total_tariff ? "$" + Number(l.total_tariff) : "—"}</td>
                    {/* Shows the rep's sales status (VM, Hot, Warm…) when set;
                        the pill keeps the lifecycle colour so Quotes/Orders
                        stay visually distinguishable. */}
                    <td><span className={`crm-pill s-${l.status}`} title={l.secondary_status ? `${l.status} · ${l.secondary_status}` : l.status}>{displayStatus(l)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !open && section === "refunds" ? (
        (() => {
          const refundTotal = refunds.reduce((s, p) => s + (Number(p.amount) || 0), 0);
          const chargebacks = refunds.filter((p) => (p.refund_type || "refund") === "chargeback").length;
          const monthCb = refunds.filter((p) => (p.refund_type || "refund") === "chargeback" && p.chargeback_status === "Fighting");
          const monthWon = refunds.filter((p) => (p.refund_type || "refund") === "chargeback" && p.chargeback_status === "Won");
          const monthLost = refunds.filter((p) => (p.refund_type || "refund") === "chargeback" && p.chargeback_status === "Lost");
          const sumAmts = (arr) => arr.reduce((s, p) => s + (Number(p.amount) || 0), 0);
          const refundKpis = [
            { label: "Total Refunded This Month", value: sumAmts(refunds.filter((p) => (p.refund_type || "refund") !== "chargeback")).toLocaleString ? "$" + sumAmts(refunds.filter((p) => (p.refund_type || "refund") !== "chargeback")).toLocaleString() : "—", sub: refunds.filter((p) => (p.refund_type || "refund") !== "chargeback").length + " refunds", color: "var(--svc-move)" },
            { label: "Total Chargebacks This Month", value: sumAmts(refunds.filter((p) => (p.refund_type || "refund") === "chargeback")) ? "$" + sumAmts(refunds.filter((p) => (p.refund_type || "refund") === "chargeback")).toLocaleString() : "—", sub: chargebacks + " chargebacks", color: "var(--svc-boat)" },
            { label: "Fighting Chargebacks", value: sumAmts(monthCb) ? "$" + sumAmts(monthCb).toLocaleString() : "—", sub: monthCb.length + " fighting", color: "var(--svc-freight)" },
            { label: "Won Chargebacks", value: sumAmts(monthWon) ? "$" + sumAmts(monthWon).toLocaleString() : "—", sub: monthWon.length + " recovered", color: "var(--svc-car)" },
            { label: "Lost Chargebacks", value: sumAmts(monthLost) ? "$" + sumAmts(monthLost).toLocaleString() : "—", sub: monthLost.length + " lost", color: "var(--svc-freight)" },
            { label: "Net Broker Earnings", value: (() => { const o = leads.filter((l) => bucketOf(l) === "orders"); const earned = o.reduce((s, l) => s + Math.max(0, (Number(l.total_tariff) || 0) - (Number(l.carrier_pay) || 0)), 0); const collected = o.reduce((s, l) => s + (Number(l.broker_collected) || 0), 0); const ref = o.reduce((s, l) => s + (Number(l.broker_refunded) || 0), 0) + o.reduce((s, l) => s + (Number(l.broker_chargebacks) || 0), 0); return "$" + Math.max(0, collected - ref).toLocaleString(); })(), sub: "collected − refunded", color: "var(--svc-car)" },
          ];
          const rCols = [["customer", "Customer"], ["order_number", "Order #"], ["refund_type", "Type"], ["amount", "Amount"], ["refund_date", "Reversal Date"], ["refund_reason", "Reason / Case #"], ["refund_ref", "Reference"], ["origin_state", "Orig"], ["destination_state", "Dest"]];
          const rFiltered = refunds.filter((p) => !search || [p.customer, p.order_number, p.refund_reason, p.refund_ref, p.refund_type].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()));
          const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const exportRefunds = () => {
            const rows = [rCols.map((c) => c[0]).join(",")].concat(rFiltered.map((p) => rCols.map((c) => esc(c[0] === "amount" ? (Number(p.amount) || 0).toFixed(2) : p[c[0]])).join(",")));
            const blob = new Blob([rows.join("\n")], { type: "text/csv" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `refunds-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
          };
          return (
            <div className="crm-list">
              <div className="crm-kpis">
                {refundKpis.map((k) => (
                  <div className="crm-kpi" key={k.label} style={{ borderLeftColor: k.color }}>
                    <div className="crm-kpi-l">{k.label}</div>
                    <div className="crm-kpi-v">{k.value}</div>
                    <div className="crm-kpi-s" style={{ color: k.color }}>{k.sub}</div>
                  </div>
                ))}
              </div>
              <div className="crm-bar">
                <span className="crm-count">REFUNDS / CHARGEBACKS <b>{rFiltered.length}</b></span>
                <button className="crm-refresh" onClick={() => loadRefunds()}>⟳</button>
                <input className="crm-search-box" placeholder="Search customer, order, reason, ref…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <button className="crm-refresh" style={{ width: "auto", padding: "0 12px", borderRadius: 6 }} onClick={exportRefunds}>Export CSV</button>
              </div>
              <div className="crm-table-wrap">
                <table className="crm-table">
                  <thead><tr>{rCols.map((c) => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
                  <tbody>
                    {rFiltered.length === 0 && <tr><td colSpan={rCols.length} className="crm-empty">No refunds or chargebacks.</td></tr>}
                    {rFiltered.map((p) => (
                      <tr key={p.id} className="crm-row" onClick={() => p.lead_id && openLead({ id: p.lead_id })}>
                        <td className="crm-strong">{p.customer || "—"}</td>
                        <td className="mono">{p.order_number || "—"}</td>
                        <td>
                          <span className={"crm-pill " + ((p.refund_type || "refund") === "chargeback" ? "s-closed cb-type" : "s-booked rf-type")}>
                            {p.refund_type === "chargeback" ? "⚡ Chargeback" : "↩ Refund"}
                            {p.refund_type === "chargeback" && p.chargeback_status ? ` · ${p.chargeback_status}` : ""}
                          </span>
                        </td>
                        <td className="mono">${Number(p.amount || 0).toFixed(2)}</td>
                        <td>{p.refund_date ? String(p.refund_date).slice(0, 10) : (p.payment_date ? String(p.payment_date).slice(0, 10) : "—")}</td>
                        <td>{p.refund_reason || "—"}</td>
                        <td>{p.refund_ref || "—"}</td>
                        <td>{p.origin_state || "—"}</td>
                        <td>{p.destination_state || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="crm-workspace">
          {/* Compact single-row header — no full-width status bar. The section
              (My Quotes / My Orders) already conveys the lifecycle stage, so we
              reclaim that vertical space to keep the whole view on one screen.
              Signature state stays as a small inline chip. */}
          <div className="crm-ws-head">
            <button className="crm-back" onClick={() => { setOpenId(null); setMsg(null); }}>← Back</button>
            <span className="crm-count">{isOrder ? "ORDER" : "QUOTE"} <b>#{open.id}</b></span>
            {open.signed_at && !open.contract_dirty && <span className="crm-pill s-booked">signed</span>}
            {open.contract_dirty && (
              <span className="crm-pill s-dead">change order</span>
            )}
            {open.contract_dirty && open.booking_token && (
              <button
                className="crm-ab co-sign"
                disabled={busy}
                title="Rotate the booking link and copy a fresh link for the customer to re-sign"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await api("/api/crm/leads", { method: "PATCH", body: JSON.stringify({ id: openId, rotate_booking_token: true }) });
                    await load();
                    const fresh = `${data.site}/book/${res?.booking_token || open.booking_token}`;
                    if (navigator.clipboard) navigator.clipboard.writeText(fresh).catch(() => {});
                    setMsg({ ok: true, text: "Change-order link rotated & copied — send it to the customer to re-sign." });
                  } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
                }}
              >🔄 Send change order for signature</button>
            )}
          </div>

          <div className="crm-cols">
            {/* LEFT 45% — Shipment + Route */}
            <div className="crm-col crm-col-l">
              <Card id="shipment" title="Shipment" right={<><span className="crm-muted">#{open.id}</span><button className="crm-ico" title="Booking" onClick={() => openModal("booking")}>📋</button><button className="crm-ico" title="Activity log" onClick={() => openModal("activitylog")}>🕘</button><button className="crm-ico" title="Edit shipment" onClick={() => openModal("shipment")}>✎</button></>}>
                <div className="crm-kv">
                  <div className="crm-kv-wide"><span>Status</span>
                    <select
                      className="crm-input crm-status-sel"
                      value={draft.secondary_status || ""}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft({ ...draft, secondary_status: v });
                        saveGuarded({ secondary_status: v }, "Status updated.");
                      }}
                    >
                      <option value="">— set status —</option>
                      {/* Orders track carrier progress only; quotes use the
                          sales-status list. */}
                      {(isOrder ? ORDER_STATUSES : QUOTE_STATUSES).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="crm-kv-wide"><span>Transport</span>
                    <select
                      className="crm-input crm-status-sel"
                      value={draft.transport_type || "Open"}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft({ ...draft, transport_type: v });
                        saveGuarded({ transport_type: v }, "Transport updated.");
                      }}
                    >
                      <option>Open</option>
                      <option>Enclosed</option>
                    </select>
                  </div>
                  <div><span>Ship Date</span><span>{draft.pickup_date ? String(draft.pickup_date).slice(0,10) : "—"}</span></div>
                  <div><span>Created</span><span>{dt(open.created_at)}</span></div>
                  <div><span>Assigned To</span><span>{data.agent.name}</span></div>
                  {(() => {
                    const url = open.booking_token ? `${data.site}/book/${open.booking_token}` : null;
                    const short = url ? url.replace(/^https?:\/\//, "") : null;
                    return (
                      <div className="crm-kv-wide crm-bk">
                        <span>Booking Link</span>
                        {short ? (
                          <span
                            className="crm-bk-url crm-copyable"
                            title={url}
                            onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {}); setMsg({ ok: true, text: "Booking link copied." }); }}
                          >{short}</span>
                        ) : (
                          <span className="crm-bk-gen" onClick={async () => {
                            setBusy(true);
                            try { await api("/api/crm/leads", { method: "PATCH", body: JSON.stringify({ id: openId, generate_booking_token: true }) }); await load(); setMsg({ ok: true, text: "Booking link created." }); }
                            catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
                          }}>create link…</span>
                        )}
                      </div>
                    );
                  })()}
                  <div><span>Quote Exp</span><span>{draft.quote_expiration ? String(draft.quote_expiration).slice(0,10) : "—"}</span></div>
                </div>
              </Card>
              <Card id="route" title="Route" right={<button className="crm-ico" title="Run ZIP lookup (fill city/state from ZIP)" onClick={() => runZipCheck()}>⌖</button>}>
                <div className="crm-route-row">
                  <span className="crm-route-ico">⌖</span>
                  <span className="crm-route-lbl">Origin</span>
                  <span className="crm-route-val crm-copyable">{loc(draft.origin_city, draft.origin_state, draft.origin_zip) || "—"}</span>
                  <button className="crm-route-copy" title="Copy origin" onClick={() => copy(loc(draft.origin_city, draft.origin_state, draft.origin_zip))}>⧉</button>
                  <button className="crm-route-edit" title="Edit origin" onClick={() => openModal("origin")}>✎</button>
                </div>
                <div className="crm-route-row">
                  <span className="crm-route-ico">⚑</span>
                  <span className="crm-route-lbl">Destination</span>
                  <span className="crm-route-val crm-copyable">{loc(draft.destination_city, draft.destination_state, draft.destination_zip) || "—"}</span>
                  <button className="crm-route-copy" title="Copy destination" onClick={() => copy(loc(draft.destination_city, draft.destination_state, draft.destination_zip))}>⧉</button>
                  <button className="crm-route-edit" title="Edit destination" onClick={() => openModal("destination")}>✎</button>
                </div>
              </Card>
            </div>

            {/* CENTER 30% — Pricing + (tabs live at bottom) */}
            <div className="crm-col crm-col-c">
              <Card id="pricing" title="Pricing" right={<><button className="crm-ico" title="Pricing history" onClick={() => openModal("pricinghistory")}>🕑</button><button className="crm-ico" title="Edit pricing" onClick={() => openModal("pricing")}>✎</button></>}>
                <div className="crm-kv">
                  <div><span>Total Tariff</span><span className="crm-strong">{tNum != null ? money(tNum) : money(draft.total_tariff)}</span></div>
                  <div><span>Carrier Pay</span><span>{cNum != null ? money(cNum) : money(draft.carrier_pay)}</span></div>
                  <div><span>Broker Fee</span><span className="crm-strong">{brokerFee != null ? money(brokerFee) : "—"}</span></div>
                  <div><span>Broker Collected</span><span className={brokerCollected > 0 ? "crm-strong crm-ok" : ""}>{money(brokerCollected)}</span></div>
                  <div><span>Broker Due</span><span className={brokerDue > 0 ? "crm-strong crm-warn" : ""}>{brokerDue != null ? money(brokerDue) : "—"}</span></div>
                  <div><span>Payment Status</span><span className={"crm-pill s-" + brokerStatus.toLowerCase()}>{brokerStatus}</span></div>
                  <div><span>Quote Exp</span><span>{draft.quote_expiration ? String(draft.quote_expiration).slice(0,10) : "—"}</span></div>
                  <div><span>Special Terms</span><span className="crm-truncate">{draft.special_terms || "—"}</span></div>
                </div>
              </Card>
              {/* Sits directly under Pricing in the same column at every
                  breakpoint (.crm-col is a flex column), so it never drifts
                  beside or below the Vehicles section. */}
              <Card id="broker" title="Broker Earnings">
                <div className="crm-kv">
                  <div><span>Broker Fee</span><span className="crm-strong">{brokerFee != null ? money(brokerFee) : "—"}</span></div>
                  <div><span>Collected</span><span className={brokerCollected > 0 ? "crm-strong crm-ok" : ""}>{money(brokerCollected)}</span></div>
                  <div><span>Refunded</span><span className={brokerRefunded > 0 ? "crm-strong crm-neg" : ""}>{money(brokerRefunded)}</span></div>
                  <div><span>Net</span><span className="crm-strong">{money(brokerNet)}</span></div>
                  <div><span>Due</span><span className={brokerDue > 0 ? "crm-strong crm-warn" : ""}>{brokerDue != null ? money(brokerDue) : "—"}</span></div>
                  <div><span>Status</span><span className={"crm-pill s-" + brokerStatus.toLowerCase()}>{brokerStatus}</span></div>
                </div>
              </Card>
              <Card id="refunds" title="Refunds / Chargebacks">
                <div className="crm-kv">
                  <div><span>Total Refunded</span><span className={brokerRefunded > 0 ? "crm-strong crm-neg" : ""}>{money(brokerRefunded)}</span></div>
                  <div><span>Total Chargebacks</span><span className={brokerChargebacks > 0 ? "crm-strong crm-neg" : ""}>{money(brokerChargebacks)}</span></div>
                  <div><span>Current Balance Impact</span><span className={brokerRefunded + brokerChargebacks > 0 ? "crm-strong crm-neg" : ""}>{brokerChargebacks + brokerRefunded > 0 ? "−" + money(brokerRefunded + brokerChargebacks) : money(0)}</span></div>
                </div>
              </Card>
            </div>

            {/* RIGHT 25% — Customer + Actions */}
            <div className="crm-col crm-col-r">
              <Card id="customer" title="Customer" right={<button className="crm-ico" title="Edit customer" onClick={() => openModal("customer")}>✎</button>}>
                <div className="crm-cust">
                  <div className="crm-cust-name"><b>{draft.name || "—"}</b></div>
                  <div className="crm-cust-phone">{fmtPhone(draft.phone)}</div>
                  <div className="crm-cust-mail">{draft.email || "—"}</div>
                  {(open.utm_source || open.gclid) && (
                    <div className="crm-lead-src" title={open.gclid ? `gclid: ${open.gclid}` : undefined}>
                      Source: <b>{open.gclid ? "Google Ads" : open.utm_source}</b>
                      {open.utm_campaign ? ` · ${open.utm_campaign}` : ""}{open.utm_medium && !open.gclid ? ` · ${open.utm_medium}` : ""}
                    </div>
                  )}
                  <div className="crm-qp">
                    <button className="crm-chip" onClick={() => copy(draft.phone)}>Copy Phone</button>
                    <button className="crm-chip" onClick={() => copy(draft.email)}>Copy Email</button>
                  </div>
                </div>
              </Card>
              {/* Stacked under Customer so the right column stays a single
                  vertical run — keeps Broker Earnings clear of the Vehicles
                  section instead of colliding with it. */}
              <Card id="sales" title="Sales Activity" right={<button className="crm-ico" title="Campaign" onClick={() => openModal("campaign")}>📣</button>}>
                <div className="crm-kv">
                  <div><span>Messages Sent</span><span>{activity.filter((a) => ["email_sent","sms_sent"].includes(a.kind)).length}</span></div>
                  <div><span>Calls Made</span><span>{activity.filter((a) => a.kind === "call" || a.kind === "voicemail").length}</span></div>
                  <div><span>Last Contact</span><span>{open.last_contacted ? dt(open.last_contacted) : "—"}</span></div>
                  <div><span>Follow Up</span><span>{draft.follow_up_date ? String(draft.follow_up_date).slice(0,10) : "—"}</span></div>
                </div>
              </Card>
            </div>
          </div>

          {/* BOTTOM TABS */}
          <div className="crm-tabs-rail">
            <div className="crm-tabs">
              {[["vehicles","Vehicles"],["tasks","Tasks"],["timeline","Timeline"],["notes","Notes"],["payments","Payments"]].map(([k, label]) => (
                <button key={k} className={tab === k ? "crm-tab active" : "crm-tab"} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>
            <div className="crm-tab-body">
              {tab === "vehicles" && (
                <div className="crm-veh-list">
                  <div className="crm-qp" style={{ marginBottom: 6 }}>
                    <input className="crm-input" placeholder="VIN to decode…" value={vinInput} onChange={(e) => setVinInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && decodeVin()} />
                    <button className="crm-chip" onClick={decodeVin}>Import VIN</button>
                    <button className="crm-chip" onClick={() => api("/api/crm/vehicles", { method: "POST", body: JSON.stringify({ lead_id: openId }) }).then(() => loadVehicles(openId))}>+ Add Vehicle</button>
                  </div>
                  {vehicles.length === 0 && <div className="crm-muted">No vehicles.</div>}
                  {[...vehicles].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((v, i) => {
                    const mods = [v.modified && "Modified", v.lift_kit && "Lift kit", v.lowered && "Lowered", v.oversized_tires && "Oversized"].filter(Boolean).join(", ");
                    return (
                    <div key={v.id} className="crm-veh">
                      <div className="crm-veh-head">
                        <b>{[v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle #" + (i + 1)}</b>
                        <span className={v.running ? "crm-run-ok" : "crm-run-inop"}>{v.running ? "Runs" : "Inop"}</span>
                        <button className="crm-ico" style={{ marginLeft: "auto" }} title="Edit vehicle" onClick={() => { setEditingVeh(v.id); setVehDraft({ ...v }); setVehMsg(null); }}>✎</button>
                      </div>
                      <div className="crm-veh-grid crm-veh-cols">
                        <div className="crm-veh-col">
                          <div><span>Model Year</span><span>{v.year || "n/a"}</span></div>
                          <div><span>Make</span><span>{v.make || "n/a"}</span></div>
                          <div><span>Model</span><span>{v.model || "n/a"}</span></div>
                          <div><span>Type</span><span>{v.type || guessType(v.model) || "n/a"}</span></div>
                          <div><span>Inop</span><span className={v.running ? "crm-inop-no" : "crm-inop-yes"}>{v.running ? "NO" : "YES"}</span></div>
                        </div>
                        <div className="crm-veh-col">
                          <div><span>Notes</span><span>{v.damage_notes || "n/a"}</span></div>
                          <div><span>VIN</span><span>{v.vin || "n/a"}</span></div>
                          <div><span>Color</span><span>{v.color || "n/a"}</span></div>
                          <div><span>Plate</span><span>{v.plate || "n/a"}</span></div>
                          <div><span>Lot Number</span><span>{v.lot_number || "n/a"}</span></div>
                        </div>
                        <div className="crm-veh-col">
                          <div><span>Keys</span><span>{v.keys_available ? "Yes" : "n/a"}</span></div>
                          <div><span>Title</span><span>{v.title || "n/a"}</span></div>
                          <div><span>Weight</span><span>{v.weight || "n/a"}</span></div>
                          <div><span>Carrier Notes</span><span>{v.carrier_notes || "n/a"}</span></div>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
              {tab === "tasks" && (
                <div>
                  <div className="crm-qp" style={{ marginBottom: 6 }}>
                    <input className="crm-input" placeholder="New task…" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
                    <button className="crm-chip" onClick={addTask}>+ Add</button>
                    <button className="crm-chip" onClick={() => { setNewTask("Follow up tomorrow"); setTab("tasks"); }}>Follow Up Tomorrow</button>
                    <button className="crm-chip" onClick={() => setNewTask("Call back")}>Call Back</button>
                    <button className="crm-chip" onClick={() => setNewTask("Carrier search")}>Carrier Search</button>
                    <button className="crm-chip" onClick={() => setNewTask("Customer callback")}>Customer Callback</button>
                    <button className="crm-chip" onClick={() => setNewTask("Dispatch reminder")}>Dispatch Reminder</button>
                  </div>
                  {tasks.length === 0 && <div className="crm-muted">No tasks.</div>}
                  {tasks.map((t) => (
                    <div className="crm-fe" key={t.id}>
                      <label style={{ flex: "none" }}><input type="checkbox" checked={!!t.done} onChange={() => toggleTask(t.id, t.done)} /></label>
                      <span><b>{t.title}</b> · {t.type} · {t.priority} · {t.status}{t.due_date ? " · " + String(t.due_date).slice(0,10) : ""}{t.assigned_user ? " · @" + t.assigned_user : ""}{t.recurring && t.recurring !== "none" ? " · ↻" + t.recurring : ""}</span>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}><button className="crm-mini" onClick={() => setEditingTask(t)}>✎</button><button className="crm-mini" onClick={() => delTask(t.id)}>✕</button></span>
                    </div>
                  ))}
                  {editingTask && (
                    <div className="crm-veh-body" style={{ marginTop: 8 }}>
                      <F2>
                        <F label="Title"><input className="crm-input" value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} /></F>
                        <F label="Type"><select className="crm-input" value={editingTask.type || "call"} onChange={(e) => setEditingTask({ ...editingTask, type: e.target.value })}><option>call</option><option>sms</option><option>email</option><option>follow_up</option><option>internal</option></select></F>
                        <F label="Priority"><select className="crm-input" value={editingTask.priority || "normal"} onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value })}><option>low</option><option>normal</option><option>high</option></select></F>
                        <F label="Status"><select className="crm-input" value={editingTask.status || "open"} onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })}><option>open</option><option>in_progress</option><option>completed</option><option>cancelled</option></select></F>
                        <F label="Due"><input type="date" className="crm-input" value={editingTask.due_date ? String(editingTask.due_date).slice(0,10) : ""} onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })} /></F>
                        <F label="Assigned"><input className="crm-input" value={editingTask.assigned_user || ""} onChange={(e) => setEditingTask({ ...editingTask, assigned_user: e.target.value })} /></F>
                        <F label="Reminder"><input type="datetime-local" className="crm-input" value={editingTask.reminder ? String(editingTask.reminder).slice(0,16) : ""} onChange={(e) => setEditingTask({ ...editingTask, reminder: e.target.value })} /></F>
                        <F label="Recurring"><select className="crm-input" value={editingTask.recurring || "none"} onChange={(e) => setEditingTask({ ...editingTask, recurring: e.target.value })}><option>none</option><option>daily</option><option>weekly</option><option>monthly</option></select></F>
                        <F label="Customer Reminder"><input type="checkbox" checked={!!editingTask.customer_reminder} onChange={(e) => setEditingTask({ ...editingTask, customer_reminder: e.target.checked })} /></F>
                        <F label="Description"><input className="crm-input" value={editingTask.description || ""} onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })} /></F>
                      </F2>
                      <button className="crm-chip" onClick={() => saveTaskFull(editingTask)}>Save Task</button>
                    </div>
                  )}
                </div>
              )}
              {tab === "timeline" && (
                <div>
                  {timeline.length === 0 && <div className="crm-muted">No activity.</div>}
                  {timeline.map((ev, i) => (
                    <div className="crm-fe" key={i}><span className="crm-muted" style={{ width: 150, flex: "none" }}>{new Date(ev.when).toLocaleString()}</span><span className="crm-tag">{ev.type}</span><span>{ev.text}</span></div>
                  ))}
                </div>
              )}
              {tab === "notes" && (
                <div>
                  <div className="crm-qp" style={{ marginBottom: 6 }}>
                    <select className="crm-input" style={{ width: 120 }} value={noteKind} onChange={(e) => setNoteKind(e.target.value)}><option value="internal">Internal</option><option value="customer">Customer</option><option value="pinned">Pinned</option></select>
                    <textarea className="crm-input" placeholder="New note…" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                    <button className="crm-chip" onClick={addNote}>+ Add</button>
                  </div>
                  {notes.length === 0 && <div className="crm-muted">No notes.</div>}
                  {notes.map((n) => (
                    <div className="crm-fe" key={n.id}><span><span className="crm-tag">{n.kind}</span> {n.pinned ? "📌 " : ""}{n.body}<span className="crm-muted"> — {n.author} · {new Date(n.created_at).toLocaleString()}{n.edited_at ? " (edited)" : ""}</span></span><button className="crm-mini" onClick={() => delNote(n.id)}>✕</button></div>
                  ))}
                </div>
              )}
              {tab === "payments" && (
                <div>
                  {/* Payment Method lives here (not buried in the Edit Shipment
                      modal) so it's easy to set/review. Persists to
                      lead.payment_method and flows into the invoice. */}
                  <div className="crm-pm-row">
                    <label className="crm-pm-lbl">Payment Method</label>
                    <input
                      className="crm-input"
                      placeholder="e.g. Credit Card, Zelle, Cash on Delivery"
                      value={draft.payment_method || ""}
                      onChange={setD("payment_method")}
                      onBlur={() => saveGuarded({ payment_method: draft.payment_method || null }, "Payment method saved.")}
                    />
                    <button className="crm-chip" disabled={busy} onClick={() => saveGuarded({ payment_method: draft.payment_method || null }, "Payment method saved.")}>Save</button>
                  </div>
                  {(() => {
                    const collected = payments.filter((p) => String(p.direction || "").toLowerCase() === "customer_broker" && p.confirmed !== false && !p.refunded).reduce((s, p) => s + (Number(p.amount) || 0), 0);
                    const refunded = payments.filter((p) => p.refunded && (p.refund_type || "refund") !== "chargeback").reduce((s, p) => s + (Number(p.amount) || 0), 0);
                    const chargebacks = payments.filter((p) => p.refunded && p.refund_type === "chargeback").reduce((s, p) => s + (Number(p.amount) || 0), 0);
                    const net = Math.max(0, collected - refunded - chargebacks);
                    return (
                      <div className="crm-pay-totals">
                        <span><b>${collected.toFixed(2)}</b> Collected</span>
                        <span className={refunded > 0 ? "neg" : ""}><b>${refunded.toFixed(2)}</b> Refunded</span>
                        <span className={chargebacks > 0 ? "neg" : ""}><b>${chargebacks.toFixed(2)}</b> Chargebacks</span>
                        <span><b>${net.toFixed(2)}</b> Net</span>
                      </div>
                    );
                  })()}
                  {payments.length === 0 && <div className="crm-muted">No payments recorded.</div>}
                  {payments.length > 0 && (
                    <div className="crm-pay-list">
                      {[...payments].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)).map((p) => (
                        <div className="crm-pay-card" key={p.id}>
                          <div className="crm-pay-card-h">
                            <span className="crm-pay-title">{p.is_broker_fee ? "Broker Payment" : "Payment"}</span>
                            <span className={"crm-pay-amt" + (p.confirmed === false && !p.refunded ? " pend" : "")}>
                              {p.amount != null ? "$" + Number(p.amount).toFixed(2) : "—"}
                              {p.refunded && <span className="crm-pend-tag refunded">{(p.refund_type || "refund") === "chargeback" ? "Chargeback" : "Refunded"}</span>}
                              {!p.refunded && p.confirmed === false && <span className="crm-pend-tag">Pending</span>}
                            </span>
                          </div>
                          <div className="crm-pay-rows">
                            <div><span>Method</span><span>{p.type ? p.type.toUpperCase() : "—"}{(p.identification || p.method) ? " · " + (p.identification || p.method) : ""}</span></div>
                            <div><span>Direction</span><span>{p.direction === "customer_broker" ? "Customer → Broker" : (p.direction || "—")}</span></div>
                            <div><span>Created</span><span>{String(p.payment_date || "").slice(0, 10) || "—"}{p.notes ? " · " + p.notes : ""}</span></div>
                            {p.refunded && (
                              <div className="refund-detail"><span>Reversal</span><span>
                                {p.refund_type === "chargeback" ? "Chargeback" : "Refund"}
                                {p.refund_date ? " · " + String(p.refund_date).slice(0, 10) : ""}
                                {p.refund_reason ? " · " + p.refund_reason : ""}
                                {p.refund_ref ? " · " + p.refund_ref : ""}
                              </span></div>
                            )}
                          </div>
                          <div className="crm-pay-actions">
                            <UpDropdown
                              className="crm-pay-status"
                              value={p.refunded ? (p.refund_type === "chargeback" ? "chargeback" : "refunded") : p.confirmed ? "paid" : "pending"}
                              onChange={(v) => setPaymentStatus(p.id, v)}
                              options={[
                                { value: "pending", label: "Pending" },
                                { value: "paid", label: "Paid" },
                                { value: "refunded", label: "Refunded" },
                                { value: "chargeback", label: "Chargeback" },
                              ]}
                            />
                            {p.refunded && p.refund_type === "chargeback" && (
                              <UpDropdown
                                className="crm-pay-status cb"
                                value={p.chargeback_status || "New"}
                                onChange={(v) => setChargebackStatus(p.id, v)}
                                title="Chargeback lifecycle (set Won/Lost from Refunds page)"
                                options={[
                                  { value: "New", label: "New" },
                                  { value: "Fighting", label: "Fighting" },
                                ]}
                              />
                            )}
                            <button className="crm-mini" onClick={() => openEditPayment(p)}>Edit</button>
                            <button className="crm-mini" onClick={() => delPayment(p.id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* STICKY ACTION BAR — left = status/notification area, right = primary actions */}
          <div className="crm-sticky">
            <div className={"crm-notify" + (msg ? " " + (msg.kind || (msg.ok ? "success" : "error")) : "")}>
              {msg ? msg.text : <span className="crm-context">{contextStatus}</span>}
            </div>
            {!isOrder && <button className="crm-ab" disabled={busy} onClick={() => saveGuarded({}, "Saved.")}>Save</button>}
            {!isOrder && open.status !== "quoted" && open.status !== "booked" && <button className="crm-ab primary" disabled={busy} onClick={() => saveGuarded({ status: "quoted" }, "Quote saved.")}>Save &amp; Quote</button>}
            {!isOrder && open.status === "quoted" && <button className="crm-ab book" disabled={busy} onClick={() => saveGuarded({ status: "booked" }, "Converted.")}>Convert to Order</button>}
            {isOrder && <button className="crm-ab" disabled={busy} onClick={() => saveGuarded({}, "Saved.")}>Save</button>}
            <button className="crm-ab" disabled={busy} onClick={() => { const p = (draft.phone || "").replace(/[^\d+]/g, ""); if (p) { window.location.href = "tel:" + p; logActivity("call", openId); } }}>📞 Call</button>
            <button className="crm-ab" disabled={busy} onClick={() => { openTextModal(); logActivity("text", openId); }}>💬 Text</button>
            {isOrder && <button className="crm-ab" disabled={busy} onClick={() => setPaymentModal(true)}>Payments</button>}
            {isOrder && <button className="crm-ab" disabled={busy} onClick={() => { setTab("payments"); openAddPayment(); }}>Add Payment</button>}
            {open.booking_token && <button className="crm-ab" disabled={busy} onClick={() => { window.open(data.site + "/agreement/" + open.booking_token, "_blank"); setMsg({ ok: true, text: "Agreement generated." }); }}>Generate Agreement</button>}
            <button className="crm-ab" disabled={busy || invoiceLoading} onClick={openInvoiceFlow}>{invoiceLoading ? "Loading…" : "🧾 Invoice"}</button>
            <button className={"crm-ab del" + (delArmed ? " armed" : "")} disabled={busy} onClick={armDelete}>{delArmed ? "Click Again to Delete" : "Delete"}</button>
          </div>
          {composer != null && (
            <div className="crm-composer">
              <div className="crm-composer-h">
                <span>📝 Message draft <span className="crm-muted">(ready to send — SMS integration pending)</span></span>
                <button className="crm-mini" onClick={() => setComposer(null)}>Dismiss</button>
              </div>
              <textarea className="crm-input crm-composer-body" rows={5} value={composer} onChange={(e) => setComposer(e.target.value)} />
              <div className="crm-qp" style={{ marginTop: 6 }}>
                <button className="crm-chip" onClick={() => copy(composer)}>Copy</button>
                <button className="crm-chip" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(composer); setMsg({ ok: true, text: "Text copied." }); }}>Copy &amp; Close</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EDIT MODALS */}
      {(modal || editingVeh != null || paymentModal) && (
        <div className="crm-modal" onClick={() => { closeModal(); closeVehModal(); setPaymentModal(false); setEditingPayment(null); }}>
          <div className="crm-modal-box" onClick={(e) => e.stopPropagation()}>
            {modal === "shipment" && (
              <>
                <div className="crm-modal-h">Edit Shipment <span className="crm-muted">#{open.id}</span></div>
                <F2>
                  <F label="Status"><select className="crm-input" value={draft.secondary_status || ""} onChange={setD("secondary_status")}><option value="">— set status —</option>{(isOrder ? [...ORDER_STATUSES, ...QUOTE_STATUSES] : QUOTE_STATUSES).map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
                  <F label="Transport Type"><select className="crm-input" value={draft.transport_type || "Open"} onChange={setD("transport_type")}><option>Open</option><option>Enclosed</option></select></F>
                  <F label="Ship Date"><input type="date" className="crm-input" value={draft.pickup_date} onChange={setD("pickup_date")} /></F>
                  <F label="Quote Expiration"><input type="date" className="crm-input" value={draft.quote_expiration} onChange={setD("quote_expiration")} /></F>
                  <F label="Priority"><select className="crm-input" value={draft.priority || "normal"} onChange={setD("priority")}><option>low</option><option>normal</option><option>high</option></select></F>
                  <F label="Lead Source"><input className="crm-input" value={draft.lead_source} onChange={setD("lead_source")} /></F>
                  <F label="Reference #"><input className="crm-input" value={draft.reference_id} onChange={setD("reference_id")} /></F>
                  <F label="Internal Status"><input className="crm-input" value={draft.internal_status} onChange={setD("internal_status")} /></F>
                </F2>
                <div className="crm-sub-h">Special Shipment</div>
                <F2>
                  <F label="Insurance"><input className="crm-input" value={draft.insurance} onChange={setD("insurance")} /></F>
                  <F label="Payment Method"><input className="crm-input" value={draft.payment_method} onChange={setD("payment_method")} /></F>
                  <F label="COD Amount"><input type="number" className="crm-input" value={draft.cod_amount ?? ""} onChange={setD("cod_amount")} /></F>
                  <F label="Deposit"><input type="number" className="crm-input" value={draft.deposit} onChange={setD("deposit")} /></F>
                  <F label="Distance (mi)"><input type="number" className="crm-input" value={draft.distance_miles ?? ""} onChange={setD("distance_miles")} /></F>
                  <F label="Est Transit (days)"><input type="number" className="crm-input" value={draft.est_transit_days ?? ""} onChange={setD("est_transit_days")} /></F>
                </F2>
                <div className="crm-sub-h">Internal Notes</div>
                <textarea className="crm-input" rows={3} value={draft.internal_notes || ""} onChange={setD("internal_notes")} />
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={closeModal}>Cancel</button>
                  <button className="crm-ab primary" onClick={() => { saveGuarded({}, "Saved."); closeModal(); }}>Save</button>
                </div>
              </>
            )}
            {modal === "origin" && (
              <>
                <div className="crm-modal-h">Edit Origin</div>
                <F2>
                  <F label="Contact"><input className="crm-input" value={draft.pickup_contact} onChange={setD("pickup_contact")} /></F>
                  <F label="Company"><input className="crm-input" value={draft.pickup_company} onChange={setD("pickup_company")} /></F>
                  <F label="Phone"><input className="crm-input" value={draft.pickup_phone} onChange={setD("pickup_phone")} /></F>
                  <F label="Email"><input className="crm-input" value={draft.pickup_email} onChange={setD("pickup_email")} /></F>
                  <F label="Hours"><input className="crm-input" value={draft.pickup_hours} onChange={setD("pickup_hours")} /></F>
                  <F label="Gate Code"><input className="crm-input" value={draft.pickup_gate} onChange={setD("pickup_gate")} /></F>
                </F2>
                <F2>
                  <F label="Address"><input className="crm-input" value={draft.origin_address} onChange={setD("origin_address")} /></F>
                  <F label="Address 2"><input className="crm-input" value={draft.origin_address2} onChange={setD("origin_address2")} /></F>
                  <F label="City"><input className="crm-input" value={draft.origin_city} onChange={setD("origin_city")} /></F>
                  <F label="State"><input className="crm-input st" maxLength={2} value={draft.origin_state} onChange={setD("origin_state")} /></F>
                  <F label="Zip"><input className="crm-input zip" value={draft.origin_zip} onChange={setD("origin_zip")} /><button className="crm-chip" type="button" onClick={() => lookupZip("origin")}>Look up</button></F>
                </F2>
                <label className="crm-chk"><input type="checkbox" checked={!!draft.residential_pickup} onChange={setCheck("residential_pickup")} /> Residential</label>
                <label className="crm-chk"><input type="checkbox" checked={!!draft.liftgate} onChange={setCheck("liftgate")} /> Liftgate</label>
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={closeModal}>Cancel</button>
                  <button className="crm-ab primary" onClick={() => { saveGuarded({}, "Saved."); closeModal(); }}>Save</button>
                </div>
              </>
            )}
            {modal === "destination" && (
              <>
                <div className="crm-modal-h">Edit Destination</div>
                <F2>
                  <F label="Contact"><input className="crm-input" value={draft.delivery_contact} onChange={setD("delivery_contact")} /></F>
                  <F label="Company"><input className="crm-input" value={draft.delivery_company} onChange={setD("delivery_company")} /></F>
                  <F label="Phone"><input className="crm-input" value={draft.delivery_phone} onChange={setD("delivery_phone")} /></F>
                  <F label="Email"><input className="crm-input" value={draft.delivery_email} onChange={setD("delivery_email")} /></F>
                  <F label="Hours"><input className="crm-input" value={draft.delivery_hours} onChange={setD("delivery_hours")} /></F>
                  <F label="Gate Code"><input className="crm-input" value={draft.delivery_gate} onChange={setD("delivery_gate")} /></F>
                </F2>
                <F2>
                  <F label="Address"><input className="crm-input" value={draft.destination_address} onChange={setD("destination_address")} /></F>
                  <F label="Address 2"><input className="crm-input" value={draft.destination_address2} onChange={setD("destination_address2")} /></F>
                  <F label="City"><input className="crm-input" value={draft.destination_city} onChange={setD("destination_city")} /></F>
                  <F label="State"><input className="crm-input st" maxLength={2} value={draft.destination_state} onChange={setD("destination_state")} /></F>
                  <F label="Zip"><input className="crm-input zip" value={draft.destination_zip} onChange={setD("destination_zip")} /><button className="crm-chip" type="button" onClick={() => lookupZip("destination")}>Look up</button></F>
                </F2>
                <label className="crm-chk"><input type="checkbox" checked={!!draft.residential_delivery} onChange={setCheck("residential_delivery")} /> Residential</label>
                <label className="crm-chk"><input type="checkbox" checked={!!draft.auction} onChange={setCheck("auction")} /> Auction</label>
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={closeModal}>Cancel</button>
                  <button className="crm-ab primary" onClick={() => { saveGuarded({}, "Saved."); closeModal(); }}>Save</button>
                </div>
              </>
            )}
            {modal === "customer" && (
              <>
                <div className="crm-modal-h">Edit Customer</div>
                <F2>
                  <F label="Name"><input className="crm-input" value={draft.name} onChange={setD("name")} />{errors.name && <span className="crm-err"> {errors.name}</span>}</F>
                  <F label="Phone"><input className="crm-input" value={draft.phone} onChange={setD("phone")} />{errors.phone && <span className="crm-err"> {errors.phone}</span>}</F>
                  <F label="2nd Phone"><input className="crm-input" value={draft.alt_phone} onChange={setD("alt_phone")} /></F>
                  <F label="Email"><input className="crm-input" value={draft.email} onChange={setD("email")} />{errors.email && <span className="crm-err"> {errors.email}</span>}</F>
                  <F label="Company"><input className="crm-input" value={draft.customer_company} onChange={setD("customer_company")} /></F>
                  <F label="Preferred"><select className="crm-input" value={draft.preferred_contact || "any"} onChange={setD("preferred_contact")}><option>any</option><option>phone</option><option>email</option><option>sms</option></select></F>
                  <F label="Timezone"><input className="crm-input" value={draft.timezone} onChange={setD("timezone")} /></F>
                  <F label="Customer Since"><input type="date" className="crm-input" value={draft.customer_since} onChange={setD("customer_since")} /></F>
                </F2>
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={closeModal}>Cancel</button>
                  <button className="crm-ab primary" onClick={() => { saveGuarded({}, "Saved."); closeModal(); }}>Save</button>
                </div>
              </>
            )}
            {modal === "pricing" && (
              <>
                <div className="crm-modal-h">Edit Pricing</div>
                <F2>
                  <F label="Total Tariff"><input className="crm-input" value={draft.total_tariff ?? ""} onChange={setD("total_tariff")} /></F>
                  <F label="Carrier Pay"><input className="crm-input" value={draft.carrier_pay ?? ""} onChange={setD("carrier_pay")} /></F>
                  <F label="Broker Fee (auto)"><input className="crm-input" value={brokerFee != null ? money(brokerFee) : "—"} readOnly disabled /></F>
                  <F label="Quote Expiration"><input type="date" className="crm-input" value={draft.quote_expiration} onChange={setD("quote_expiration")} /></F>
                </F2>
                <F label="Special Terms"><input className="crm-input" value={draft.special_terms} onChange={setD("special_terms")} /></F>
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={closeModal}>Cancel</button>
                  <button className="crm-ab primary" onClick={() => { saveGuarded({}, "Saved."); closeModal(); }}>Save</button>
                </div>
              </>
            )}
            {modal === "booking" && (
              <>
                <div className="crm-modal-h">Booking</div>
                <F2>
                  <F label="Status"><select className="crm-input" value={draft.secondary_status || ""} onChange={setD("secondary_status")}><option value="">— set status —</option>{(isOrder ? [...ORDER_STATUSES, ...QUOTE_STATUSES] : QUOTE_STATUSES).map((s) => <option key={s} value={s}>{s}</option>)}</select></F>
                  <F label="Reference #"><input className="crm-input" value={draft.reference_id} onChange={setD("reference_id")} /></F>
                  <F label="Ship Date"><input type="date" className="crm-input" value={draft.pickup_date} onChange={setD("pickup_date")} /></F>
                  <F label="Delivery Date"><input type="date" className="crm-input" value={draft.desired_delivery_date} onChange={setD("desired_delivery_date")} /></F>
                  <F label="Transit Days"><input className="crm-input" value={draft.est_transit_days ?? ""} onChange={setD("est_transit_days")} /></F>
                  <F label="Distance (mi)"><input className="crm-input" value={draft.distance_miles ?? ""} onChange={setD("distance_miles")} /></F>
                </F2>
                <div className="crm-qp" style={{ marginTop: 8 }}>
                  {open.status === "quoted" && <button className="crm-chip" onClick={() => { saveGuarded({ status: "booked" }, "Converted."); closeModal(); }}>Convert to Order</button>}
                </div>
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={closeModal}>Cancel</button>
                  <button className="crm-ab primary" onClick={() => { saveGuarded({}, "Saved."); closeModal(); }}>Save</button>
                </div>
              </>
            )}
            {modal === "activitylog" && (
              <>
                <div className="crm-modal-h">Activity Log</div>
                {changes.length === 0 && <div className="crm-muted">No edits logged.</div>}
                {changes.length > 0 && (
                  <div className="crm-audit-table">
                    <div className="crm-audit-row crm-audit-head"><span>Date</span><span>User</span><span>Field</span><span>Old</span><span>New</span></div>
                    {changes.map((c) => (
                      <div className="crm-audit-row" key={c.id}><span>{new Date(c.created_at).toLocaleString()}</span><span>{c.actor || "—"}</span><span>{c.field}</span><span>{c.old_value ?? "—"}</span><span>{c.new_value ?? "—"}</span></div>
                    ))}
                  </div>
                )}
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={closeModal}>Close</button>
                </div>
              </>
            )}
            {modal === "campaign" && (
              <>
                <div className="crm-modal-h">Campaign</div>
                <F2>
                  <F label="Campaign Name"><input className="crm-input" placeholder="campaign name" /></F>
                </F2>
                <div className="crm-kv" style={{ marginTop: 6 }}>
                  <div><span>Messages Sent</span><span>{activity.filter((a) => ["email_sent","sms_sent"].includes(a.kind)).length}</span></div>
                  <div><span>Calls Made</span><span>{activity.filter((a) => a.kind === "call" || a.kind === "voicemail").length}</span></div>
                  <div><span>Emails</span><span>{activity.filter((a) => a.kind === "email_sent").length}</span></div>
                  <div><span>Texts</span><span>{activity.filter((a) => a.kind === "sms_sent").length}</span></div>
                </div>
                <div className="crm-qp" style={{ marginTop: 10 }}>
                  <button className="crm-chip" onClick={() => customerAction("email_sent", "campaign send")}>Send Campaign</button>
                </div>
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={closeModal}>Close</button>
                </div>
              </>
            )}
            {modal === "pricinghistory" && (
              <>
                <div className="crm-modal-h">Pricing History</div>
                {pricing.length === 0 && <div className="crm-muted">No price changes.</div>}
                {pricing.length > 0 && (
                  <div className="crm-audit-table">
                    <div className="crm-audit-row crm-audit-head"><span>Date</span><span>User</span><span>Old Tariff</span><span>New Tariff</span><span>Old Carrier</span><span>New Carrier</span><span>Old Broker</span><span>New Broker</span><span>Reason</span></div>
                    {pricing.map((pr) => (
                      <div className="crm-audit-row" key={pr.id}><span>{new Date(pr.created_at).toLocaleString()}</span><span>{pr.actor || "—"}</span><span>{pr.old_total_tariff != null ? money(pr.old_total_tariff) : "—"}</span><span>{pr.total_tariff != null ? money(pr.total_tariff) : "—"}</span><span>{pr.old_carrier_pay != null ? money(pr.old_carrier_pay) : "—"}</span><span>{pr.carrier_pay != null ? money(pr.carrier_pay) : "—"}</span><span>{pr.old_broker_fee != null ? money(pr.old_broker_fee) : "—"}</span><span>{pr.new_broker_fee != null ? money(pr.new_broker_fee) : "—"}</span><span>{pr.reason || "—"}</span></div>
                    ))}
                  </div>
                )}
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={closeModal}>Close</button>
                </div>
              </>
            )}
            {paymentModal && (() => {
              const setPF = (k, v) => setPaymentForm({ ...paymentForm, [k]: v });
              return (
                <>
                  <div className="crm-modal-h">{editingPayment ? "Edit Payment" : "Add Payment"} <span className="crm-muted">#{open.id}</span></div>
                  <F2>
                    <F label="Date"><input type="date" className="crm-input" value={paymentForm.payment_date} onChange={(e) => setPF("payment_date", e.target.value)} /></F>
                    <F label="Type">
                      <select className="crm-input" value={paymentForm.type} onChange={(e) => setPF("type", e.target.value)}>
                        {["cash", "ach", "check", "wire", "zelle", "credit_card", "other"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </F>
                    <F label="Direction">
                      <select className="crm-input" value={paymentForm.direction} onChange={(e) => setPF("direction", e.target.value)}>
                        <option value="customer_broker">Customer → Broker</option>
                        <option value="broker_carrier">Broker → Carrier</option>
                      </select>
                    </F>
                    <F label="Amount"><input type="number" step="0.01" className="crm-input" value={paymentForm.amount} onChange={(e) => setPF("amount", e.target.value)} /></F>
                    <F label="Method / Ref"><input className="crm-input" value={paymentForm.identification} onChange={(e) => setPF("identification", e.target.value)} placeholder="check # / txn id" /></F>
                    <F label="Notes"><input className="crm-input" value={paymentForm.notes} onChange={(e) => setPF("notes", e.target.value)} /></F>
                  </F2>
                  <label className="crm-check" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={paymentForm.refunded} onChange={(e) => setPF("refunded", e.target.checked)} /> Mark as refunded / chargeback
                  </label>
                  {paymentForm.refunded && (
                    <F2 style={{ marginTop: 8 }}>
                      <F label="Reversal Type">
                        <select className="crm-input" value={paymentForm.refund_type} onChange={(e) => setPF("refund_type", e.target.value)}>
                          <option value="refund">Refund</option>
                          <option value="chargeback">Chargeback</option>
                        </select>
                      </F>
                      <F label="Reversal Date"><input type="date" className="crm-input" value={paymentForm.refund_date} onChange={(e) => setPF("refund_date", e.target.value)} /></F>
                      <F label="Reason / Case #"><input className="crm-input" value={paymentForm.refund_reason} onChange={(e) => setPF("refund_reason", e.target.value)} placeholder="reason or chargeback case #" /></F>
                      <F label="Reference"><input className="crm-input" value={paymentForm.refund_ref} onChange={(e) => setPF("refund_ref", e.target.value)} placeholder="gateway / bank ref" /></F>
                    </F2>
                  )}
                  <div className="crm-modal-foot">
                    <button className="crm-chip" onClick={() => { setPaymentModal(false); setEditingPayment(null); }}>Cancel</button>
                    <button className="crm-ab primary" disabled={!(Number(paymentForm.amount) > 0)} onClick={savePayment}>{editingPayment ? "Save" : "Add Payment"}</button>
                  </div>
                </>
              );
            })()}
            {editingVeh != null && vehDraft && (() => {
              const v = vehDraft;
              const setV = (patch) => setVehDraft((prev) => ({ ...prev, ...patch }));
              return (
                <>
                  <div className="crm-modal-h">Edit Vehicle</div>
                  <F2>
                    <F label="Year"><input className="crm-input" value={v.year ?? ""} onChange={(e) => setV({ year: e.target.value ? Number(e.target.value) : null })} /></F>
                    <F label="Make"><input className="crm-input" value={v.make || ""} onChange={(e) => setV({ make: e.target.value })} /></F>
                    <F label="Model"><input className="crm-input" value={v.model || ""} onChange={(e) => setV({ model: e.target.value, ...(!v.type && guessType(e.target.value) ? { type: guessType(e.target.value) } : {}) })} /></F>
                    <F label="Type"><select className="crm-input" value={v.type || ""} onChange={(e) => setV({ type: e.target.value })}><option value="">—</option>{["Car","SUV","Pickup","Van","Truck","Motorcycle","Other"].map((t) => <option key={t} value={t}>{t}</option>)}</select></F>
                    <F label="VIN"><input className="crm-input" value={v.vin || ""} onChange={(e) => setV({ vin: e.target.value })} /></F>
                    <F label="Color"><input className="crm-input" value={v.color || ""} onChange={(e) => setV({ color: e.target.value })} /></F>
                    <F label="Plate"><input className="crm-input" value={v.plate || ""} onChange={(e) => setV({ plate: e.target.value })} /></F>
                    <F label="Lot"><input className="crm-input" value={v.lot_number || ""} onChange={(e) => setV({ lot_number: e.target.value })} /></F>
                  </F2>
                  <label className="crm-chk"><input type="checkbox" checked={!!v.running} onChange={(e) => setV({ running: e.target.checked })} /> Runs</label>
                  <label className="crm-chk"><input type="checkbox" checked={!!v.modified} onChange={(e) => setV({ modified: e.target.checked })} /> Modified</label>
                  <label className="crm-chk"><input type="checkbox" checked={!!v.lift_kit} onChange={(e) => setV({ lift_kit: e.target.checked })} /> Lift kit</label>
                  <label className="crm-chk"><input type="checkbox" checked={!!v.lowered} onChange={(e) => setV({ lowered: e.target.checked })} /> Lowered</label>
                  <label className="crm-chk"><input type="checkbox" checked={!!v.oversized_tires} onChange={(e) => setV({ oversized_tires: e.target.checked })} /> Oversized</label>
                  <label className="crm-chk"><input type="checkbox" checked={!!v.keys_available} onChange={(e) => setV({ keys_available: e.target.checked })} /> Keys</label>
                  <F label="Damage"><input className="crm-input" value={v.damage_notes || ""} onChange={(e) => setV({ damage_notes: e.target.value })} /></F>
                  <div className="crm-qp" style={{ marginTop: 8 }}>
                    <button className="crm-chip" onClick={decodeVin}>Decode VIN</button>
                    <button className="crm-chip" onClick={() => { const q = [v.year, v.make, v.model].filter(Boolean).join(" "); if (q) window.open("https://www.google.com/search?q=" + encodeURIComponent(q + " vehicle specs"), "_blank", "noopener"); }}>🔎 Look up on Google</button>
                    <button className="crm-chip" onClick={() => dupVehicle(v)}>Duplicate</button>
                    <button className="crm-chip" onClick={() => { if (confirm("Delete vehicle?")) { delVehicle(v.id); closeVehModal(); } }}>Delete</button>
                  </div>
                  {vehMsg && (
                    vehMsg.ok
                      ? <div style={{ color: "var(--ok)", fontSize: 13, fontWeight: 600, marginTop: 12 }}>{vehMsg.text}</div>
                      : <div className="crm-err">{vehMsg.text}</div>
                  )}
                  <div className="crm-modal-foot">
                    <button className="crm-chip" onClick={closeVehModal}>Close</button>
                    <button className="crm-ab primary" disabled={vehSaving} onClick={saveVehDraft}>{vehSaving ? "Saving…" : "Save"}</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {textModal && (
        <div className="crm-modal" onClick={() => { setTextModal(false); setTmplEdit(null); }}>
          <div className="crm-modal-box crm-tmpl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-h">Text Templates</div>
            {tmplEdit ? (
              <div className="crm-tmpl-edit">
                <F2>
                  <F label="Name"><input className="crm-input" value={tmplEdit.name} onChange={(e) => setTmplEdit({ ...tmplEdit, name: e.target.value })} placeholder="Template name" /></F>
                  <F label="Category">
                    <select className="crm-input" value={tmplEdit.category} onChange={(e) => setTmplEdit({ ...tmplEdit, category: e.target.value })}>
                      <option value="company">Company</option>
                      <option value="personal">Personal</option>
                    </select>
                  </F>
                </F2>
                <label className="crm-muted" style={{ fontSize: 12, marginTop: 6, display: "block" }}>{"Message Body — use {{customer_name}}, {{agent_name}}, {{agent_phone}}, {{company_name}}, {{quote_id}}, {{order_id}}, {{quote_amount}}, {{broker_fee}}, {{broker_due}}, {{pickup_date}}, {{delivery_date}}, {{booking_link}}, {{origin}}, {{destination}}, {{vehicle}}, {{status}}"}</label>
                <textarea className="crm-input" rows={10} style={{ marginTop: 6, width: "100%", fontFamily: "ui-monospace, monospace" }} value={tmplEdit.body} onChange={(e) => setTmplEdit({ ...tmplEdit, body: e.target.value })} />
                <div className="crm-modal-foot">
                  <button className="crm-chip" onClick={() => setTmplEdit(null)}>Cancel</button>
                  <button className="crm-ab primary" onClick={tmplSave}>Save Template</button>
                </div>
              </div>
            ) : (
              <>
                <div className="crm-tmpl-tabs">
                  <button className={tmplTab === "personal" ? "crm-tmpl-tab active" : "crm-tmpl-tab"} onClick={() => setTmplTab("personal")}>Personal</button>
                  <button className={tmplTab === "company" ? "crm-tmpl-tab active" : "crm-tmpl-tab"} onClick={() => setTmplTab("company")}>Company</button>
                  <button className="crm-tmpl-plus" title="New template" onClick={() => setTmplEdit({ name: "", category: tmplTab === "personal" ? "personal" : "company", body: "" })}>+</button>
                </div>
                <input className="crm-input crm-tmpl-search" placeholder="Search templates…" value={tmplSearch} onChange={(e) => setTmplSearch(e.target.value)} style={{ width: "100%", marginTop: 8 }} />
                <div className="crm-tmpl-list">
                  {tmplList.filter((t) => t.category === tmplTab && (!tmplSearch || t.name.toLowerCase().includes(tmplSearch.toLowerCase()))).map((t) => (
                    <div key={t.id} className={"crm-tmpl-item" + (tmplExpanded === t.id ? " expanded" : "")}>
                      <div className="crm-tmpl-row" onClick={() => setTmplExpanded(tmplExpanded === t.id ? null : t.id)}>
                        <span className="crm-tmpl-name">{t.name}</span>
                        {t.is_default && <span className="crm-tag">default</span>}
                        <span className="crm-chev">{tmplExpanded === t.id ? "▾" : "▸"}</span>
                      </div>
                      {tmplExpanded === t.id && (
                        <div className="crm-tmpl-detail">
                          <pre className="crm-tmpl-preview">{renderTemplate(t.body)}</pre>
                          <div className="crm-qp">
                            <button className="crm-ab primary" onClick={() => tmplApply(t)}>Apply</button>
                            <button className="crm-ab" onClick={() => copy(renderTemplate(t.body))}>Copy</button>
                            <div className="crm-more">
                              <button className="crm-ab" onClick={() => setTmplMoreId(tmplMoreId === t.id ? null : t.id)}>More ▾</button>
                              {tmplMoreId === t.id && (
                                <div className="crm-more-menu" onClick={(e) => e.stopPropagation()}>
                                  <button className="crm-more-item" onClick={() => { setTmplMoreId(null); setTmplEdit({ id: t.id, name: t.name, category: t.category, body: t.body }); }}>Edit</button>
                                  <button className="crm-more-item" onClick={() => { setTmplMoreId(null); tmplDuplicate(t); }}>Duplicate</button>
                                  <button className="crm-more-item del" onClick={() => { setTmplMoreId(null); tmplDelete(t.id); }}>Delete</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {tmplList.filter((t) => t.category === tmplTab && (!tmplSearch || t.name.toLowerCase().includes(tmplSearch.toLowerCase()))).length === 0 && (
                    <div className="crm-muted" style={{ padding: 14, textAlign: "center" }}>No {tmplTab} templates yet. Click + to create one.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="crm-modal" onClick={() => setSearchOpen(false)}>
          <div className="crm-modal-box" onClick={(e) => e.stopPropagation()}>
            <input className="crm-input" autoFocus placeholder="Search your leads & carriers…" value={searchQ} onChange={(e) => doSearch(e.target.value)} style={{ width: "100%" }} />
            {searchResults && (
              <div className="crm-search-results">
                {searchResults.leads.length > 0 && <><div className="crm-search-h">Leads</div>{searchResults.leads.map((r) => (<div key={r.id} className="crm-search-row" onClick={() => { setOpenId(r.id); setSearchOpen(false); setSearchQ(""); setSearchResults(null); }}>{r.name} · {r.email || r.phone}{r.origin_city ? " · " + r.origin_city : ""}</div>))}</>}
                {searchResults.carriers.length > 0 && <><div className="crm-search-h">Carriers</div>{searchResults.carriers.map((r) => (<div key={r.id} className="crm-search-row">{r.name}{r.mc_number ? " · " + r.mc_number : ""}</div>))}</>}
                {searchResults.leads.length === 0 && searchResults.carriers.length === 0 && <div className="crm-muted" style={{ padding: 10 }}>No matches.</div>}
              </div>
            )}
          </div>
            </div>
          )}

          {feedbackOpen && (
            <div className="crm-modal-back" onClick={() => setFeedbackOpen(false)}>
              <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="crm-modal-h">Send Feedback <span className="crm-muted">bug report or idea</span></div>
                <div className="crm-pad">
                  <F label="Subject"><input className="crm-input" value={fbForm.subject} onChange={(e) => setFbForm({ ...fbForm, subject: e.target.value })} placeholder="Short summary" /></F>
                  <F label="Message">
                    <textarea className="crm-input" rows={6} value={fbForm.message} onChange={(e) => setFbForm({ ...fbForm, message: e.target.value })} placeholder="Describe the issue or request…" />
                  </F>
                  <F label="Attachments">
                    <input type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" onChange={onFeedbackFiles} />
                    <div className="crm-muted" style={{ fontSize: 11, marginTop: 4 }}>PNG, JPG, GIF, WEBP, PDF · up to 5 files · 6MB each</div>
                    {fbForm.attachments.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {fbForm.attachments.map((a, i) => (
                          <span key={i} className="crm-pill s-move" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {a.name}
                            <button className="crm-x" onClick={() => setFbForm((p) => ({ ...p, attachments: p.attachments.filter((_, j) => j !== i) }))}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </F>
                  {fbMsg && <div className={fbMsg.ok ? "crm-ok" : "crm-err"}>{fbMsg.text}</div>}
                </div>
                <div className="crm-modal-foot">
                  <button className="crm-ab" onClick={() => setFeedbackOpen(false)}>Cancel</button>
                  <button className="crm-ab primary" disabled={fbBusy} onClick={submitFeedback}>Submit</button>
                </div>
              </div>
            </div>
          )}

                {invoiceOpen && (
                <div className="crm-modal-back" onClick={closeInvoice}>
                <div className="crm-modal crm-invoice-modal crm-invoice-modal-pdf" onClick={(e) => e.stopPropagation()}>
                  <div style={{ width: "min(900px, 92vw)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
                    <div className="crm-modal-h">Invoice</div>
                    {invoiceLoading && <p className="crm-muted">Generating…</p>}
                    {invoiceError && <p className="crm-error">{invoiceError}</p>}
                    {pdfInvoiceUrl && (
                      <>
                        <iframe title="Invoice PDF" src={pdfInvoiceUrl} style={{ width: "100%", height: "72vh", border: "none", borderRadius: 8, background: "#fff", display: "block" }} />
                        {invoiceHistory.length > 1 && (
                          <div className="crm-muted" style={{ fontSize: 12, marginTop: 8 }}>
                            {invoiceHistory.length} invoices generated for this order —{" "}
                            {invoiceHistory.slice(1, 4).map((h, i) => (
                              <span key={h.id}>
                                {i > 0 && ", "}
                                <a href="#" onClick={(e) => { e.preventDefault(); downloadPastInvoice(h.id, open?.order_number); }}>
                                  {dt(h.generated_at)}
                                </a>
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <div className="crm-modal-foot">
                      <button className="crm-ab" onClick={closeInvoice}>Close</button>
                      {pdfInvoiceUrl && (
                        <a className="crm-ab primary" href={pdfInvoiceUrl} download={`invoice-${openId}.pdf`}>⬇ Download PDF</a>
                      )}
                    </div>
                  </div>
                </div>
                </div>
                )}
                </main>
      </div>
    </div>
  );

}
