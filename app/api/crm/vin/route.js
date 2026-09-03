import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Decode a VIN via the free NHTSA vPIC API (no key required).
// Returns { year, make, model, trim, engine, body } best-effort.
export async function GET(request) {
  const vin = (new URL(request.url).searchParams.get("vin") || "").trim().toUpperCase();
  if (vin.length < 11) return NextResponse.json({ error: "VIN too short" }, { status: 400 });
  try {
    const r = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`
    );
    const j = await r.json();
    const row = j.Results && j.Results[0] ? j.Results[0] : {};
    const pick = (k) => (row[k] && row[k] !== "0" && row[k] !== "Not Applicable" ? row[k] : "");
    return NextResponse.json({
      year: pick("ModelYear"),
      make: pick("Make"),
      model: pick("Model"),
      trim: pick("Trim"),
      engine: pick("DisplacementL") ? `${pick("DisplacementL")}L` : pick("EngineModel"),
      body: pick("BodyClass"),
    });
  } catch {
    return NextResponse.json({ error: "VIN decode failed" }, { status: 502 });
  }
}
