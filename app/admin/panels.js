"use client";

import { useEffect, useState } from "react";

// The three operational admin views: AI Action Queue (approve/reject),
// Leads (full worklist with status management), Marketplace (list overflow
// leads for sale, track offers). Each fetches with the admin session token.

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function useAdminApi(getToken) {
  return async function api(path, options = {}) {
    const attempt = async () => {
      const token = await getToken();
      return fetch(path, {
        ...options,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
        cache: "no-store",
      });
    };
    let res = await attempt();
    if (res.status === 401) res = await attempt(); // token refreshed by getToken on retry
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };
}

// ---------------- AI Action Queue ----------------

export function QueuePanel({ getToken, onChanged, onOpenFeedback }) {
  const api = useAdminApi(getToken);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setItems((await api("/api/admin/queue")).items);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(id, decision) {
    setBusy(true);
    try {
      await api("/api/admin/queue", { method: "POST", body: JSON.stringify({ id, decision }) });
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const pending = (items || []).filter((i) => i.status === "pending");
  const reviewed = (items || []).filter((i) => i.status !== "pending");

  return (
    <>
      <div className="section">
        <div className="section-head"><span>Pending actions</span><span>{items ? pending.length : "loading..."}</span></div>
        {error && <div className="tn-error">{error}</div>}
        {items && pending.length === 0 && (
          <div className="aq-reason" style={{ padding: "16px 22px" }}>
            Nothing pending. Proposals (campaign launches, page publishes, lead routing) land here for your approval.
          </div>
        )}
        {pending.map((item) => (
          <div className="aq-item" key={item.id}>
            <div>
              <span className="aq-type">{item.action_type.replace(/_/g, " ")}</span>
              <div className="mono" style={{ fontSize: 12.5, marginTop: 6 }}>{item.target_table} #{item.target_id}</div>
              <div className="aq-reason">{item.reasoning}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 6 }}>
                {timeAgo(item.created_at)}{item.confidence != null ? ` · confidence ${item.confidence}` : ""}
              </div>
            </div>
            <div className="aq-actions">
              {item.action_type === "feedback" ? (
                <button className="approve" onClick={() => onOpenFeedback && onOpenFeedback(Number(item.target_id))}>Open</button>
              ) : (
                <>
                  <button className="reject" disabled={busy} onClick={() => decide(item.id, "rejected")}>Reject</button>
                  <button className="approve" disabled={busy} onClick={() => decide(item.id, "approved")}>Approve</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {reviewed.length > 0 && (
        <div className="section">
          <div className="section-head"><span>Recently reviewed</span><span>{reviewed.length}</span></div>
          {reviewed.map((item) => (
            <div className="aq-item handled" key={item.id}>
              <div>
                <span className="aq-type">{item.action_type.replace(/_/g, " ")}</span>
                <div className="aq-reason">{item.reasoning}</div>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: item.status === "approved" ? "var(--teal)" : "var(--red)" }}>
                {item.status} · {item.reviewed_at ? timeAgo(item.reviewed_at) : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------- Leads ----------------

export function LeadsPanel({ getToken }) {
  const api = useAdminApi(getToken);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setData(await api("/api/admin/leads"));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(id, status) {
    try {
      await api("/api/admin/leads", { method: "PATCH", body: JSON.stringify({ id, status }) });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function assignLead(id, tenantId) {
    try {
      await api("/api/admin/leads", {
        method: "PATCH",
        body: JSON.stringify({ id, assign_tenant_id: tenantId ? Number(tenantId) : null }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="section">
      <div className="section-head"><span>All leads</span><span>{data ? `${data.leads.length} shown (latest 100)` : "loading..."}</span></div>
      {error && <div className="tn-error">{error}</div>}
      {data && data.leads.length === 0 && (
        <div className="aq-reason" style={{ padding: "16px 22px" }}>No leads yet — they appear here the moment a quote form is submitted.</div>
      )}
      {(data?.leads || []).map((l) => {
        const vehicle =
          Array.isArray(l.vehicles) && l.vehicles.length > 0
            ? l.vehicles.map((v) => [v.year, v.make, v.model].filter(Boolean).join(" ")).join(" · ") +
              (l.vehicles.length > 1 ? ` (${l.vehicles.length} vehicles)` : "")
            : [l.vehicle_year, l.vehicle_make, l.vehicle_model].filter(Boolean).join(" ");
        const route = l.origin_state
          ? `${[l.origin_city, l.origin_state].filter(Boolean).join(" ")} → ${[l.destination_city, l.destination_state].filter(Boolean).join(" ") || "?"}`
          : null;
        return (
          <div className="aq-item" key={l.id}>
            <div>
              <span className="aq-type">{l.routing_mode || "unrouted"}</span>
              {l.tenant_name && <span className="aq-type" style={{ marginLeft: 6 }}>{l.tenant_name}</span>}
              {l.agent_name && <span className="aq-type" style={{ marginLeft: 6 }}>rep: {l.agent_name}</span>}
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>
                {l.name} · <span className="mono">{l.phone}</span>{l.email ? <span className="mono"> · {l.email}</span> : null}
              </div>
              {(vehicle || route) && (
                <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
                  {[vehicle, route, l.pickup_date ? `pickup ${String(l.pickup_date).slice(0, 10)}` : null].filter(Boolean).join(" · ")}
                </div>
              )}
              <div className="aq-reason">{l.url_slug || "no source page"} · {timeAgo(l.created_at)}</div>
            </div>
            <div className="lead-controls">
              <select
                className="lead-status"
                value={l.tenant_id || ""}
                onChange={(e) => assignLead(l.id, e.target.value)}
                aria-label="Assign lead to"
              >
                <option value="">In-house</option>
                {(data.tenants || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.company_name} ({t.plan_type === "blue_pill" ? "software" : "leads"}{t.status !== "active" ? `, ${t.status}` : ""})
                  </option>
                ))}
              </select>
              <select className="lead-status" value={l.status} onChange={(e) => setStatus(l.id, e.target.value)} aria-label="Lead status">
                {(data.statuses || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// B2B "request a business account" leads (dealers / repair shops / fleet).
// Own admin section (sidebar item below Leads). Collapsible cards so a long
// list doesn't overlap; each card has a status dropdown that PATCHes so the
// team can track which B2B inquiries are contacted / won / lost.
export function BusinessInquiriesPanel({ getToken }) {
  const api = useAdminApi(getToken);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(null);
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  async function load() {
    try { setItems((await api("/api/admin/business-inquiries")).inquiries); setError(null); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function setStatus(id, status) {
    setBusy(id);
    try {
      await api("/api/admin/business-inquiries", { method: "PATCH", body: JSON.stringify({ id, status }) });
      setItems((prev) => (prev || []).map((b) => (b.id === id ? { ...b, status } : b)));
    } catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }
  return (
    <div className="section">
      <div className="section-head"><span>Business inquiries (For Business pages)</span><span>{items ? `${items.length} shown (latest 200)` : "loading..."}</span></div>
      {error && <div className="tn-error">{error}</div>}
      {items && items.length === 0 && (
        <div className="aq-reason" style={{ padding: "16px 22px" }}>No business inquiries yet — they appear here the moment a For Business form is submitted.</div>
      )}
      {(items || []).map((b) => (
        <div className="aq-item" key={b.id}>
          <div onClick={() => toggle(b.id)} style={{ cursor: "pointer", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span className={`aq-type s-${b.status === "new" ? "new" : b.status}`}>{b.segment}</span>
            <b>{b.name}{b.company ? ` · ${b.company}` : ""}</b>
            <span className="mono">{b.phone}</span>
            {b.email && <span className="mono">{b.email}</span>}
            <span className="aq-reason" style={{ marginLeft: "auto" }}>{timeAgo(b.created_at)}{busy === b.id ? " · saving…" : ""} {open[b.id] ? "▾" : "▸"}</span>
          </div>
          {open[b.id] && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              {b.message && <div className="aq-reason" style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}>{b.message}</div>}
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span>Status</span>
                <select
                  className="lead-status"
                  value={b.status}
                  disabled={busy === b.id}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setStatus(b.id, e.target.value)}
                >
                  {["new", "contacted", "in_progress", "won", "lost"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// B2B "request a business account" leads (dealers / repair shops / fleet).
function BusinessInquiriesSection({ getToken }) {
  const api = useAdminApi(getToken);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setItems((await api("/api/admin/business-inquiries")).inquiries);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="section" style={{ marginTop: 22 }}>
      <div className="section-head"><span>Business inquiries (For Business pages)</span><span>{items ? `${items.length} shown (latest 100)` : "loading..."}</span></div>
      {error && <div className="tn-error">{error}</div>}
      {items && items.length === 0 && (
        <div className="aq-reason" style={{ padding: "16px 22px" }}>No business inquiries yet — they appear here the moment a For Business form is submitted.</div>
      )}
      {(items || []).map((b) => (
        <div className="aq-item" key={b.id}>
          <div>
            <span className="aq-type">{b.segment}</span>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>
              {b.name}{b.company ? ` · ${b.company}` : ""} · <span className="mono">{b.phone}</span>{b.email ? <span className="mono"> · {b.email}</span> : null}
            </div>
            {b.message && <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>{b.message}</div>}
            <div className="aq-reason">{b.status} · {timeAgo(b.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- Marketplace ----------------

export function MarketplacePanel({ getToken }) {
  const api = useAdminApi(getToken);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await api("/api/admin/marketplace"));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function list(leadId) {
    const price = Number(prices[leadId]);
    if (!(price > 0)) { setError("Set a price first"); return; }
    setBusy(true);
    try {
      await api("/api/admin/marketplace", { method: "POST", body: JSON.stringify({ lead_id: leadId, price }) });
      setPrices((p) => ({ ...p, [leadId]: "" }));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="stats">
        <div className="stat-card"><div className="lbl">Open offers</div><div className="val">{data ? data.openOffers : "…"}</div></div>
        <div className="stat-card"><div className="lbl">Claimed this month</div><div className="val">{data ? data.claimedMonth : "…"}</div></div>
        <div className="stat-card"><div className="lbl">Revenue (MTD)</div><div className="val">${data ? data.revenueMonth : "…"}</div></div>
      </div>

      <div className="section">
        <div className="section-head"><span>Overflow leads to list</span><span>{data ? data.unlisted.length : "loading..."}</span></div>
        {error && <div className="tn-error">{error}</div>}
        {data && data.unlisted.length === 0 && (
          <div className="aq-reason" style={{ padding: "16px 22px" }}>
            No unlisted overflow leads. Leads land here when routing sends them to the marketplace
            (e.g. a tenant is at cap) — set a price and list them for buyers.
          </div>
        )}
        {(data?.unlisted || []).map((l) => (
          <div className="aq-item" key={l.id}>
            <div>
              <span className="aq-type">{l.overflow_reason || "overflow"}</span>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>{l.name} · <span className="mono">{l.phone}</span></div>
              <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
                {[[l.origin_city, l.origin_state].filter(Boolean).join(" "), [l.destination_city, l.destination_state].filter(Boolean).join(" ")].filter(Boolean).join(" → ")}
                {[l.vehicle_year, l.vehicle_make, l.vehicle_model].filter(Boolean).length ? ` · ${[l.vehicle_year, l.vehicle_make, l.vehicle_model].filter(Boolean).join(" ")}` : ""}
                {` · ${timeAgo(l.created_at)}`}
              </div>
            </div>
            <div className="aq-actions" style={{ display: "flex", alignItems: "center" }}>
              <input
                className="mp-price"
                type="number"
                min="1"
                placeholder="$ price"
                value={prices[l.id] || ""}
                onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))}
              />
              <button className="approve" disabled={busy} onClick={() => list(l.id)}>List for sale</button>
            </div>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-head"><span>Offers</span><span>{data ? data.offers.length : "loading..."}</span></div>
        {data && data.offers.length === 0 && (
          <div className="aq-reason" style={{ padding: "16px 22px" }}>No offers yet.</div>
        )}
        {(data?.offers || []).map((o) => (
          <div className="aq-item" key={o.id}>
            <div>
              <span className={`aq-type ${o.status === "claimed" ? "" : ""}`}>{o.status}</span>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>
                {o.lead_name} · ${Number(o.price)}
              </div>
              <div className="aq-reason">
                {[o.origin_state, o.destination_state].filter(Boolean).join(" → ")} · offered {timeAgo(o.offered_at)}
                {o.claimed_by_name ? ` · claimed by ${o.claimed_by_name}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
