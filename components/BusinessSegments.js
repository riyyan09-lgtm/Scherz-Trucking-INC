import { BUSINESS_SEGMENTS } from "../lib/landingConstants";

// Per HANDOFF-implementation.md section 4 — rendered once per city page,
// between Services and Pricing. Links to the 3 hand-built B2B pages.
export default function BusinessSegments({ city }) {
  return (
    <section className="og-wrap">
      <h2>Built for {city}&apos;s dealers, shops &amp; fleets</h2>
      <p className="text-muted" style={{ fontSize: 15.5, marginBottom: 26 }}>
        Volume-friendly pricing and a dedicated coordinator for businesses that ship more than one car at a time.
      </p>
      <div className="og-grid-auto">
        {BUSINESS_SEGMENTS.map((seg) => (
          <div key={seg.href} className="card elev-sm" style={{ padding: 24 }}>
            <span className="tag tag-accent-2" style={{ width: "fit-content" }}>{seg.tag}</span>
            <h3 className="card-title" style={{ marginTop: 6 }}>{seg.name}</h3>
            <p className="card-body">{seg.description}</p>
            <a href={seg.href} className="btn btn-secondary" style={{ marginTop: 4, width: "fit-content" }}>{seg.linkLabel} →</a>
          </div>
        ))}
      </div>
    </section>
  );
}
