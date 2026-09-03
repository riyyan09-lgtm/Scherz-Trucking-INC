"use client";

import { useState } from "react";
import { rateRange } from "../lib/pricing";

// "Quick price estimator" card — a distance slider producing a live open-
// transport range, using the same rate model as the rate table below it.
export default function PriceEstimator({ initialDistance = 500 }) {
  const [distance, setDistance] = useState(initialDistance);
  const estimate = rateRange(distance);

  return (
    <div className="card elev-md" style={{ background: "var(--color-neutral-100)", padding: "22px 26px", marginBottom: 24, display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "center" }}>
      <div>
        <h3 className="card-title" style={{ marginBottom: 8 }}>Quick price estimator</h3>
        <label style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)", display: "block", marginBottom: 6 }}>
          Approximate shipping distance: <b style={{ color: "var(--color-text)" }}>{distance.toLocaleString()} mi</b>
        </label>
        <input
          type="range"
          min="100"
          max="2800"
          step="10"
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--color-accent)" }}
          aria-label="Approximate shipping distance in miles"
        />
      </div>
      <div style={{ textAlign: "center", minWidth: 160 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 26, color: "var(--color-accent-700)" }}>
          ${estimate.low.toLocaleString()}–${estimate.high.toLocaleString()}
        </div>
        <div style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>estimated open transport</div>
      </div>
    </div>
  );
}
