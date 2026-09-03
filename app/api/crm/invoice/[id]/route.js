import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { resolveAgent } from "../../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET /api/crm/invoice/:id — re-download a previously generated invoice PDF
// (or text body) without regenerating it.
export async function GET(request, { params }) {
  const invoiceId = Number(params.id);
  if (!invoiceId) return NextResponse.json({ error: "Bad invoice id" }, { status: 400 });

  const pool = getPool();
  try {
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });

    const { rows } = await pool.query(
      `select i.id, i.kind, i.file, i.text_body, i.lead_id, l.order_number
         from invoices i join leads l on l.id = i.lead_id
        where i.id = $1 and i.tenant_id = $2`,
      [invoiceId, agent.tenant_id]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const inv = rows[0];
    if (inv.kind !== "pdf_template" || !inv.file) {
      return NextResponse.json({ error: "This invoice has no stored PDF" }, { status: 404 });
    }
    const comma = inv.file.indexOf(",");
    const b64 = comma >= 0 ? inv.file.slice(comma + 1) : inv.file;
    const bytes = Buffer.from(b64, "base64");
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice-${inv.order_number || inv.lead_id}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
