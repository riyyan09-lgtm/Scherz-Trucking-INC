import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { resolveAgent } from "../../../../../lib/crmAuth";
import { buildTokenValues, fillPdfTemplate } from "../../../../../lib/pdfInvoice";
import { qrSvg } from "../../../../../lib/qr";
import { renderTemplate, renderHtmlToPdf, buildVehicleRowsHtml, buildVehicleSummary, buildVehicleListHtml } from "../../../../../lib/htmlInvoice";
import { DEFAULT_HTML_TEMPLATE } from "../../../../../lib/defaultInvoiceTemplate";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // HTML path launches a real browser; needs more than the 10s default

// POST /api/crm/invoice/generate — generates the tenant's invoice for a real
// order and returns the PDF. Three paths, in order of preference:
//   1. 'pdf_coord' (or 'acroform') — the tenant uploaded a branded PDF and
//      an admin mapped fields onto it (lib/pdfInvoice.js).
//   2. 'html' — the tenant has a Puppeteer-rendered HTML template
//      (lib/htmlInvoice.js) with their own logo/layout.
//   3. No active template at all — DEFAULT_HTML_TEMPLATE, still a real
//      styled PDF (not a bare text block the way the old fallback was).
async function buildLogoImgHtml(logoData) {
  if (!logoData) return "";
  return `<img class="logo" src="${logoData}" alt="logo" />`;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "Provide order id" }, { status: 400 });

  const pool = getPool();
  try {
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });

    const leadRes = await pool.query(`select * from leads where id = $1 and tenant_id = $2`, [id, agent.tenant_id]);
    if (leadRes.rows.length === 0) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const lead = leadRes.rows[0];

    // Vehicles live in lead_vehicles (separate table), not leads.vehicles.
    const vehRes = await pool.query(
      `select * from lead_vehicles where lead_id = $1 and tenant_id = $2 order by sort_order, id`,
      [id, agent.tenant_id]
    );
    const vehicles = vehRes.rows;

    const tenantRes = await pool.query(
      `select company_name, active_invoice_template_version_id from tenants where id = $1`,
      [agent.tenant_id]
    );
    const tenant = tenantRes.rows[0];
    const versionId = tenant?.active_invoice_template_version_id;

    const values = buildTokenValues(lead, tenant, agent, vehicles);
    // QR is generated async (qrcode pkg) and merged in — points at the
    // permanent signed-document / booking URL.
    values.qr_img = values.booking_url && values.booking_url !== "—"
      ? `<img src="${await qrSvg(values.booking_url, 110)}" alt="QR" />`
      : "—";

    let filled, kind;
    if (versionId) {
      const verRes = await pool.query(
        `select template_kind, file, field_map, html_body, logo_data from invoice_template_versions where id = $1`,
        [versionId]
      );
      const version = verRes.rows[0];

      if (version?.template_kind === "html" && version.html_body) {
        const html = renderTemplate(version.html_body, {
          ...values,
          vehicle_rows: buildVehicleRowsHtml(vehicles),
          vehicle_summary: buildVehicleSummary(vehicles),
          vehicle_list: buildVehicleListHtml(vehicles),
          logo_img: await buildLogoImgHtml(version.logo_data),
        });
        filled = await renderHtmlToPdf(html);
        kind = "html_template";
      } else if (version?.file && (version.field_map || []).length > 0) {
        const dataUrl = version.file;
        const comma = dataUrl.indexOf(",");
        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        const pdfBytes = Buffer.from(b64, "base64");
        filled = await fillPdfTemplate(pdfBytes, version.field_map, values, vehicles);
        kind = "pdf_template";
      }
    }

    if (!filled) {
      // No usable active template -- the universal default, still a real
      // styled PDF rather than a bare {{token}}-substituted text block.
      const html = renderTemplate(DEFAULT_HTML_TEMPLATE, {
        ...values,
        vehicle_rows: buildVehicleRowsHtml(vehicles),
        vehicle_summary: buildVehicleSummary(vehicles),
        vehicle_list: buildVehicleListHtml(vehicles),
        logo_img: "",
      });
      filled = await renderHtmlToPdf(html);
      kind = "html_default";
    }

    const filledB64 = Buffer.from(filled).toString("base64");
    const filledDataUrl = `data:application/pdf;base64,${filledB64}`;

    const saved = await pool.query(
      `insert into invoices (lead_id, tenant_id, template_version_id, kind, file, generated_by)
       values ($1, $2, $3, $4, $5, $6) returning id, generated_at`,
      [id, agent.tenant_id, versionId || null, kind, filledDataUrl, agent.id]
    );

    return new NextResponse(Buffer.from(filled), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice-${lead.order_number || lead.id}.pdf"`,
        "X-Invoice-Id": String(saved.rows[0].id),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to generate invoice: " + (e?.message || "unknown") }, { status: 500 });
  }
}
