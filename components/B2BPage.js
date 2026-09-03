import BusinessInquiryForm from "./BusinessInquiryForm";
import SiteHeader from "./SiteHeader";
import ChatWidget from "./ChatWidget";
import { BRAND } from "../lib/brand";

// B2B pages — same navy/amber theme as the homepage so the For Business
// section looks like one continuous brand experience.
export default function B2BPage({ eyebrow, heading, intro, points, faq, faqHeading, segment }) {
  return (
    <>
      <SiteHeader theme="navy" quoteHref="#inquiry" />

      {/* Hero */}
      <section className="ha-hero" style={{ minHeight: "auto", padding: "clamp(56px,8vw,88px) clamp(16px,4vw,40px) 32px" }}>
        <div className="ha-wrap" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(320px,460px)", gap: "clamp(24px,4vw,56px)", alignItems: "end" }}>
          <div>
            <span className="tag tag-accent">{eyebrow}</span>
            <h1 style={{ marginTop: 16, fontSize: "clamp(34px,5.5vw,54px)", lineHeight: 1.05, color: "#fff" }}>{heading}</h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,.72)", maxWidth: "54ch", marginTop: 18 }}>{intro}</p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, padding: 0, margin: "18px 0 0" }}>
              {points.map((p) => (
                <li key={p} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 15, color: "rgba(255,255,255,.88)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffb627" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}><polyline points="20 6 9 17 4 12" /></svg>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div id="inquiry">
            <BusinessInquiryForm segment={segment} />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: "var(--color-navy)", padding: "clamp(36px,5vw,56px) clamp(16px,4vw,40px)" }}>
        <div className="ha-wrap" style={{ maxWidth: 780 }}>
          <h2 style={{ fontSize: "clamp(24px,3.5vw,34px)", color: "#fff", marginBottom: 22 }}>{faqHeading}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faq.map((item, i) => (
              <details key={i} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "16px 18px" }} open={i === 0}>
                <summary style={{ fontWeight: 700, fontFamily: "var(--font-heading, system-ui)", fontSize: 15, color: "rgba(255,255,255,.9)", cursor: "pointer", listStyle: "none" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                    {item.q}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffb627" strokeWidth="2.75" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M6 9l6 6 6-6"/></svg>
                  </span>
                </summary>
                <p style={{ marginTop: 12, color: "rgba(255,255,255,.65)", fontSize: 14.5, lineHeight: 1.6 }}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer — matches homepage exactly */}
      <footer className="ha-footer">
        <div className="ha-wrap ha-footer-inner">
          <div className="ha-footer-brand">
            <img src="/logo.png" alt={BRAND.name} width={28} height={28} style={{ borderRadius: 6, objectFit: "cover" }} />
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>{BRAND.name}</span>
          </div>
          <div className="ha-footer-contact">
            <span>quotes@scherztruckinginc.com</span>
            <span className="ha-footer-sep">|</span>
            <span>USDOT 1117160 · MC-457690</span>
            <span className="ha-footer-sep">|</span>
            <span>4434 460TH LN HAY SPRINGS NE 69347</span>
          </div>
          <p className="ha-footer-legal">Authorized Motor Carrier of Property (Except Household Goods) · Active USDOT · 1 Power Unit · 1 Driver</p>
          <p className="ha-footer-copy">© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
        </div>
      </footer>

      <ChatWidget serviceSlug={segment || "car-shipping"} />
    </>
  );
}
