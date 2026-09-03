import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Look up city/state from a US ZIP via the free Zippopotam.us API (no key).
// Accepts 4-digit zips missing a leading zero (e.g. "6610" -> "06610").
// Returns { zip, city, state } best-effort, or { error } on failure.
export async function GET(request) {
  let zip = (new URL(request.url).searchParams.get("zip") || "").trim();
  if (!/^\d{4,5}$/.test(zip)) return NextResponse.json({ error: "Invalid ZIP" }, { status: 400 });
  if (zip.length === 4) zip = "0" + zip; // restore dropped leading zero
  try {
    const r = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    if (!r.ok) return NextResponse.json({ error: "ZIP not found" }, { status: 404 });
    const j = await r.json();
    const place = j.places && j.places[0] ? j.places[0] : {};
    return NextResponse.json({
      zip,
      city: (place["place name"] || "").replace(/\s*\(.*\)$/, ""),
      state: place["state abbreviation"] || "",
    });
  } catch {
    return NextResponse.json({ error: "ZIP lookup failed" }, { status: 502 });
  }
}
