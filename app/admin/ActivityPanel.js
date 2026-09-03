"use client";

import { useEffect, useState } from "react";

// Phase 1: platform-wide activity timeline. Pulls /api/admin/activity and
// renders the appended audit entries (created/updated/deleted tenant, etc.).
// Scoped history for a single record can be fetched via ?entity_type&entity_id.

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ActivityPanel({ getToken }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState({ entity_type: "", entity_id: "" });

  async function load() {
    setItems(null);
    setError(null);
    try {
      const token = await getToken();
      const q = new URLSearchParams();
      if (scope.entity_type) q.set("entity_type", scope.entity_type);
      if (scope.entity_id) q.set("entity_id", scope.entity_id);
      const qs = q.toString();
      const res = await fetch(`/api/admin/activity${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      setItems((await res.json()).activity);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="section">
      <div className="section-head">
        <span>Activity timeline</span>
        <button className="approve" style={{ cursor: "pointer" }} onClick={load}>Refresh</button>
      </div>
      <div className="tn-grid" style={{ marginBottom: 14 }}>
        <input placeholder="entity type (e.g. tenant)" value={scope.entity_type} onChange={(e) => setScope({ ...scope, entity_type: e.target.value })} />
        <input type="number" placeholder="entity id (optional)" value={scope.entity_id} onChange={(e) => setScope({ ...scope, entity_id: e.target.value })} />
        <button className="tn-btn primary" onClick={load}>Filter</button>
      </div>
      {error && <div className="tn-error">{error}</div>}
      {items && items.length === 0 && (
        <div className="aq-reason" style={{ padding: "16px 22px" }}>
          No activity recorded yet. Creating, editing, or deleting a tenant will log an entry here.
        </div>
      )}
      {(items || []).map((a) => (
        <div className="aq-item" key={a.id}>
          <div>
            <span className="aq-type">{a.action}</span>
            {a.entity_type && (
              <span className="mono" style={{ fontSize: 11.5, color: "var(--faint)", marginLeft: 6 }}>
                {a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ""}
              </span>
            )}
            <div style={{ fontSize: 13.5, marginTop: 6 }}>{a.summary}</div>
            <div className="aq-reason">
              {a.actor ? `by ${a.actor}` : "by system"} · {timeAgo(a.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
