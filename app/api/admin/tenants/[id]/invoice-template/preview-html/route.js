import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../../../../../lib/adminAuth";
import { renderTemplate, renderHtmlToPdf, buildVehicleRowsHtml, buildVehicleSummary } from "../../../../../../../lib/htmlInvoice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Sample data so the admin can preview layout/styling without needing a
// real lead — same token names buildTokenValues() produces in production.
const SAMPLE_VALUES = {
  company_name: "Acme Auto Transport",
  customer_name: "Jane Sample",
  customer_phone: "(555) 123-4567",
  customer_email: "jane@example.com",
  pickup_contact: "Jane Sample",
  pickup_phone: "(555) 123-4567",
  pickup_address: "123 Main St, Los Angeles, CA 90001",
  dropoff_contact: "Jane Sample",
  dropoff_phone: "(555) 123-4567",
  dropoff_address: "456 Oak Ave, Dallas, TX 75201",
  trailer_type: "Open",
  load_date: "2026-08-01",
  delivery_date: "2026-08-05",
  order_number: "1001",
  order_date: "2026-07-28",
  invoice_date: "2026-07-28",
  invoice_total: "$1,200.00",
  deposit_due: "$300.00",
  balance_due: "$900.00",
};
const SAMPLE_VEHICLES = [
  { year: 2021, make: "Toyota", model: "Camry", type: "Car", running: true },
];

// POST /api/admin/tenants/:id/invoice-template/preview-html — renders
// UNSAVED html_body/logo_data with sample data, for the "Preview" button
// in the HTML template editor (edit -> preview -> save loop).
export async function POST(request, { params }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Bad tenant id" }, { status: 400 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.html_body || typeof body.html_body !== "string") {
    return NextResponse.json({ error: "Provide html_body" }, { status: 400 });
  }
  try {
    const html = renderTemplate(body.html_body, {
      ...SAMPLE_VALUES,
      vehicle_rows: buildVehicleRowsHtml(SAMPLE_VEHICLES),
      vehicle_summary: buildVehicleSummary(SAMPLE_VEHICLES),
      logo_img: body.logo_data ? `<img class="logo" src="${body.logo_data}" alt="logo" />` : "",
    });
    const pdf = await renderHtmlToPdf(html);
    return new NextResponse(Buffer.from(pdf), { status: 200, headers: { "Content-Type": "application/pdf" } });
  } catch (e) {
    return NextResponse.json({ error: "Preview failed: " + (e?.message || "unknown") }, { status: 500 });
  }
}
