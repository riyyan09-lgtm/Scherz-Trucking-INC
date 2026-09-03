"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { INVOICE_TOKENS, DEFAULT_BOX } from "../../lib/invoiceTokens";

// Label text (case-insensitive, matched as a whole trimmed line) that hints
// where a given CRM variable's value should go on a non-AcroForm PDF. Used
// to auto-suggest field placements from the PDF's own text layout (no OCR —
// these are real embedded text runs pdfjs reads directly). "section" hints
// switch which pickup/dropoff-scoped token a phone/contact label resolves
// to, since e.g. "Cell:" legitimately appears once per section.
const SECTION_TRIGGERS = [
  { re: /pickup|origin/i, section: "pickup" },
  { re: /drop\s?off|destination|delivery/i, section: "dropoff" },
];
const LABEL_HINTS = [
  { re: /^(bill to|name):?$/i, token: "customer_name" },
  { re: /^email:?$/i, token: "customer_email" },
  { re: /^(contact):?$/i, section: { pickup: "pickup_contact", dropoff: "dropoff_contact" } },
  { re: /^(cell|phone|number):?$/i, section: { pickup: "pickup_phone", dropoff: "dropoff_phone" }, default: "customer_phone" },
  { re: /^order\s?(number|#|no\.?):?$/i, token: "order_number" },
  { re: /^order\s?date:?$/i, token: "order_date" },
  { re: /^(load|ship)\s?date:?$/i, token: "load_date" },
  { re: /^delivery\s?date:?$/i, token: "delivery_date" },
  { re: /^(trailer\s?type|shipping\s?method):?$/i, token: "trailer_type" },
  { re: /^(total\s?price|total\s?tariff|invoice\s?total|total):?$/i, token: "invoice_total" },
  { re: /^deposit.*:?$/i, token: "deposit_due" },
  { re: /^(balance|pay on delivery|due on delivery).*:?$/i, token: "balance_due" },
  { re: /^authorized\s?signature:?$/i, token: "customer_signature" },
];

async function detectSuggestedFields(pdf) {
  const suggestions = [];
  const placed = new Set();
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let section = "customer";
    for (const item of content.items) {
      const text = (item.str || "").trim();
      if (!text) continue;
      for (const trig of SECTION_TRIGGERS) {
        if (trig.re.test(text)) section = trig.section;
      }
      for (const hint of LABEL_HINTS) {
        if (!hint.re.test(text)) continue;
        const token = hint.token || (hint.section && hint.section[section]) || hint.default;
        if (!token || placed.has(token)) continue;
        const endX = item.transform[4] + (item.width || text.length * 5) + 8;
        const y = item.transform[5];
        const xPct = Math.min(0.88, endX / viewport.width);
        const yPct = 1 - y / viewport.height;
        suggestions.push({ token, kind: "coord", page: p - 1, xPct, yPct, wPct: 0.22, hPct: 0.022, fontSize: 10, suggested: true });
        placed.add(token);
      }
    }
  }
  return suggestions;
}

// A CRM variable can be placed more than once on the same PDF (e.g. the
// balance amount printed both in the payment summary AND inline in the red
// "Balance of ___ is due upon delivery" sentence) -- each placement is its
// own field entry, keyed by this id rather than by token.
function makeFieldId(token) {
  return `${token}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const GROUPS = [...new Set(INVOICE_TOKENS.map((t) => t.group))];
const DRAG_THRESHOLD = 4; // px — below this, treat as a click not a drag

// Full-screen tool: renders a tenant's uploaded PDF invoice template on a
// canvas via pdfjs-dist. Admin clicks a CRM variable in the palette to arm
// it, then either clicks a spot (drops a default-size box) or clicks-and-
// drags to draw an exact box on the PDF — that box is where the value
// prints, shrink-to-fit, on every generated invoice. For a PDF that already
// has AcroForm fields, arm a variable and click the matching field name in
// the list instead (no drawing needed — the PDF already defines its box).
// Saves the resulting field map. CRM's Invoice button later fills those
// exact spots/fields with real order data (lib/pdfInvoice.js) via
// /api/crm/invoice/generate.
export default function InvoiceFieldMapper({ tenantId, templateData, getToken, onClose, onSaved }) {
  const canvasRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [fields, setFields] = useState(() =>
    (templateData.fields || []).map((f) => ({ ...f, id: f.id || makeFieldId(f.token) }))
  );
  const [armedToken, setArmedToken] = useState(null);
  const [drawBox, setDrawBox] = useState(null); // { x, y, w, h } in canvas px, live preview while dragging
  const dragState = useRef(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [suggestedCount, setSuggestedCount] = useState(0);
  const isAcroForm = !!templateData.is_acroform;
  const acroFields = templateData.acroform_fields || [];

  useEffect(() => {
    if (isAcroForm) return; // no canvas needed for name-based AcroForm mapping
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const dataUrl = templateData.file;
        const comma = dataUrl.indexOf(",");
        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);

        if (!templateData.fields || templateData.fields.length === 0) {
          const suggestions = await detectSuggestedFields(doc);
          if (!cancelled && suggestions.length) {
            setFields(suggestions);
            setSuggestedCount(suggestions.length);
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "Failed to load PDF");
      }
    })();
    return () => { cancelled = true; };
  }, [templateData.file, isAcroForm]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.3 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setCanvasSize({ width: viewport.width, height: viewport.height });
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => { cancelled = true; };
  }, [pdf, pageNum]);

  // Coord placements always ADD a new instance rather than replacing an
  // existing one for the same token -- a variable can be printed in more
  // than one spot (e.g. the balance amount both in the payment summary and
  // inline in the red "Balance of ___" sentence). "Move" a box by picking
  // it up (removes that specific instance) and re-placing it.
  function addField(next) {
    setFields((prev) => [...prev, { ...next, id: makeFieldId(next.token) }]);
  }
  function updateField(id, patch) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function removeField(id) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }
  function armChip(key) {
    setArmedToken((cur) => (cur === key ? null : key));
  }
  // Clicking a placed box picks its token back up (removes it) so the next
  // click/drag re-places it — the closest thing to "moving" a box without
  // full drag-to-reposition complexity.
  function pickUpField(f) {
    removeField(f.id);
    setArmedToken(f.token);
  }

  function canvasPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, rect };
  }

  function handleCanvasMouseDown(e) {
    if (!armedToken) return;
    const { x, y } = canvasPoint(e);
    dragState.current = { startX: x, startY: y };
    setDrawBox({ x, y, w: 0, h: 0 });
  }
  function handleCanvasMouseMove(e) {
    if (!dragState.current) return;
    const { x, y } = canvasPoint(e);
    const { startX, startY } = dragState.current;
    setDrawBox({ x: Math.min(x, startX), y: Math.min(y, startY), w: Math.abs(x - startX), h: Math.abs(y - startY) });
  }
  function handleCanvasMouseUp(e) {
    if (!dragState.current || !armedToken) { dragState.current = null; setDrawBox(null); return; }
    const rect = canvasRef.current.getBoundingClientRect();
    const { x, y } = canvasPoint(e);
    const { startX, startY } = dragState.current;
    const movedEnough = Math.abs(x - startX) > DRAG_THRESHOLD || Math.abs(y - startY) > DRAG_THRESHOLD;

    let xPct, yPct, wPct, hPct;
    if (movedEnough) {
      xPct = Math.min(x, startX) / rect.width;
      yPct = Math.min(y, startY) / rect.height;
      wPct = Math.abs(x - startX) / rect.width;
      hPct = Math.abs(y - startY) / rect.height;
    } else {
      xPct = startX / rect.width;
      yPct = startY / rect.height;
      wPct = DEFAULT_BOX.w;
      hPct = DEFAULT_BOX.h;
    }
    addField({ token: armedToken, kind: "coord", page: pageNum - 1, xPct, yPct, wPct, hPct, fontSize: 10 });
    dragState.current = null;
    setDrawBox(null);
    setArmedToken(null);
  }

  function handleAcroClick(fieldName) {
    if (!armedToken) return;
    setFields((prev) => [...prev.filter((f) => f.fieldName !== fieldName), { token: armedToken, kind: "acroform", fieldName, id: makeFieldId(armedToken) }]);
    setArmedToken(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const token = await getToken();
      const cleanFields = fields.map(({ suggested, id, ...f }) => f);
      const res = await fetch(`/api/admin/tenants/${tenantId}/invoice-template-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fields: cleanFields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMsg({ ok: true, text: "Field map saved." });
      onSaved(data.fields || cleanFields);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  const pageFields = useMemo(
    () => fields.filter((f) => f.kind !== "acroform" && f.page === pageNum - 1),
    [fields, pageNum]
  );
  // The canvas renders at viewport scale 1.3 (see the page-render effect
  // above), so dividing back out gives the real PDF page height in points
  // — needed to convert an admin-entered "row height in points" into the
  // rowStepPct fraction fillPdfTemplate actually uses.
  const pageHeightPt = canvasSize.height ? canvasSize.height / 1.3 : 0;
  const tokenLabel = (key) => INVOICE_TOKENS.find((t) => t.key === key)?.label || key;
  const usedTokens = new Set(fields.map((f) => f.token));
  const acroBinding = (fieldName) => fields.find((f) => f.kind === "acroform" && f.fieldName === fieldName);

  return (
    <div className="ifm-overlay">
      <div className="ifm-shell">
        <div className="ifm-head">
          <div>
            <h3>Map invoice fields — {templateData.name}</h3>
            <span className="tn-hint">
              {armedToken
                ? isAcroForm
                  ? `Click the form field that should hold "${tokenLabel(armedToken)}".`
                  : `Click, or click-and-drag to size a box, where "${tokenLabel(armedToken)}" should print.`
                : isAcroForm
                  ? "Click a variable below, then click the form field it belongs in."
                  : "Click a variable below, then click (or drag a box) on the PDF."}
              {suggestedCount > 0 && ` ${suggestedCount} field${suggestedCount === 1 ? "" : "s"} auto-suggested from the PDF's own labels — check placement before saving.`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {msg && <span className={msg.ok ? "tn-hint" : "tn-error"} style={{ padding: 0 }}>{msg.text}</span>}
            <button className="tn-btn" onClick={onClose}>Cancel</button>
            <button className="tn-btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Mapping"}</button>
          </div>
        </div>

        <div className="ifm-body">
          <div className="ifm-palette">
            <div className="tn-hint" style={{ marginBottom: 8 }}>Click a variable, then click {isAcroForm ? "a field" : "the PDF"}</div>
            {GROUPS.map((g) => (
              <div key={g} className="ifm-palette-group">
                <div className="ifm-palette-group-label">{g}</div>
                {INVOICE_TOKENS.filter((t) => t.group === g).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={"ifm-chip" + (usedTokens.has(t.key) ? " used" : "") + (armedToken === t.key ? " armed" : "")}
                    onClick={() => armChip(t.key)}
                    title={usedTokens.has(t.key) ? "Already placed — click to add another spot for it (click an existing box instead to move it)" : "Click, then click the PDF"}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {isAcroForm ? (
            <div className="ifm-acro-list">
              {acroFields.length === 0 && <div className="tn-meta">No form fields detected on this PDF.</div>}
              {acroFields.map((af) => {
                const bound = acroBinding(af.name);
                return (
                  <div
                    key={af.name}
                    className={"ifm-acro-row" + (bound ? " bound" : "") + (armedToken ? " armable" : "")}
                    onClick={() => handleAcroClick(af.name)}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{af.name}</div>
                      <div className="tn-hint" style={{ padding: 0 }}>{af.type}</div>
                    </div>
                    {bound ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="tn-badge ok">{tokenLabel(bound.token)}</span>
                        <button className="tn-btn danger" onClick={(e) => { e.stopPropagation(); setFields((prev) => prev.filter((f) => f.fieldName !== af.name)); }}>Remove</button>
                      </div>
                    ) : (
                      <span className="tn-hint" style={{ padding: 0 }}>{armedToken ? "click to bind" : "select a variable first"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ifm-canvas-wrap">
              {loadError && <div className="tn-error">Couldn't load PDF: {loadError}</div>}
              {!loadError && !pdf && <div className="tn-meta">Loading PDF…</div>}
              {numPages > 1 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <button className="tn-btn" disabled={pageNum <= 1} onClick={() => setPageNum(pageNum - 1)}>← Prev</button>
                  <span className="tn-hint">Page {pageNum} of {numPages}</span>
                  <button className="tn-btn" disabled={pageNum >= numPages} onClick={() => setPageNum(pageNum + 1)}>Next →</button>
                </div>
              )}
              <div className="ifm-canvas-frame" style={{ width: canvasSize.width || undefined }}>
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={() => { if (dragState.current) { dragState.current = null; setDrawBox(null); } }}
                  style={{ cursor: armedToken ? "crosshair" : "default", display: "block" }}
                />
                {drawBox && (
                  <div className="ifm-draw-preview" style={{ left: drawBox.x, top: drawBox.y, width: drawBox.w, height: drawBox.h }} />
                )}
                {pageFields.map((f) => (
                  <div
                    key={f.id}
                    className={"ifm-box" + (f.suggested ? " suggested" : "")}
                    style={{
                      left: `${f.xPct * 100}%`,
                      top: `${f.yPct * 100}%`,
                      width: `${(f.wPct ?? DEFAULT_BOX.w) * 100}%`,
                      height: `${(f.hPct ?? DEFAULT_BOX.h) * 100}%`,
                      ...(f.color ? { borderColor: f.color } : {}),
                    }}
                    onClick={() => pickUpField(f)}
                    title="Click to pick up and reposition"
                  >
                    <span className="ifm-box-label">{tokenLabel(f.token)}</span>
                    <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} aria-label="Remove">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="ifm-sidebar">
            <div className="tn-hint" style={{ marginBottom: 10 }}>{fields.length} field{fields.length === 1 ? "" : "s"} placed</div>
            {fields.map((f) => {
              const isVehicleField = f.token.startsWith("vehicle_");
              const rowHeightPt = pageHeightPt && f.rowStepPct ? Math.round(f.rowStepPct * pageHeightPt) : "";
              return (
                <div key={f.id} className="ifm-field-row">
                  <div className="ifm-field-row-top">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{tokenLabel(f.token)}</div>
                      <div className="tn-hint" style={{ padding: 0 }}>
                        {f.kind === "acroform" ? `field "${f.fieldName}"` : `page ${f.page + 1}`}
                        {f.suggested ? " · suggested" : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="color"
                        className="ifm-color-input"
                        title="Text color"
                        value={f.color || "#171720"}
                        onChange={(e) => updateField(f.id, { color: e.target.value })}
                      />
                      <button className="tn-btn danger" onClick={() => removeField(f.id)}>Remove</button>
                    </div>
                  </div>
                  {isVehicleField && f.kind !== "acroform" && (
                    <label className="ifm-repeat-row">
                      <span>Repeat for each vehicle</span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        placeholder="rows"
                        title="Number of vehicle rows to draw (0 = off, just this one row)"
                        value={f.repeatRows || ""}
                        onChange={(e) => updateField(f.id, { repeatRows: Number(e.target.value) || 0 })}
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="row height (pt)"
                        title="Vertical distance between rows, in PDF points"
                        disabled={!f.repeatRows || f.repeatRows <= 1}
                        value={rowHeightPt}
                        onChange={(e) => {
                          const pt = Number(e.target.value) || 0;
                          updateField(f.id, { rowStepPct: pageHeightPt ? pt / pageHeightPt : 0 });
                        }}
                      />
                    </label>
                  )}
                </div>
              );
            })}
            {fields.length === 0 && <div className="tn-meta">Click a variable, then click the PDF to place your first field.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
