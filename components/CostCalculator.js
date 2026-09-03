"use client";

import { useState } from "react";

// Transparent, industry-approximate estimate model. Rates are per-mile and
// taper with distance (long hauls cost less per mile), then adjust for vehicle
// size, transport type, and running condition. Always shown as a RANGE and
// clearly labeled an estimate — the real price comes from the live quote.
const VEHICLES = [
  { key: "sedan", label: "Car / Sedan", mult: 1.0 },
  { key: "suv", label: "SUV / Crossover", mult: 1.15 },
  { key: "pickup", label: "Pickup Truck", mult: 1.2 },
  { key: "van", label: "Van / Minivan", mult: 1.2 },
  { key: "luxury", label: "Luxury / Exotic", mult: 1.25 },
  { key: "motorcycle", label: "Motorcycle", mult: 0.7 },
];

function perMile(dist) {
  if (dist <= 500) return 1.15;
  if (dist <= 1000) return 0.75;
  if (dist <= 1500) return 0.6;
  if (dist <= 2500) return 0.5;
  return 0.42;
}

function haversine(a, b) {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

async function zipGeo(zip) {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const d = await res.json();
    const p = d.places?.[0];
    if (!p) return null;
    return {
      lat: parseFloat(p.latitude),
      lng: parseFloat(p.longitude),
      city: p["place name"],
      state: p["state abbreviation"],
    };
  } catch {
    return null;
  }
}

const round5 = (n) => Math.round(n / 5) * 5;

export default function CostCalculator() {
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [vehicle, setVehicle] = useState("sedan");
  const [enclosed, setEnclosed] = useState(false);
  const [inop, setInop] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  async function calculate(e) {
    e.preventDefault();
    setErr(null);
    if (!/^\d{5}$/.test(origin.trim()) || !/^\d{5}$/.test(dest.trim())) {
      setErr("Enter a valid 5-digit ZIP code for both pickup and delivery.");
      return;
    }
    setStatus("loading");
    const [a, b] = await Promise.all([zipGeo(origin.trim()), zipGeo(dest.trim())]);
    if (!a || !b) {
      setStatus("error");
      setErr("We couldn't look up one of those ZIP codes. Double-check and try again.");
      return;
    }
    const dist = haversine(a, b);
    const vMult = VEHICLES.find((v) => v.key === vehicle)?.mult || 1;
    let base = dist * perMile(dist) * vMult;
    if (enclosed) base *= 1.45;
    if (inop) base += 150;
    base = Math.max(base, 300);
    setResult({
      dist,
      from: `${a.city}, ${a.state}`,
      to: `${b.city}, ${b.state}`,
      low: round5(base * 0.9),
      high: round5(base * 1.1),
    });
    setStatus("done");
  }

  return (
    <div className="calc-card">
      <form onSubmit={calculate} className="calc-form">
        <div className="calc-row2">
          <label className="calc-field">
            <span>Pickup ZIP</span>
            <input inputMode="numeric" maxLength={5} placeholder="e.g. 77002" value={origin}
              onChange={(e) => setOrigin(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="calc-field">
            <span>Delivery ZIP</span>
            <input inputMode="numeric" maxLength={5} placeholder="e.g. 90001" value={dest}
              onChange={(e) => setDest(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
        <label className="calc-field">
          <span>Vehicle type</span>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            {VEHICLES.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </label>
        <div className="calc-toggles">
          <button type="button" className={`calc-seg ${!enclosed ? "on" : ""}`} onClick={() => setEnclosed(false)}>Open transport</button>
          <button type="button" className={`calc-seg ${enclosed ? "on" : ""}`} onClick={() => setEnclosed(true)}>Enclosed</button>
        </div>
        <label className="calc-check">
          <input type="checkbox" checked={inop} onChange={(e) => setInop(e.target.checked)} />
          Vehicle is inoperable (doesn&apos;t start or drive)
        </label>
        <button type="submit" className="calc-go" disabled={status === "loading"}>
          {status === "loading" ? "Calculating…" : "Estimate my cost"}
        </button>
        {err && <p className="calc-err">{err}</p>}
      </form>

      {status === "done" && result && (
        <div className="calc-result">
          <div className="calc-route">{result.from} <span>→</span> {result.to} · ~{result.dist.toLocaleString()} mi</div>
          <div className="calc-range">${result.low.toLocaleString()} – ${result.high.toLocaleString()}</div>
          <p className="calc-note">
            Estimated {enclosed ? "enclosed" : "open"} transport range. Your exact price depends on live carrier
            availability and pickup timing — get a free, no-obligation quote below to lock it in.
          </p>
          <a href="#quote" className="calc-cta">Get my exact free quote →</a>
        </div>
      )}
    </div>
  );
}
