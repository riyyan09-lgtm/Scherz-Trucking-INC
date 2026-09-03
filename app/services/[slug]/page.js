import { notFound } from "next/navigation";
import { getDirectory } from "../../../lib/cityDirectory";
import { rateRange, transitDays } from "../../../lib/pricing";
import { STOCK_PHOTOS } from "../../../lib/landingConstants";
import { SERVICES, SERVICE_BY_SLUG } from "../../../lib/serviceContent";
import HomeQuoteForm from "../../../components/HomeQuoteForm";
import SiteHeader from "../../../components/SiteHeader";
import ChatWidget from "../../../components/ChatWidget";
import ScrollReveal from "../../../components/ScrollReveal";
import FaqAccordion from "../../../components/FaqAccordion";
import { LogoMark } from "../../../components/Logo";
import { BRAND } from "../../../lib/brand";
import "../../homeAnimated.css";
export const dynamic = "force-dynamic";


// Same ISR window as the homepage and the city pages.
export const revalidate = 300;

const PALETTE = ["var(--palette-0)", "var(--palette-1)", "var(--palette-2)", "var(--palette-3)", "var(--palette-4)"];

// Distance bands shared by the cost and transit tables. Prices and day ranges
// come from lib/pricing.js scaled by the service's own factors, so they track
// the same model that produces real quotes.
const BANDS = [
  { label: "0–500 miles", sample: 350 },
  { label: "500–1,000 miles", sample: 750 },
  { label: "1,000–1,500 miles", sample: 1250 },
  { label: "1,500–2,000 miles", sample: 1750 },
  { label: "2,000+ miles", sample: 2500 },
];

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }) {
  const service = SERVICE_BY_SLUG[params.slug];
  if (!service) return {};
  const description = `${service.lede} Open transport typically runs $${serviceRange(600, service.priceFactor).low.toLocaleString()}–$${serviceRange(600, service.priceFactor).high.toLocaleString()} for a ~600 mi move (${serviceTransit(600, service.priceFactor || 1)}), enclosed +30–50%. Free instant quote, licensed & insured carriers nationwide.`;
  return {
    // The root layout applies a "%s | <brand>" template (app/layout.js), so
    // the brand suffix is deliberately omitted here.
    title: `${service.name} — Free Quotes, Licensed & Insured Carriers`,
    description,
    alternates: { canonical: `/services/${service.slug}` },
    openGraph: {
      title: `${service.name} | ${BRAND.short}`,
      description,
      url: `/services/${service.slug}`,
      siteName: BRAND.name,
      type: "website",
    },
  };
}

// Scales the base open-carrier range by the service's price factor.
function serviceRange(miles, factor) {
  const { low, high } = rateRange(miles);
  return { low: Math.round(low * factor), high: Math.round(high * factor) };
}

// transitDays() returns a human string like "3–5 days"; scaling means pulling
// the numbers back out, applying the factor, and reassembling (min 1 day).
function serviceTransit(miles, factor) {
  const raw = transitDays(miles);
  if (factor === 1) return raw;
  const nums = raw.match(/\d+/g);
  if (!nums) return raw;
  const scaled = nums.map((n) => Math.max(1, Math.round(Number(n) * factor)));
  const unique = [...new Set(scaled)];
  return `${unique.join("–")} ${unique[0] === 1 && unique.length === 1 ? "day" : "days"}`;
}

export default async function ServicePage({ params }) {
  const service = SERVICE_BY_SLUG[params.slug];
  if (!service) notFound();

  const directory = await getDirectory();
  const cityCount = directory.reduce((n, [, s]) => n + s.cities.length, 0);

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
            <span className="ha-eyebrow">{service.eyebrow}</span>
            <h1>{service.h1}</h1>
            <p>{service.lede}</p>
            <ul className="ha-checklist">
              {service.checklist.map((t) => (
                <li key={t}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
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

      {/* ============ WHY ============ */}
      <section className="ha-section ha-wrap">
        <ScrollReveal as="h2" className="ha-h2">Why choose {service.name.toLowerCase()}</ScrollReveal>
        <div className="ha-grid-3">
          {service.why.map((w, i) => (
            <ScrollReveal as="div" className="ha-panel ha-panel-top" style={{ "--panel-color": PALETTE[i % PALETTE.length] }} key={w.title}>
              <div className="ha-panel-title">{w.title}</div>
              <div className="ha-panel-body">{w.body}</div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="ha-section ha-wrap" id="how-it-works">
        <ScrollReveal as="h2" className="ha-h2">How it works</ScrollReveal>
        <ScrollReveal as="p" className="ha-lede">Four steps from quote to a vehicle in your driveway.</ScrollReveal>
        <div className="ha-grid-4">
          {service.how.map((s, i) => (
            <ScrollReveal as="div" className="ha-panel" style={{ "--panel-color": PALETTE[i % PALETTE.length] }} key={s.title}>
              <div className="ha-step-n">{String(i + 1).padStart(2, "0")}</div>
              <div className="ha-panel-title">{s.title}</div>
              <div className="ha-panel-body">{s.body}</div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ============ COST & TRANSIT ============ */}
      <section className="ha-section ha-wrap">
        <div className="ha-grid-2">
          <ScrollReveal as="div" className="ha-panel">
            <div className="ha-table-title">What does it cost?</div>
            <div className="ha-table-sub">{service.name} rates by distance.</div>
            {BANDS.map((b) => {
              const { low, high } = serviceRange(b.sample, service.priceFactor);
              return (
                <div className="ha-table-row" key={b.label}>
                  <span>{b.label}</span>
                  <span>${low.toLocaleString()}–${high.toLocaleString()}</span>
                </div>
              );
            })}
          </ScrollReveal>
          <ScrollReveal as="div" className="ha-panel">
            <div className="ha-table-title">How long does it take?</div>
            <div className="ha-table-sub">Typical transit time by distance.</div>
            {BANDS.map((b) => (
              <div className="ha-table-row" key={b.label}>
                <span>{b.label}</span>
                <span>{serviceTransit(b.sample, service.transitFactor)}</span>
              </div>
            ))}
          </ScrollReveal>
        </div>
      </section>

      {/* ============ BEST FOR ============ */}
      <section className="ha-section ha-wrap">
        <ScrollReveal as="h2" className="ha-h2">Best for</ScrollReveal>
        <div className="ha-grid-3">
          {service.bestFor.map((b, i) => (
            <ScrollReveal as="div" className="ha-panel ha-panel-top" style={{ "--panel-color": PALETTE[(i + 2) % PALETTE.length] }} key={b.title}>
              <div className="ha-panel-title">{b.title}</div>
              <div className="ha-panel-body">{b.body}</div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ============ OTHER SERVICES ============ */}
      <section className="ha-section ha-wrap">
        <ScrollReveal as="h2" className="ha-h2">Other ways we can ship</ScrollReveal>
        <ScrollReveal as="p" className="ha-lede">Not the right fit? Every service below runs on the same vetted carrier network.</ScrollReveal>
        <div className="ha-grid-3">
          {SERVICES.filter((s) => s.slug !== service.slug).map((s, i) => (
            <ScrollReveal as="div" key={s.slug}>
              <a href={`/services/${s.slug}`} className="ha-panel ha-panel-top ha-service-link" style={{ "--panel-color": PALETTE[i % PALETTE.length] }}>
                <div className="ha-panel-title">{s.name}</div>
                <div className="ha-panel-body">{s.eyebrow}</div>
              </a>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="ha-section ha-wrap">
        <ScrollReveal as="h2" className="ha-h2">Frequently asked questions</ScrollReveal>
        <ScrollReveal as="div">
          <FaqAccordion items={service.faqs} />
        </ScrollReveal>
        <p style={{ marginTop: 24 }}>
          <a href="/locations" className="btn btn-secondary">Browse all {cityCount || "2,000+"} cities</a>
        </p>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="ha-footer">
        <div className="ha-wrap ha-footer-inner">
          <div className="ha-footer-brand"><LogoMark size={24} />{BRAND.name}</div>
          <div className="ha-footer-tagline">{BRAND.tagline} © {new Date().getFullYear()} {BRAND.name}</div>
        </div>
      </footer>
      <ChatWidget serviceSlug="car-shipping" />
    </main>
  );
}
