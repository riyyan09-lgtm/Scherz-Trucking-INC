"use client";

import { useEffect, useState } from "react";

// Agent Lead Assignment Management: dashboard visibility + full control over
// every agent's assigned leads (reassign, unassign, redistribute a queue when
// someone's off, and an audit trail of it all). Sibling to AgentsPanel (which
// stays focused on roster/broker-earnings); this one is about who owns which
// lead right now and moving that around safely.

const AVAILABILITY = [
  ["active", "Active"],
  ["busy", "Busy"],
  ["off_today", "Off Today"],
  ["vacation", "Vacation"],
  ["disabled", "Disabled"],
];
const LEAD_FILTERS = [
  ["all", "All"],
  ["untouched", "Untouched"],
  ["contacted", "Contacted"],
  ["quoted", "Quoted"],
  ["converted", "Converted"],
  ["lost", "Lost"],
];

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }) +
    " " + new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function statusLabel(s) {
  if (s === "dead") return "Lost";
  if (!s) return "—";
  return s[0].toUpperCase() + s.slice(1);
}

export default function LeadManagementPanel({ getToken }) {
  const [data, setData] = useState(null); // { summary, agents }
  const [loadError, setLoadError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // View Leads sub-view
  const [activeAgent, setActiveAgent] = useState(null); // { id, name } — id may be "unassigned"
  const [leads, setLeads] = useState(null);
  const [leadFilter, setLeadFilter] = useState("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);

  // Modals
  const [reassignModal, setReassignModal] = useState(null); // { leadIds, fromLabel }
  const [reassignForm, setReassignForm] = useState({ toAgentId: "", keepDate: false, resetFollowUp: false, notify: true, reason: "" });
  const [confirmMsg, setConfirmMsg] = useState(null);
  const [redistAgent, setRedistAgent] = useState(null); // agent being redistributed
  const [redistTo, setRedistTo] = useState(new Set());
  const [redistPreview, setRedistPreview] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);

  // Add Leads (bulk import) modal
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState(null); // { name, base64 }
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null); // { inserted, skipped, errors, truncated }
  const [importError, setImportError] = useState(null);

  async function api(path, options = {}) {
    const token = await getToken();
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
    try {
      setData(await api("/api/portal/lead-management"));
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLeads(agent, filter = leadFilter, search = leadSearch) {
    try {
      const qs = new URLSearchParams({ agent_id: String(agent.id), filter, search });
      const out = await api(`/api/portal/lead-management/leads?${qs}`);
      setLeads(out.leads);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  }
  function openViewLeads(agent) {
    setActiveAgent(agent);
    setLeadFilter("all");
    setLeadSearch("");
    setSelected(new Set());
    setConfirmDeleteSelected(false);
    setLeads(null);
    loadLeads(agent, "all", "");
  }
  function closeViewLeads() {
    setActiveAgent(null);
    setLeads(null);
    setSelected(new Set());
    setConfirmDeleteSelected(false);
  }
  function changeFilter(f) {
    setLeadFilter(f);
    setSelected(new Set());
    setConfirmDeleteSelected(false);
    loadLeads(activeAgent, f, leadSearch);
  }
  function runSearch(v) {
    setLeadSearch(v);
    loadLeads(activeAgent, leadFilter, v);
  }
  function toggleOne(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((s) => (s.size === (leads || []).length ? new Set() : new Set((leads || []).map((l) => l.id))));
  }

  function openReassign(leadIds, fromLabel, fromAgentId = null) {
    setReassignForm({ toAgentId: "", keepDate: false, resetFollowUp: false, notify: true, reason: "" });
    setConfirmMsg(null);
    setReassignModal({ leadIds, fromLabel, fromAgentId });
  }
  // Card-level "Reassign Leads": moves this agent's ENTIRE current queue.
  // Lead ids aren't in the summary payload (just counts), so fetch them first.
  async function openReassignForAgent(agent) {
    setBusy(true);
    setMsg(null);
    try {
      const out = await api(`/api/portal/lead-management/leads?agent_id=${agent.id}&filter=all`);
      const ids = out.leads.filter((l) => l.status !== "dead").map((l) => l.id);
      if (ids.length === 0) { setMsg({ ok: false, text: `${agent.name} has no active leads to reassign.` }); return; }
      openReassign(ids, agent.name, agent.id);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function submitReassign(force = false) {
    if (!reassignModal) return;
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("/api/portal/lead-management/reassign", {
        method: "POST",
        body: JSON.stringify({
          lead_ids: reassignModal.leadIds,
          to_agent_id: reassignForm.toAgentId ? Number(reassignForm.toAgentId) : null,
          keep_assignment_date: reassignForm.keepDate,
          reset_follow_up: reassignForm.resetFollowUp,
          notify: reassignForm.notify,
          reason: reassignForm.reason || null,
          force,
        }),
      });
      if (out.needs_confirm) { setConfirmMsg(out.message); return; }
      setMsg({ ok: true, text: `Moved ${out.moved} lead${out.moved === 1 ? "" : "s"}.` });
      setReassignModal(null);
      setSelected(new Set());
      setConfirmDeleteSelected(false);
      await load();
      if (activeAgent) await loadLeads(activeAgent);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function unassignSelected(leadIds) {
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("/api/portal/lead-management/reassign", {
        method: "POST",
        body: JSON.stringify({ lead_ids: leadIds, to_agent_id: null }),
      });
      setMsg({ ok: true, text: `Unassigned ${out.moved} lead${out.moved === 1 ? "" : "s"}.` });
      setSelected(new Set());
      setConfirmDeleteSelected(false);
      await load();
      if (activeAgent) await loadLeads(activeAgent);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function archiveSelected(leadIds) {
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("/api/portal/lead-management/archive", {
        method: "POST",
        body: JSON.stringify({ lead_ids: leadIds }),
      });
      setMsg({ ok: true, text: `Archived ${out.archived} lead${out.archived === 1 ? "" : "s"}.` });
      setSelected(new Set());
      setConfirmDeleteSelected(false);
      await load();
      if (activeAgent) await loadLeads(activeAgent);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function deleteSelected(leadIds) {
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("/api/portal/lead-management/delete", {
        method: "POST",
        body: JSON.stringify({ lead_ids: leadIds }),
      });
      setMsg({ ok: true, text: `Deleted ${out.deleted} lead${out.deleted === 1 ? "" : "s"}.` });
      setSelected(new Set());
      setConfirmDeleteSelected(false);
      await load();
      if (activeAgent) await loadLeads(activeAgent);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function setAvailability(agent, availability) {
    setBusy(true);
    try {
      await api("/api/portal/agents", { method: "PATCH", body: JSON.stringify({ id: agent.id, availability }) });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  function openRedistribute(agent) {
    setRedistAgent(agent);
    setRedistTo(new Set());
    setRedistPreview(null);
  }
  async function toggleRedistTo(agentId) {
    const next = new Set(redistTo);
    next.has(agentId) ? next.delete(agentId) : next.add(agentId);
    setRedistTo(next);
    if (next.size === 0) { setRedistPreview(null); return; }
    try {
      const out = await api("/api/portal/lead-management/redistribute", {
        method: "POST",
        body: JSON.stringify({ from_agent_id: redistAgent.id, to_agent_ids: [...next], preview: true }),
      });
      setRedistPreview(out);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  }
  async function confirmRedistribute() {
    setBusy(true);
    setMsg(null);
    try {
      const out = await api("/api/portal/lead-management/redistribute", {
        method: "POST",
        body: JSON.stringify({ from_agent_id: redistAgent.id, to_agent_ids: [...redistTo] }),
      });
      setMsg({ ok: true, text: `Redistributed ${out.moved} lead${out.moved === 1 ? "" : "s"}.` });
      setRedistAgent(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  function openImport() {
    setImportText("");
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
    setImportOpen(true);
  }
  function closeImport() {
    setImportOpen(false);
  }
  function onImportFilePicked(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const comma = dataUrl.indexOf(",");
      setImportFile({ name: f.name, base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl });
    };
    reader.readAsDataURL(f);
  }
  async function submitImport() {
    setImportBusy(true);
    setImportError(null);
    setImportResult(null);
    try {
      const body = importFile
        ? { filename: importFile.name, file_base64: importFile.base64 }
        : { text: importText };
      const out = await api("/api/portal/lead-management/import", { method: "POST", body: JSON.stringify(body) });
      setImportResult(out);
      await load();
      if (activeAgent && activeAgent.id === "unassigned") await loadLeads(activeAgent);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImportBusy(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    try { setHistory((await api("/api/portal/lead-management/history")).history); } catch { setHistory([]); }
  }

  if (loadError) return <div className="tp-empty">{loadError}</div>;
  if (!data) return <div className="tp-empty">Loading…</div>;

  const { summary, agents } = data;
  const activeAgents = agents.filter((a) => a.id !== redistAgent?.id && a.availability !== "disabled");

  return (
    <>
      <div className="tp-section-head" style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--paper)", border: "none", padding: "0 0 14px" }}>
        <h2 style={{ fontSize: 18 }}>Lead Management</h2>
        <button className="tp-modal-cancel" onClick={openHistory}>History</button>
      </div>

      {msg && <p className={`tp-msg ${msg.ok ? "ok" : "err"}`} style={{ margin: "0 0 14px" }}>{msg.text}</p>}

      <div className="tp-summary-grid">
        <div className="tp-sum-card"><span className="tp-sum-l">Total Assigned Leads</span><span className="tp-sum-v">{summary.total_assigned}</span></div>
        <div className="tp-sum-card"><span className="tp-sum-l">Unassigned Leads</span><span className="tp-sum-v">{summary.unassigned}</span></div>
        <div className="tp-sum-card"><span className="tp-sum-l">Agents Active Today</span><span className="tp-sum-v">{summary.active_today}</span></div>
        <div className="tp-sum-card"><span className="tp-sum-l">Agents Off Today</span><span className="tp-sum-v">{summary.off_today}</span></div>
        <div className="tp-sum-card"><span className="tp-sum-l">Avg Conversion %</span><span className="tp-sum-v">{summary.avg_conversion_pct}%</span></div>
        <div className="tp-sum-card"><span className="tp-sum-l">Waiting &gt; 24h</span><span className="tp-sum-v">{summary.waiting_24h}</span></div>
        <div className="tp-sum-card"><span className="tp-sum-l">Waiting &gt; 72h</span><span className="tp-sum-v">{summary.waiting_72h}</span></div>
      </div>

      {!activeAgent ? (
        <div className="tp-agent-grid">
          <div className="tp-agent-card" style={{ cursor: "pointer" }} onClick={() => openViewLeads({ id: "unassigned", name: "Unassigned Leads" })}>
            <div className="tp-agent-card-head">
              <div className="tp-agent-id">
                <div className="tp-agent-name">Unassigned Leads</div>
                <div className="tp-agent-email">nobody owns these yet</div>
              </div>
            </div>
            <div className="tp-agent-bf">
              <div className="tp-bf-item"><span className="tp-bf-lbl">In queue</span><span className="tp-bf-val">{summary.unassigned}</span></div>
            </div>
            <div className="tp-agent-card-actions">
              <button>View Leads</button>
              <button onClick={(e) => { e.stopPropagation(); openImport(); }}>+ Add Leads</button>
            </div>
          </div>

          {agents.map((a) => (
            <div className={`tp-agent-card${a.availability === "active" ? "" : " is-inactive"}`} key={a.id}>
              <div className="tp-agent-card-head">
                <div className="tp-agent-id">
                  <div className="tp-agent-name">{a.name}</div>
                  <div className="tp-agent-email">{a.email}</div>
                </div>
              </div>

              <div className="tp-lm-queue">
                <div><span>Assigned</span><b>{a.queue.assigned}</b></div>
                <div><span>Untouched</span><b>{a.queue.untouched}</b></div>
                <div><span>Contacted</span><b>{a.queue.contacted}</b></div>
                <div><span>Quoted</span><b>{a.queue.quoted}</b></div>
                <div><span>Converted</span><b>{a.queue.converted}</b></div>
              </div>

              <div className="tp-lm-perf">
                {[["Today", a.today], ["This Week", a.week], ["This Month", a.month], ["Lifetime", a.lifetime]].map(([lbl, p]) => (
                  <div className="tp-lm-perf-row" key={lbl}>
                    <span className="tp-lm-perf-lbl">{lbl}</span>
                    <span>{p.assigned} assigned</span>
                    <span>{p.orders} orders</span>
                    <span>{p.conversion_pct}%</span>
                  </div>
                ))}
              </div>

              <label className="tp-lm-avail">
                <span>Status</span>
                <select value={a.availability} disabled={busy} onChange={(e) => setAvailability(a, e.target.value)}>
                  {AVAILABILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>

              <div className="tp-agent-card-actions">
                <button onClick={() => openViewLeads(a)}>View Leads</button>
                <button disabled={busy || a.queue.assigned === 0} onClick={() => openReassignForAgent(a)}>Reassign Leads</button>
                {a.availability !== "active" && a.queue.assigned > 0 && (
                  <button onClick={() => openRedistribute(a)}>Redistribute Queue</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--card)", borderRadius: "14px 14px 0 0" }}>
            <div className="tp-section-head">
              <h2>{activeAgent.name} — Leads</h2>
              <button className="tp-modal-cancel" onClick={closeViewLeads}>Back</button>
            </div>
            <div className="tp-lm-toolbar">
              <div className="tp-lm-filters">
                {LEAD_FILTERS.map(([v, l]) => (
                  <button key={v} className={leadFilter === v ? "active" : ""} onClick={() => changeFilter(v)}>{l}</button>
                ))}
              </div>
              <input
                className="tp-lm-search"
                placeholder="Search name, phone, email…"
                value={leadSearch}
                onChange={(e) => runSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="tp-section" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: 0 }}>

          {selected.size > 0 && (
            <div className="tp-lm-bulkbar">
              <span>{selected.size} selected</span>
              <button disabled={busy} onClick={() => openReassign([...selected], activeAgent.name, typeof activeAgent.id === "number" ? activeAgent.id : null)}>Reassign</button>
              <button disabled={busy} onClick={() => unassignSelected([...selected])}>Unassign</button>
              <button disabled={busy} onClick={() => archiveSelected([...selected])}>Archive</button>
              {confirmDeleteSelected ? (
                <button className="danger" disabled={busy} onClick={() => deleteSelected([...selected])}>Confirm delete?</button>
              ) : (
                <button className="danger" disabled={busy} onClick={() => setConfirmDeleteSelected(true)}>Delete</button>
              )}
            </div>
          )}

          {!leads ? (
            <div className="tp-empty">Loading…</div>
          ) : leads.length === 0 ? (
            <div className="tp-empty">No leads match.</div>
          ) : (
            <div className="tp-lm-table-wrap">
              <table className="tp-lm-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={selected.size === leads.length} onChange={toggleAll} /></th>
                    <th>ID</th><th>Customer</th><th>Phone</th><th>Assigned</th><th>Status</th>
                    <th>Last Contact</th><th>Last Activity</th><th>Quote Created</th><th>Order Created</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleOne(l.id)} /></td>
                      <td className="mono">{l.id}</td>
                      <td>{l.customer}</td>
                      <td className="mono">{l.phone}</td>
                      <td>{fmtDate(l.agent_assigned_at)}</td>
                      <td>{statusLabel(l.status)}</td>
                      <td>{fmtDate(l.last_contacted)}</td>
                      <td>{fmtDate(l.last_activity)}</td>
                      <td>{fmtDate(l.quoted_at)}</td>
                      <td>{fmtDate(l.closed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </>
      )}

      {/* REASSIGN MODAL */}
      {reassignModal && (
        <div className="tp-modal-overlay" onClick={() => setReassignModal(null)}>
          <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tp-modal-head">
              <h3>Move {reassignModal.leadIds.length} lead{reassignModal.leadIds.length === 1 ? "" : "s"}</h3>
              <button className="tp-modal-x" onClick={() => setReassignModal(null)} aria-label="Close">×</button>
            </div>
            <div className="tp-modal-body">
              <div className="tp-modal-field"><span>From</span><input value={reassignModal.fromLabel} disabled /></div>
              <label className="tp-modal-field"><span>To</span>
                <select value={reassignForm.toAgentId} onChange={(e) => setReassignForm({ ...reassignForm, toAgentId: e.target.value })}>
                  <option value="">Choose an agent…</option>
                  {agents.filter((a) => a.id !== reassignModal.fromAgentId).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label className="tp-modal-field"><span>Reason <em>(optional, kept in the audit trail)</em></span>
                <input value={reassignForm.reason} onChange={(e) => setReassignForm({ ...reassignForm, reason: e.target.value })} placeholder="e.g. workload balancing" />
              </label>
              <label className="tp-check"><input type="checkbox" checked={reassignForm.keepDate} onChange={(e) => setReassignForm({ ...reassignForm, keepDate: e.target.checked })} /> Keep assignment date</label>
              <label className="tp-check"><input type="checkbox" checked={reassignForm.resetFollowUp} onChange={(e) => setReassignForm({ ...reassignForm, resetFollowUp: e.target.checked })} /> Reset follow-up schedule</label>
              <label className="tp-check"><input type="checkbox" checked={reassignForm.notify} onChange={(e) => setReassignForm({ ...reassignForm, notify: e.target.checked })} /> Notify receiving agent</label>
              {confirmMsg && <p className="tp-msg err">{confirmMsg}</p>}
            </div>
            <div className="tp-modal-foot">
              <button className="tp-modal-cancel" onClick={() => setReassignModal(null)}>Cancel</button>
              {confirmMsg ? (
                <button className="request-btn" disabled={busy} onClick={() => submitReassign(true)}>Continue anyway</button>
              ) : (
                <button className="request-btn" disabled={busy || !reassignForm.toAgentId} onClick={() => submitReassign(false)}>Move Leads</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REDISTRIBUTE MODAL */}
      {redistAgent && (
        <div className="tp-modal-overlay" onClick={() => setRedistAgent(null)}>
          <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tp-modal-head">
              <h3>Redistribute {redistAgent.name}'s queue</h3>
              <button className="tp-modal-x" onClick={() => setRedistAgent(null)} aria-label="Close">×</button>
            </div>
            <div className="tp-modal-body">
              <p className="tp-msg">Move all {redistAgent.queue.assigned} leads? Assign evenly between:</p>
              {activeAgents.length === 0 && <p className="tp-msg err">No other active agents to receive leads.</p>}
              {activeAgents.map((a) => (
                <label className="tp-check" key={a.id}>
                  <input type="checkbox" checked={redistTo.has(a.id)} onChange={() => toggleRedistTo(a.id)} /> {a.name}
                  {redistPreview && redistTo.has(a.id) && (
                    <span className="tp-muted"> — {redistPreview.distribution.find((d) => d.agent_id === a.id)?.count || 0} leads</span>
                  )}
                </label>
              ))}
            </div>
            <div className="tp-modal-foot">
              <button className="tp-modal-cancel" onClick={() => setRedistAgent(null)}>Cancel</button>
              <button className="request-btn" disabled={busy || redistTo.size === 0} onClick={confirmRedistribute}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGNMENT HISTORY MODAL */}
      {historyOpen && (
        <div className="tp-modal-overlay" onClick={() => setHistoryOpen(false)}>
          <div className="tp-modal tp-stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tp-modal-head">
              <h3>Assignment History</h3>
              <button className="tp-modal-x" onClick={() => setHistoryOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="tp-modal-body" style={{ maxHeight: 420, overflowY: "auto" }}>
              {history.length === 0 && <p className="tp-msg">No reassignments yet.</p>}
              {history.map((h) => (
                <div key={h.id} className="tp-lm-hist-item">
                  <div><b>Lead #{h.lead_id}</b> — {h.customer}</div>
                  <div className="tp-muted">{h.summary} · {h.actor} · {fmtDate(h.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ADD LEADS (BULK IMPORT) MODAL */}
      {importOpen && (
        <div className="tp-modal-overlay" onClick={closeImport}>
          <div className="tp-modal tp-stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tp-modal-head">
              <h3>Add Leads</h3>
              <button className="tp-modal-x" onClick={closeImport} aria-label="Close">×</button>
            </div>
            <div className="tp-modal-body">
              {!importResult ? (
                <>
                  <p className="tp-msg">Paste a text template, or upload a .xlsx spreadsheet or .pdf. New leads land unassigned, ready to hand out from this card.</p>
                  <p className="tp-muted" style={{ fontSize: 12.5 }}>
                    First row must be a header. Recognized columns: <b>Name</b>, <b>Phone</b> (required),
                    Email, Origin, Destination, Year, Make, Model, Notes. Comma, tab, or pipe separated.
                  </p>
                  <label className="tp-modal-field">
                    <span>Paste template</span>
                    <textarea
                      rows={6}
                      placeholder={"Name,Phone,Email,Origin,Destination,Year,Make,Model,Notes\nJohn Smith,5551234567,john@example.com,90210,10001,2019,Honda,Civic,"}
                      value={importText}
                      disabled={!!importFile}
                      onChange={(e) => setImportText(e.target.value)}
                    />
                  </label>
                  <div className="tp-muted" style={{ textAlign: "center", fontSize: 12.5, margin: "2px 0" }}>— or —</div>
                  <label className="tp-modal-field">
                    <span>Upload .xlsx or .pdf</span>
                    <input type="file" accept=".xlsx,.xls,.pdf,.csv,.txt" onChange={onImportFilePicked} />
                  </label>
                  {importFile && (
                    <p className="tp-muted" style={{ fontSize: 12.5 }}>
                      {importFile.name} selected. <button className="tp-modal-cancel" style={{ padding: "2px 8px" }} onClick={() => setImportFile(null)}>Clear</button>
                    </p>
                  )}
                  {importError && <p className="tp-msg err">{importError}</p>}
                </>
              ) : (
                <>
                  <p className="tp-msg ok">Imported {importResult.inserted} lead{importResult.inserted === 1 ? "" : "s"}.</p>
                  {importResult.skipped > 0 && (
                    <p className="tp-msg err">
                      Skipped {importResult.skipped} row{importResult.skipped === 1 ? "" : "s"}:
                      {" " + importResult.errors.map((e) => `row ${e.row} (${e.reason})`).join(", ")}
                    </p>
                  )}
                  {importResult.truncated && <p className="tp-msg err">Only the first 500 rows were imported — split larger files into batches.</p>}
                </>
              )}
            </div>
            <div className="tp-modal-foot">
              <button className="tp-modal-cancel" onClick={closeImport}>{importResult ? "Close" : "Cancel"}</button>
              {!importResult && (
                <button
                  className="request-btn"
                  disabled={importBusy || (!importFile && !importText.trim())}
                  onClick={submitImport}
                >
                  {importBusy ? "Importing…" : "Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
