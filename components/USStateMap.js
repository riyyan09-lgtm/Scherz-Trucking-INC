import { US_STATE_GRID } from "../lib/usStateGrid";

// Simplified tile-grid US map (each state gets an equal-size clickable tile
// at roughly its real position — the same style used by NPR/Datawrapper
// state cartograms). No client JS needed: it's just a grid of links, so it
// renders server-side and stays crawlable.
export default function USStateMap({ cityCounts = {} }) {
  const rows = Math.max(...US_STATE_GRID.map((s) => s.row)) + 1;
  const cols = Math.max(...US_STATE_GRID.map((s) => s.col)) + 1;

  return (
    <div className="og-map" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {US_STATE_GRID.map((s) => {
        const count = cityCounts[s.abbr] || 0;
        return (
          <a
            key={s.abbr}
            href={`/car-shipping/${s.abbr.toLowerCase()}`}
            className="og-map-tile"
            style={{ gridColumn: s.col + 1, gridRow: s.row + 1 }}
            title={`${s.name}${count ? ` — ${count} cities` : ""}`}
          >
            <span className="og-map-abbr">{s.abbr}</span>
            {count > 0 && <span className="og-map-count">{count}</span>}
          </a>
        );
      })}
    </div>
  );
}
