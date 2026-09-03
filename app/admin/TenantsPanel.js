"use client";

import { useEffect, useState } from "react";
import InvoiceFieldMapper from "./InvoiceFieldMapper";

// Customer management: create, edit, activate/suspend, and delete tenants,
// plus page assignment for software-plan (blue pill) tenants. All calls go
// through /api/admin/tenants* with the admin's session token.

const EMPTY_FORM = {
  company_name: "",
  contact_email: "",
  contact_phone: "",
  plan_type: "blue_pill",
  plan_tier: "starter",
  page_allowance: "25",
  leads_per_day: "5",
  lead_cap: "100",
  price_per_lead: "25",
  monthly_price: "",
  portal_password: "",
};

export default function TenantsPanel({ getToken }) {
  const [tenants, setTenants] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [creds, setCreds] = useState(null); // shown once after create
  const [showAdd, setShowAdd] = useState(false); // Add-tenant modal
  const [expanded, setExpanded] = useState(null);
  const [edit, setEdit] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [resetPw, setResetPw] = useState(null); // { id, password } shown once after reset
  const [stateList, setStateList] = useState([]); // states with available-page counts
  const [stateSel, setStateSel] = useState(""); // currently browsed state abbr
  const [statePages, setStatePages] = useState([]); // available pages in that state
  const [ownedStateOpen, setOwnedStateOpen] = useState(null); // state abbr whose owned-cities modal is open
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState(null); // open template modal tenant id
  const [templateData, setTemplateData] = useState(null); // current template info
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateMsg, setTemplateMsg] = useState(null);
  const [showMapper, setShowMapper] = useState(false);
  // HTML invoice template editor (logo + raw HTML/CSS, Puppeteer-rendered —
  // see lib/htmlInvoice.js). Replaces the old plain-text template system.
  const [htmlBody, setHtmlBody] = useState("");
  const [htmlName, setHtmlName] = useState("");
  const [logoData, setLogoData] = useState(null);
  const [htmlBusy, setHtmlBusy] = useState(false);
  const [htmlMsg, setHtmlMsg] = useState(null);

  async function api(path, options = {}) {
    const token = await getToken();
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function load() {
    try {
      const data = await api("/api/admin/tenants");
      setTenants(data.tenants);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // state list for the assign-pages browser of the expanded blue tenant
  useEffect(() => {
    if (!expanded) { setStateList([]); setStateSel(""); setStatePages([]); return; }
    (async () => {
      try {
        const data = await api(`/api/admin/tenants/${expanded}/pages?states=1`);
        setStateList(data.states || []);
      } catch {
        setStateList([]);
      }
    })();
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // pages for the chosen state
  useEffect(() => {
    if (!expanded || !stateSel || stateSel === "__ALL__") { setStatePages([]); return; }
    (async () => {
      try {
        const data = await api(`/api/admin/tenants/${expanded}/pages?state=${encodeURIComponent(stateSel)}`);
        setStatePages(data.results || []);
      } catch {
        setStatePages([]);
      }
    })();
  }, [stateSel, expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function createTenant(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setCreds(null);
    try {
      const out = await api("/api/admin/tenants", { method: "POST", body: JSON.stringify(form) });
      setCreds({ login: out.portal_login, note: out.note });
      setForm(EMPTY_FORM);
      setShowAdd(false);
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setCreating(false);
    }
  }

  async function patchTenant(id, patch) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetTenantPassword(id) {
    setBusy(true);
    setError(null);
    setResetPw(null);
    try {
      const out = await api(`/api/admin/tenants/${id}`, { method: "PATCH", body: JSON.stringify({ reset_password: true }) });
      setResetPw({ id, password: out.new_password });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTenant(id) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/tenants/${id}`, { method: "DELETE" });
      setConfirmDelete(null);
      setExpanded(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openTemplate(t) {
    setTemplate(t.id);
    setTemplateMsg(null);
    setTemplateLoading(true);
    setTemplateData(null);
    setHtmlMsg(null);
    try {
      const d = await api(`/api/admin/tenants/${t.id}/invoice-template`);
      setTemplateData(d);
      if (d.template_kind === "html") {
        setHtmlBody(d.html_body || "");
        setLogoData(d.logo_data || null);
        setHtmlName(d.name || "");
      } else {
        setHtmlBody("");
        setLogoData(null);
        setHtmlName("");
      }
    } catch (e) {
      setTemplateMsg(e.message);
    } finally {
      setTemplateLoading(false);
    }
  }

  function closeTemplate() {
    setTemplate(null);
    setHtmlMsg(null);
    setHtmlBody("");
    setLogoData(null);
    setHtmlName("");
  }

  async function loadDefaultHtmlTemplate() {
    setHtmlBusy(true);
    setHtmlMsg(null);
    try {
      const d = await api("/api/admin/default-invoice-template");
      setHtmlBody(d.html);
      setHtmlMsg({ ok: true, text: "Loaded the Scherz Trucking INC default as a starting point — edit and save." });
    } catch (e) {
      setHtmlMsg({ ok: false, text: e.message });
    } finally {
      setHtmlBusy(false);
    }
  }

  function onLogoPicked(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => setLogoData(fr.result);
    fr.readAsDataURL(f);
  }

  async function saveHtmlTemplate() {
    if (!htmlBody.trim()) {
      setHtmlMsg({ ok: false, text: "Add some HTML first (or load the default as a starting point)." });
      return;
    }
    setHtmlBusy(true);
    setHtmlMsg(null);
    try {
      await api(`/api/admin/tenants/${template}/invoice-template`, {
        method: "PATCH",
        body: JSON.stringify({ template_kind: "html", html_body: htmlBody, logo_data: logoData, name: htmlName || "HTML Invoice" }),
      });
      const fresh = await api(`/api/admin/tenants/${template}/invoice-template`);
      setTemplateData(fresh);
      setHtmlMsg({ ok: true, text: "HTML template saved and made active." });
    } catch (e) {
      setHtmlMsg({ ok: false, text: e.message });
    } finally {
      setHtmlBusy(false);
    }
  }

  async function previewHtmlTemplate() {
    setHtmlBusy(true);
    setHtmlMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/tenants/${template}/invoice-template/preview-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ html_body: htmlBody, logo_data: logoData }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Preview failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setHtmlMsg({ ok: false, text: e.message });
    } finally {
      setHtmlBusy(false);
    }
  }

  async function uploadTemplate(file) {
    if (!file) return;
    setTemplateBusy(true);
    setTemplateMsg(null);
    try {
      const type = file.name.split(".").pop().toLowerCase();
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      await api(`/api/admin/tenants/${template}/invoice-template`, {
        method: "PATCH",
        body: JSON.stringify({ file: dataUrl, name: file.name, type }),
      });
      const fresh = await api(`/api/admin/tenants/${template}/invoice-template`);
      setTemplateData(fresh);
      setTemplateMsg("New template version uploaded.");
    } catch (e) {
      setTemplateMsg(e.message);
    } finally {
      setTemplateBusy(false);
    }
  }

  async function deleteTemplate() {
    setTemplateBusy(true);
    setTemplateMsg(null);
    try {
      await api(`/api/admin/tenants/${template}/invoice-template`, { method: "DELETE" });
      const fresh = await api(`/api/admin/tenants/${template}/invoice-template`);
      setTemplateData(fresh);
      setTemplateMsg("Template deactivated — falls back to the Scherz Trucking INC default invoice. Past versions are kept.");
    } catch (e) {
      setTemplateMsg(e.message);
    } finally {
      setTemplateBusy(false);
    }
  }

  async function activateVersion(versionId) {
    setTemplateBusy(true);
    setTemplateMsg(null);
    try {
      await api(`/api/admin/tenants/${template}/invoice-template/activate`, {
        method: "POST",
        body: JSON.stringify({ version_id: versionId }),
      });
      const fresh = await api(`/api/admin/tenants/${template}/invoice-template`);
      setTemplateData(fresh);
      setTemplateMsg("Active version switched.");
    } catch (e) {
      setTemplateMsg(e.message);
    } finally {
      setTemplateBusy(false);
    }
  }

  async function refreshBrowser(tenantId) {
    try {
      const data = await api(`/api/admin/tenants/${tenantId}/pages?states=1`);
      setStateList(data.states || []);
      if (stateSel) {
        const pg = await api(`/api/admin/tenants/${tenantId}/pages?state=${encodeURIComponent(stateSel)}`);
        setStatePages(pg.results || []);
      }
    } catch {
      // list refresh is best-effort
    }
  }

  async function assignPage(tenantId, pageId) {
    setBusy(true);
    try {
      await api(`/api/admin/tenants/${tenantId}/pages`, { method: "POST", body: JSON.stringify({ page_id: pageId }) });
      await Promise.all([load(), refreshBrowser(tenantId)]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignWholeState(tenantId, stateAbbr) {
    setBusy(true);
    try {
      await api(`/api/admin/tenants/${tenantId}/pages`, {
        method: "POST",
        body: JSON.stringify({ state: stateAbbr, all: true }),
      });
      await Promise.all([load(), refreshBrowser(tenantId)]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // "All states" option in the assign dropdown: every unowned published page.
  async function assignAllStates(tenantId) {
    setBusy(true);
    try {
      await api(`/api/admin/tenants/${tenantId}/pages`, {
        method: "POST",
        body: JSON.stringify({ all_states: true }),
      });
      setStateSel("");
      await Promise.all([load(), refreshBrowser(tenantId)]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function returnWholeState(tenantId, stateAbbr) {
    setBusy(true);
    try {
      await api(`/api/admin/tenants/${tenantId}/pages`, {
        method: "DELETE",
        body: JSON.stringify({ state: stateAbbr, all: true }),
      });
      setOwnedStateOpen(null);
      await Promise.all([load(), refreshBrowser(tenantId)]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function unassignPage(tenantId, pageId) {
    setBusy(true);
    try {
      await api(`/api/admin/tenants/${tenantId}/pages`, { method: "DELETE", body: JSON.stringify({ page_id: pageId }) });
      await Promise.all([load(), refreshBrowser(tenantId)]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(t) {
    setExpanded(expanded === t.id ? null : t.id);
    setConfirmDelete(null);
    setStateSel("");
    setStatePages([]);
    setEdit({
      company_name: t.company_name,
      contact_phone: t.contact_phone || "",
      plan_tier: t.plan_tier,
      page_allowance: t.page_allowance ?? "",
      leads_per_day: t.leads_per_day ?? "",
      lead_cap: t.lead_cap ?? "",
      price_per_lead: t.price_per_lead ?? "",
    });
  }

  const isBlue = form.plan_type === "blue_pill";

  return (
    <>
      <div className="section-head page-head">
        <span>Tenants</span>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="tn-hint">{tenants ? `${tenants.length} total` : "loading..."}</span>
          <button onClick={() => { setShowAdd(true); setCreds(null); setError(null); }}>+ New Tenant</button>
        </span>
      </div>
      <div className="section" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        {error && <div className="tn-error">{error}</div>}
        {creds && (
          <div className="tn-creds">
            {creds.login ? (
              <>
                <b>{creds.login.custom ? "Portal login created with your password:" : "Portal login created — copy it now, it won't be shown again:"}</b>
                <div className="mono">{creds.login.email} / {creds.login.password}</div>
                <div>They sign in at <span className="mono">/portal</span>.</div>
              </>
            ) : (
              <b>{creds.note}</b>
            )}
          </div>
        )}
        {tenants && tenants.length === 0 && (
          <div className="aq-reason" style={{ padding: "14px 18px" }}>No tenants yet — create the first one above.</div>
        )}
        {(tenants || []).map((t) => (
          <div key={t.id} className="tn-item">
            <div className="tn-row">
              <div>
                <span className={`tn-badge ${t.plan_type === "blue_pill" ? "blue" : "red"}`}>
                  {t.plan_type === "blue_pill" ? "software" : "leads"}
                </span>
                <span className={`tn-badge ${t.status === "active" ? "ok" : "off"}`}>{t.status}</span>
                <span className={`tn-badge ${t.receiving_leads ? "ok" : "off"}`}>{t.receiving_leads ? "receiving leads" : "not receiving"}</span>
                <div className="tn-name">{t.company_name}</div>
                <div className="tn-meta mono">{t.contact_email}{t.contact_phone ? ` · ${t.contact_phone}` : ""}</div>
                <div className="tn-meta">
                  {t.plan_tier} tier
                  {t.plan_type === "blue_pill"
                    ? ` · ${t.pages_count}${t.page_allowance ? `/${t.page_allowance}` : ""} pages`
                    : ` · ${t.leads_per_day || "∞"}/day, cap ${t.lead_cap || "∞"}/mo${t.price_per_lead ? ` · $${Number(t.price_per_lead)}/lead` : ""}`}
                  {` · ${t.leads_month} leads this month`}
                  {t.created_by ? ` · by ${t.created_by}` : ""}
                  {t.updated_at ? ` · updated ${String(t.updated_at).slice(0, 10)}` : ""}
                </div>
              </div>
              <div className="tn-actions">
                <button onClick={() => openEdit(t)}>{expanded === t.id ? "Close" : "Edit"}</button>
                <button
                  disabled={busy}
                  onClick={() => patchTenant(t.id, { receiving_leads: !t.receiving_leads })}
                  title="Toggle whether new inbound leads route to this tenant"
                >
                  {t.receiving_leads ? "Stop leads" : "Send leads"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => patchTenant(t.id, { status: t.status === "active" ? "suspended" : "active" })}
                >
                  {t.status === "active" ? "Suspend" : "Activate"}
                </button>
                <button disabled={busy} onClick={() => resetTenantPassword(t.id)} title="Reset this tenant's /portal login password">
                  Reset password
                </button>
                <button disabled={busy} onClick={() => openTemplate(t)} title="Manage this tenant's branded invoice template">
                  Invoice Template
                </button>
                {confirmDelete === t.id ? (
                  <button className="danger" disabled={busy} onClick={() => deleteTenant(t.id)}>Confirm delete?</button>
                ) : (
                  <button className="danger" onClick={() => setConfirmDelete(t.id)}>Delete</button>
                )}
              </div>
            </div>

            {resetPw && resetPw.id === t.id && (
              <div className="tn-creds">
                <b>New portal password — copy it now, it won't be shown again:</b>
                <div className="mono">{t.contact_email} / {resetPw.password}</div>
              </div>
            )}

            {expanded === t.id && (
              <div className="tn-expand">
                <div className="tn-grid">
                  <input placeholder="Company name" value={edit.company_name} onChange={(e) => setEdit({ ...edit, company_name: e.target.value })} />
                  <input placeholder="Phone" value={edit.contact_phone} onChange={(e) => setEdit({ ...edit, contact_phone: e.target.value })} />
                  <select value={edit.plan_tier} onChange={(e) => setEdit({ ...edit, plan_tier: e.target.value })}>
                    <option value="starter">starter</option>
                    <option value="growth">growth</option>
                    <option value="pro">pro</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                  {t.plan_type === "blue_pill" ? (
                    <input type="number" placeholder="Page allowance" value={edit.page_allowance} onChange={(e) => setEdit({ ...edit, page_allowance: e.target.value })} />
                  ) : (
                    <>
                      <input type="number" placeholder="Leads/day" value={edit.leads_per_day} onChange={(e) => setEdit({ ...edit, leads_per_day: e.target.value })} />
                      <input type="number" placeholder="Monthly cap" value={edit.lead_cap} onChange={(e) => setEdit({ ...edit, lead_cap: e.target.value })} />
                      <input type="number" step="0.01" placeholder="Price per lead $" value={edit.price_per_lead} onChange={(e) => setEdit({ ...edit, price_per_lead: e.target.value })} />
                    </>
                  )}
                </div>
                <button className="tn-btn primary" disabled={busy} onClick={() => patchTenant(t.id, edit)}>Save changes</button>

                {t.plan_type === "blue_pill" && (() => {
                  // Group owned pages into one compact cell per state — click a
                  // cell to manage that state's cities in a modal (no chip flood).
                  const byState = {};
                  for (const p of t.pages) (byState[p.state] = byState[p.state] || []).push(p);
                  const ownedStates = Object.keys(byState).sort();
                  const openPages = ownedStateOpen ? byState[ownedStateOpen] || [] : [];
                  const totalAvailable = stateList.reduce((s, x) => s + Number(x.available || 0), 0);
                  return (
                  <div className="tn-pages">
                    <div className="tn-pages-head">Owned pages ({t.pages.length})</div>
                    <div className="tn-state-grid">
                      {ownedStates.map((st) => (
                        <button key={st} className="tn-state-cell" disabled={busy} onClick={() => setOwnedStateOpen(st)} title={`Manage ${st} pages`}>
                          <b>{st}</b>
                          <span>{byState[st].length} page{byState[st].length > 1 ? "s" : ""}</span>
                        </button>
                      ))}
                      {t.pages.length === 0 && <span className="tn-meta">none yet — assign below</span>}
                    </div>

                    <div className="tn-pages-head" style={{ marginTop: 12 }}>Assign pages by state</div>
                    <select
                      className="tn-search"
                      value={stateSel}
                      onChange={(e) => setStateSel(e.target.value)}
                    >
                      <option value="">Choose a state…</option>
                      {totalAvailable > 0 && <option value="__ALL__">All states — {totalAvailable} available</option>}
                      {stateList.map((s) => (
                        <option key={s.abbr} value={s.abbr}>
                          {s.name} — {s.available} available
                        </option>
                      ))}
                    </select>
                    {stateSel === "__ALL__" ? (
                      <div className="tn-slide open">
                        <button className="tn-btn tn-whole-state" disabled={busy} onClick={() => assignAllStates(t.id)}>
                          + Assign ALL states ({totalAvailable} page{totalAvailable > 1 ? "s" : ""})
                        </button>
                      </div>
                    ) : (
                    <div className={`tn-slide ${stateSel ? "open" : ""}`}>
                      {stateSel && statePages.length === 0 && (
                        <div className="tn-meta" style={{ padding: "8px 0" }}>No unassigned pages left in this state.</div>
                      )}
                      {statePages.length > 0 && (
                        <button
                          className="tn-btn tn-whole-state"
                          disabled={busy}
                          onClick={() => assignWholeState(t.id, stateSel)}
                        >
                          + Assign whole state ({statePages.length} page{statePages.length > 1 ? "s" : ""})
                        </button>
                      )}
                      <div className="tn-chips" style={{ marginTop: 10 }}>
                        {statePages.map((p) => (
                          <span className="tn-chip add" key={p.id}>
                            {p.city}, {p.state}
                            <button disabled={busy} onClick={() => assignPage(t.id, p.id)} title="Assign to tenant">+</button>
                          </span>
                        ))}
                      </div>
                    </div>
                    )}

                    {ownedStateOpen && (
                      <div className="tn-modal-overlay" onClick={() => setOwnedStateOpen(null)}>
                        <div className="tn-modal" onClick={(e) => e.stopPropagation()}>
                          <div className="tn-modal-head">
                            <h3>{ownedStateOpen} — {openPages.length} owned page{openPages.length === 1 ? "" : "s"}</h3>
                            <button className="tn-modal-x" onClick={() => setOwnedStateOpen(null)} aria-label="Close">×</button>
                          </div>
                          <div className="tn-modal-body">
                            <div className="tn-chips">
                              {openPages.map((p) => (
                                <span className="tn-chip" key={p.id}>
                                  {p.city}, {p.state}
                                  <button disabled={busy} onClick={() => unassignPage(t.id, p.id)} title="Return to platform">×</button>
                                </span>
                              ))}
                              {openPages.length === 0 && <span className="tn-meta">no pages left in this state</span>}
                            </div>
                          </div>
                          <div className="tn-modal-foot">
                            <button className="tn-btn danger" disabled={busy || openPages.length === 0} onClick={() => returnWholeState(t.id, ownedStateOpen)}>
                              Return whole state
                            </button>
                            <button className="tn-btn" onClick={() => setOwnedStateOpen(null)}>Done</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
      </div>

      {template && (
        <div className="tn-modal-overlay" onClick={closeTemplate}>
          <div className="tn-modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="tn-modal-head">
              <h3>Invoice Template</h3>
              <button className="tn-modal-x" onClick={closeTemplate} aria-label="Close">×</button>
            </div>
            <div className="tn-modal-body">
              {templateLoading && <div className="tn-meta">Loading…</div>}
              {!templateLoading && templateData && (
                <>
                  <div className="tn-hint" style={{ marginBottom: 12 }}>
                    {templateData.has_template
                      ? <>Custom template active. Invoices for this tenant use it instead of the default Scherz Trucking INC template.</>
                      : <>No custom template — invoices fall back to the default Scherz Trucking INC template.</>}
                  </div>
                  {templateData.has_template && (
                    <div className="tn-meta mono" style={{ marginBottom: 12 }}>
                      {templateData.name} · {templateData.template_kind === "html" ? "html" : templateData.type} · v{templateData.version}
                      {templateData.is_acroform && " · fillable form"}
                      {templateData.updated_at ? ` · ${String(templateData.updated_at).slice(0, 10)}` : ""}
                    </div>
                  )}
                  {templateMsg && <div className="tn-creds" style={{ marginBottom: 12 }}>{templateMsg}</div>}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    <label className="tn-btn primary" style={{ cursor: "pointer" }}>
                      {templateData?.has_template ? "Upload / Replace" : "Upload Template"}
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        disabled={templateBusy}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadTemplate(f); e.target.value = ""; }}
                      />
                    </label>
                    {templateData?.has_template && templateData.template_kind !== "html" && (
                      <>
                        <a className="tn-btn" href={templateData.file} target="_blank" rel="noreferrer">Preview Template</a>
                        <a className="tn-btn" href={templateData.file} download={templateData.name || "invoice-template"}>Download Original</a>
                        <button className="tn-btn danger" disabled={templateBusy} onClick={deleteTemplate}>Delete Template</button>
                      </>
                    )}
                  </div>

                  {templateData?.has_template && templateData.template_kind !== "html" && templateData.type === "pdf" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <button className="tn-btn primary" onClick={() => setShowMapper(true)}>
                        {templateData.fields?.length ? "Edit Field Map" : "Map Fields"}
                      </button>
                      <span className="tn-hint">
                        {templateData.fields?.length
                          ? `${templateData.fields.length} field${templateData.fields.length === 1 ? "" : "s"} mapped — CRM fills this exact PDF.`
                          : "Not mapped yet — CRM falls back to the Scherz Trucking INC default invoice until fields are placed."}
                      </span>
                    </div>
                  )}
                  {templateData?.has_template && templateData.template_kind !== "html" && templateData.type !== "pdf" && (
                    <div className="tn-hint" style={{ marginBottom: 14 }}>
                      Field mapping only works for PDF templates. This is an image — CRM uses the Scherz Trucking INC default invoice for this tenant instead.
                    </div>
                  )}

                  {templateData?.has_template && templateData.parsed && (
                    <div className="tn-meta" style={{ fontSize: 12 }}>
                      {templateData.parsed.dimensions ? `${templateData.parsed.dimensions.width}×${templateData.parsed.dimensions.height}px · ` : ""}
                      {templateData.parsed.size_bytes ? `${(templateData.parsed.size_bytes / 1024).toFixed(0)}KB` : ""}
                    </div>
                  )}

                  {templateData.versions?.length > 1 && (
                    <div style={{ marginTop: 14 }}>
                      <div className="tn-pages-head">Version history</div>
                      {templateData.versions.map((v) => (
                        <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                          <span className="tn-meta" style={{ fontSize: 12 }}>
                            v{v.version} · {v.name} · {String(v.created_at).slice(0, 10)}
                            {v.id === templateData.version_id && <span className="tn-badge ok" style={{ marginLeft: 8 }}>active</span>}
                          </span>
                          {v.id !== templateData.version_id && (
                            <button className="tn-btn" disabled={templateBusy} onClick={() => activateVersion(v.id)}>Make active</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {!templateLoading && templateMsg && !templateData && <div className="tn-creds">{templateMsg}</div>}

              <div style={{ borderTop: "1px solid var(--line)", marginTop: 18, paddingTop: 16 }}>
                <div className="tn-hint" style={{ marginBottom: 10 }}>
                  <strong style={{ color: "var(--text)" }}>HTML invoice template</strong> — a real HTML/CSS
                  page (Puppeteer renders it to PDF), instead of dragging boxes onto a flat PDF. Upload a
                  logo and edit the markup directly; use <code>{"{{token}}"}</code> for order data and{" "}
                  <code>{"{{{vehicle_rows}}}"}</code> for the vehicle table body (one row per vehicle,
                  handled automatically). Saving makes this the active template — it takes over from any
                  PDF/image template above. If a tenant has neither, CRM uses the Scherz Trucking INC default.
                </div>
                {templateData?.template_kind === "html" && (
                  <div className="tn-badge ok" style={{ marginBottom: 10, display: "inline-block" }}>HTML template active</div>
                )}
                {htmlMsg && <div className={htmlMsg.ok ? "tn-creds" : "tn-error"} style={{ margin: "0 0 12px", padding: htmlMsg.ok ? "14px 16px" : 0 }}>{htmlMsg.text}</div>}

                <input
                  className="tn-search"
                  style={{ marginBottom: 8, maxWidth: "none" }}
                  placeholder="Template name (e.g. Branded Invoice)"
                  value={htmlName}
                  onChange={(e) => setHtmlName(e.target.value)}
                />

                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                  <label className="tn-btn" style={{ cursor: "pointer" }}>
                    {logoData ? "Replace logo" : "Upload logo"}
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={onLogoPicked} />
                  </label>
                  {logoData && (
                    <>
                      <img src={logoData} alt="logo preview" style={{ height: 32, maxWidth: 140, objectFit: "contain" }} />
                      <button className="tn-btn danger" onClick={() => setLogoData(null)}>Remove logo</button>
                    </>
                  )}
                  <button className="tn-btn" disabled={htmlBusy} onClick={loadDefaultHtmlTemplate}>Load Scherz Trucking INC default as a starting point</button>
                </div>

                <textarea
                  className="tn-search"
                  style={{ maxWidth: "none", width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 12 }}
                  rows={16}
                  placeholder="Paste or write your HTML/CSS invoice template here, or click 'Load Scherz Trucking INC default' above to start from a working one."
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                />

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="tn-btn" disabled={htmlBusy || !htmlBody.trim()} onClick={previewHtmlTemplate}>
                    {htmlBusy ? "Working…" : "Preview (sample data)"}
                  </button>
                  <button className="tn-btn primary" disabled={htmlBusy} onClick={saveHtmlTemplate}>
                    {htmlBusy ? "Saving…" : "Save & Activate"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="tn-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="tn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tn-modal-head">
              <h3>New tenant</h3>
              <button className="tn-modal-x" onClick={() => setShowAdd(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={createTenant}>
              <div className="tn-modal-body">
                <div className="tn-hint" style={{ marginBottom: 12 }}>Creates their portal login too.</div>
                <div className="tn-grid">
                  <input required placeholder="Company name" value={form.company_name} onChange={set("company_name")} />
                  <input required type="email" placeholder="Contact email (their portal login)" value={form.contact_email} onChange={set("contact_email")} />
                  <input placeholder="Phone (optional)" value={form.contact_phone} onChange={set("contact_phone")} />
                  <select value={form.plan_type} onChange={set("plan_type")}>
                    <option value="blue_pill">Software plan (blue pill — owns pages)</option>
                    <option value="red_pill">Leads plan (red pill — buys leads)</option>
                  </select>
                  <select value={form.plan_tier} onChange={set("plan_tier")}>
                    <option value="starter">starter</option>
                    <option value="growth">growth</option>
                    <option value="pro">pro</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                  {isBlue ? (
                    <input type="number" min="1" placeholder="Page allowance" value={form.page_allowance} onChange={set("page_allowance")} />
                  ) : (
                    <>
                      <input type="number" min="1" placeholder="Leads per day" value={form.leads_per_day} onChange={set("leads_per_day")} />
                      <input type="number" min="1" placeholder="Monthly lead cap" value={form.lead_cap} onChange={set("lead_cap")} />
                      <input type="number" min="0" step="0.01" placeholder="Price per lead $" value={form.price_per_lead} onChange={set("price_per_lead")} />
                    </>
                  )}
                  <input type="number" min="0" placeholder="Monthly price $ (optional)" value={form.monthly_price} onChange={set("monthly_price")} />
                  <input
                    type="text"
                    minLength={8}
                    placeholder="Portal password (optional — auto-generated if empty)"
                    autoComplete="off"
                    value={form.portal_password}
                    onChange={set("portal_password")}
                  />
                </div>
              </div>
              <div className="tn-modal-foot">
                <button type="button" className="tn-btn" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="tn-btn primary" type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMapper && template && templateData?.has_template && (
        <InvoiceFieldMapper
          tenantId={template}
          templateData={templateData}
          getToken={getToken}
          onClose={() => setShowMapper(false)}
          onSaved={(fields) => { setTemplateData({ ...templateData, fields }); setShowMapper(false); }}
        />
      )}
    </>
  );
}
