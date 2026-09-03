import { NextResponse } from "next/server";
import { isAdminRequest } from "../../../../lib/adminAuth";
import { DEFAULT_HTML_TEMPLATE } from "../../../../lib/defaultInvoiceTemplate";

export const dynamic = "force-dynamic";

// GET /api/admin/default-invoice-template — the Scherz Trucking INC default HTML
// invoice, for the admin UI's "Load default as a starting point" button.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ html: DEFAULT_HTML_TEMPLATE });
}
