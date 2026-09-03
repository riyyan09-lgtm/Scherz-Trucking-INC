import { getDirectory } from "../lib/cityDirectory";
import { rateRange, transitDays } from "../lib/pricing";
import { STOCK_PHOTOS } from "../lib/landingConstants";
import { SERVICES } from "../lib/serviceContent";
import { BUSINESS_SEGMENTS_FULL } from "../lib/businessSegments";
import HomeQuoteForm from "../components/HomeQuoteForm";
import SiteHeader from "../components/SiteHeader";
import GeographicMap from "../components/GeographicMap";
import ChatWidget from "../components/ChatWidget";
import ScrollReveal from "../components/ScrollReveal";
import CountUpStat from "../components/CountUpStat";
import FaqAccordion from "../components/FaqAccordion";
import { LogoMark } from "../components/Logo";
import { BRAND } from "../lib/brand";
import "./homeAnimated.css";
export const dynamic = "force-dynamic";

// Rebuilt frequently so newly added city pages (e.g. full Hawaii coverage)
// appear on the homepage without waiting a full hour. Same ISR pattern as
// the location pages.
export const revalidate = 300;

// The title deliberately leads with the search terms people actually type
// ("car shipping quotes", "auto transport") and keeps the brand last, since
// nobody is searching the brand name yet after the rename from TrustLane to Scherz.
const HOME_TITLE = "Car Shipping Quotes — Nationwide Auto Transport";
const HOME_DESCRIPTION =
  "Ship your car anywhere in the U.S. with licensed, insured carriers. Free instant quote in under two minutes, door-to-door shipment, upfront pricing — and a small initial payment reserves your spot.";

export const metadata = {
  // Brand appended explicitly: a title.template only applies to segments BELOW
  // the one that defines it, and app/page.js shares the root segment with
  // so the homepage is the one page the "%s | Scherz Trucking INC"
  // template never reaches. Verified: every other route picks the suffix up
  // automatically, this one rendered bare without it.
  title: `${HOME_TITLE} | ${BRAND.short}`,
  description: HOME_DESCRIPTION,
  keywords: [
    "car shipping",
    "car shipping quotes",
    "auto transport",
    "vehicle transport",
    "ship my car",
    "door to door car shipping",
    "open car transport",
    "enclosed car transport",
    "cross country car shipping",
    "licensed insured car carriers",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: `${HOME_TITLE} | ${BRAND.short}`,
    description: HOME_DESCRIPTION,
    url: "/",
    siteName: BRAND.name,
    type: "website",
  },
};

const PALETTE = ["var(--palette-0)", "var(--palette-1)", "var(--palette-2)", "var(--palette-3)", "var(--palette-4)"];

const WHY = [
  { title: "Licensed & insured, always", body: "Every carrier's FMCSA license and cargo insurance is verified before your vehicle moves." },
  { title: "Small initial payment reserves your spot", body: "Lock in your carrier and pickup window with a small deposit — the balance is settled at delivery." },
  { title: "Door-to-door, nationwide", body: "Pickup and delivery as close to the door as the street allows, in any of our covered cities." },
];

const STEPS = [
  { n: "01", title: "Get your quote", body: "Enter your route and vehicle for an instant, upfront price." },
  { n: "02", title: "Book your carrier", body: "We match you with a licensed, insured carrier from our network." },
  { n: "03", title: "Track your shipment", body: "Stay in touch with your coordinator for pickup and delivery updates." },
  { n: "04", title: "Receive your vehicle", body: "Inspect, sign off, and you're done — the balance is due at delivery." },
];

// Sample routes/distances for the cost & transit reference below — prices
// and transit windows are computed from the site's actual pricing model
// (lib/pricing.js, the same function driving every city page's rate table),
// not hand-typed figures, so they can't drift out of sync with real quotes.
const SAMPLE_ROUTES = [
  { from: "Texas", to: "California", miles: 1550 },
  { from: "Florida", to: "New York", miles: 1280 },
  { from: "Illinois", to: "Arizona", miles: 1450 },
  { from: "Washington", to: "Texas", miles: 2100 },
  { from: "Georgia", to: "Colorado", miles: 1400 },
];
const TRANSIT_BANDS = [
  { range: "0–500 miles", sample: 250 },
  { range: "500–1,000 miles", sample: 750 },
  { range: "1,000–1,500 miles", sample: 1250 },
  { range: "1,500–2,000 miles", sample: 1750 },
  { range: "2,000+ miles", sample: 2500 },
];

const FAQS = [
  { q: "What's the cheapest way to ship a car?", a: "Open transport booked a few weeks ahead is typically the most affordable option — enclosed carriers cost more but add weather and road-debris protection." },
  { q: "Can I pack personal belongings in my vehicle?", a: "On most shipments, yes — carriers allow up to 150 lbs of personal belongings, packed below the window line. Belongings are not allowed on shipments to or from Hawaii or Puerto Rico; on Alaska shipments they're subject to an additional fee." },
  { q: "Is my vehicle insured during transport?", a: "Every carrier in our network has verified cargo insurance for shipments within the continental U.S. Coverage is not available on shipments to or from Hawaii, Alaska, or Puerto Rico." },
  { q: "What is a Bill of Lading?", a: "It's the document signed at pickup and delivery recording your vehicle's condition — inspect the car against it at delivery and keep a copy for your records." },
  { q: "What happens if my car is damaged in transit?", a: "Note any damage against the Bill of Lading at delivery and file a claim with the carrier's cargo insurance right away." },
  { q: "Can inoperable vehicles be shipped?", a: "Yes — carriers equipped with a winch can load non-running vehicles; let your coordinator know the vehicle's condition when booking so the right carrier is matched." },
];

export default async function Home() {
  const directory = await getDirectory();
  const cityCount = directory.reduce((n, [, s]) => n + s.cities.length, 0);
  const cityCounts = Object.fromEntries(directory.map(([, s]) => [s.abbr, s.cities.length]));

  const statsItems = [
    { counter: true, target: cityCount || 2000, label: "cities served" },
    { value: "Vetted", label: "carrier network" },
    { value: "Instant", label: "free quote" },
    { value: "1–7 days", label: "typical transit" },
  ];

  return (
    <main className={`ha-page`}>
      <SiteHeader theme="navy" quoteHref="#quote" />

      {/* ============ HERO ============ */}
      <div className="ha-hero">
        <img
          src={`${STOCK_PHOTOS.hero}?w=1400&q=55&fm=jpg&fit=crop`}
          alt=""
          aria-hidden="true"
          className="ha-hero-bg"
        />
        <div className="ha-wrap">
          <ScrollReveal className="ha-hero-content">
            <span className="ha-eyebrow">Nationwide auto transport</span>
            <h1>Ship your car with a carrier you can actually trust</h1>
            <p>
              Free instant quotes in {cityCount || "500+"} U.S. cities. Every carrier&apos;s license and insurance verified before your vehicle moves — and a small initial payment reserves your spot.
            </p>
            <ul className="ha-checklist">
              {["Licensed & insured carriers", "Transparent, upfront pricing", "Door-to-door service"].map((t) => (
                <li key={t}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  {t}
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </div>

      {/* ============ QUOTE FORM ============ */}
      <div className="ha-wrap">
        <ScrollReveal className="ha-quote-wrap" id="quote">
          <HomeQuoteForm serviceSlug="car-shipping" sourcePageId={null} tenantId={null} />
        </ScrollReveal>
      </div>

      {/* ============ STATS BAR ============ */}
      <div className="ha-wrap">
        <ScrollReveal as="div" className="ha-stats">
          {statsItems.map((s, i) =>
            s.counter ? (
              <CountUpStat key={s.label} target={s.target} label={s.label} color="var(--color-navy)" />
            ) : (
              <div className="ha-stat-cell" key={s.label}>
                <div className="ha-stat-value" style={{ color: "var(--color-navy)" }}>{s.value}</div>
                <div className="ha-stat-label">{s.label}</div>
              </div>
            )
          )}
        </ScrollReveal>
      </div>

      {/* ============ WHY SHIP ============ */}
      <section className="ha-section ha-wrap">
        <ScrollReveal as="h2" className="ha-h2">Why ship with {BRAND.short}</ScrollReveal>
        <ScrollReveal as="p" className="ha-lede">One coordinator, one vetted carrier network, no call-center handoffs — from quote to delivery.</ScrollReveal>
        <div className="ha-grid-3">
          {WHY.map((w, i) => (
            <ScrollReveal as="div" className="ha-panel ha-panel-top" style={{ "--panel-color": PALETTE[i % PALETTE.length] }} key={w.title}>
              <div className="ha-panel-title">{w.title}</div>
              <div className="ha-panel-body">{w.body}</div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="ha-section ha-wrap" id="how-it-works">
        <ScrollReveal as="h2" className="ha-h2">Book your car shipment in minutes</ScrollReveal>
        <ScrollReveal as="p" className="ha-lede">Four steps from quote to a car in your driveway.</ScrollReveal>
        <div className="ha-grid-4">
          {STEPS.map((s, i) => (
            <ScrollReveal as="div" className="ha-panel" style={{ "--panel-color": PALETTE[i % PALETTE.length] }} key={s.n}>
              <div className="ha-step-n">{s.n}</div>
              <div className="ha-panel-title">{s.title}</div>
              <div className="ha-panel-body">{s.body}</div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ============ SERVICES ============ */}
      <section className="ha-section ha-wrap" id="services">
        <ScrollReveal as="h2" className="ha-h2">Ways we can ship your vehicle</ScrollReveal>
        <ScrollReveal as="p" className="ha-lede">Every option runs on the same vetted, insured carrier network — pick the one that fits.</ScrollReveal>
        <div className="ha-grid-4">
          {SERVICES.map((s, i) => (
            <ScrollReveal as="div" key={s.slug}>
              <a href={`/services/${s.slug}`} className="ha-panel ha-panel-top ha-service-link" style={{ "--panel-color": PALETTE[i % PALETTE.length] }}>
                <div className="ha-panel-title">{s.name}</div>
                <div className="ha-panel-body">{s.eyebrow}</div>
              </a>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ============ FOR BUSINESS ============ */}
      <section className="ha-section ha-wrap" id="for-business">
        <ScrollReveal as="h2" className="ha-h2">We partner with</ScrollReveal>
        <ScrollReveal as="p" className="ha-lede">Volume pricing and a dedicated coordinator for businesses that ship regularly.</ScrollReveal>
        <div className="ha-grid-4">
          {BUSINESS_SEGMENTS_FULL.map((b, i) => (
            <ScrollReveal as="div" key={b.slug}>
              <a href={`/car-shipping/${b.slug}`} className="ha-panel ha-panel-top ha-service-link" style={{ "--panel-color": PALETTE[(i + 1) % PALETTE.length] }}>
                <div className="ha-panel-title">{b.navLabel}</div>
                <div className="ha-panel-body">{b.eyebrow}</div>
              </a>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ============ COST & TRANSIT REFERENCE ============ */}
      <section className="ha-section ha-wrap">
        <div className="ha-grid-2">
          <ScrollReveal as="div" className="ha-panel">
            <div className="ha-table-title">What does it cost?</div>
            <div className="ha-table-sub">Sample routes, open-carrier pricing.</div>
            {SAMPLE_ROUTES.map((r) => {
              const { low, high } = rateRange(r.miles);
              return (
                <div className="ha-table-row" key={r.from + r.to}>
                  <span>{r.from} → {r.to}</span>
                  <span>${low.toLocaleString()}–${high.toLocaleString()}</span>
                </div>
              );
            })}
          </ScrollReveal>
          <ScrollReveal as="div" className="ha-panel">
            <div className="ha-table-title">How long does it take?</div>
            <div className="ha-table-sub">Typical transit time by distance.</div>
            {TRANSIT_BANDS.map((t) => (
              <div className="ha-table-row" key={t.range}>
                <span>{t.range}</span>
                <span>{transitDays(t.sample)}</span>
              </div>
            ))}
          </ScrollReveal>
        </div>
      </section>

      {/* ============ STATE MAP ============ */}
      <section className="ha-section ha-wrap">
        <ScrollReveal as="h2" className="ha-h2" style={{ textAlign: "center" }}>Find your state</ScrollReveal>
        <ScrollReveal as="p" className="ha-lede" style={{ textAlign: "center", margin: "0 auto 28px" }}>
          Pick a state for local pricing, pickup details, and every city we cover there.
        </ScrollReveal>
        <ScrollReveal as="div">
          <GeographicMap cityCounts={cityCounts} />
        </ScrollReveal>
        <p style={{ textAlign: "center", marginTop: 22 }}>
          <a href="/locations" className="btn btn-secondary">Browse all {cityCount || "500+"} cities</a>
        </p>
      </section>

      {/* ============ FAQ ============ */}
      <section className="ha-section ha-wrap">
        <ScrollReveal as="h2" className="ha-h2">Frequently asked questions</ScrollReveal>
        <ScrollReveal as="p" className="ha-lede">Answers to what shippers ask us most.</ScrollReveal>
        <ScrollReveal as="div">
          <FaqAccordion items={FAQS} />
        </ScrollReveal>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="ha-footer">
        <div className="ha-wrap ha-footer-inner">
          <div className="ha-footer-brand">
            <img src="/logo.png" alt="" width={44} height={44} className="ha-footer-logo" />
            <span className="ha-footer-brand-text">{BRAND.name}</span>
          </div>
          <div className="ha-footer-tagline">{BRAND.tagline}</div>
          <div className="ha-footer-contact">
            <span>quotes@scherztruckinginc.com</span>
            <span className="ha-footer-sep">|</span>
            <span>USDOT 1117160 · MC-457690</span>
            <span className="ha-footer-sep">|</span>
            <span>4434 460TH LN, HAY SPRINGS, NE 69347</span>
          </div>
          <div className="ha-footer-fineprint">
            Authorized Motor Carrier of Property (Except Household Goods) · Active USDOT · 1 Power Unit · 1 Driver
          </div>
          <div className="ha-footer-date">© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</div>
        </div>
      </footer>
      <ChatWidget serviceSlug="car-shipping" />
    </main>
  );
}
