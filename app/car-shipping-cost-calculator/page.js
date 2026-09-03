import QuoteForm from "../../components/QuoteForm";
import CostCalculator from "../../components/CostCalculator";
import { LogoMark } from "../../components/Logo";
import { BRAND } from "../../lib/brand";
export const dynamic = "force-dynamic";

export const revalidate = 3600;

import { SITE_URL } from "../../lib/siteUrl";
const PATH = "/car-shipping-cost-calculator";

const FAQ = [
  {
    q: "How much does it cost to ship a car?",
    a: "Most car shipments run between about $0.40 and $1.15 per mile, depending on distance — shorter routes cost more per mile, longer routes less. A typical 1,000-mile move for a running sedan on an open carrier lands around $700–$900. Use the calculator above for an estimate on your exact route.",
  },
  {
    q: "What makes car shipping more expensive?",
    a: "Distance, vehicle size and weight, enclosed vs. open transport (enclosed runs 30–50% more), whether the vehicle runs, seasonal demand, and how tight your pickup window is. A flexible 2–3 day pickup window is the single easiest way to lower your price.",
  },
  {
    q: "Is this calculator's estimate the final price?",
    a: "No — it's a data-based estimate to help you budget. The real price reflects live carrier availability on your lane, which changes daily. Request a free quote for an exact, no-obligation number.",
  },
  {
    q: "Does it cost more to ship an inoperable car?",
    a: "Yes. A vehicle that doesn't start or steer needs a winch and extra labor to load, which typically adds a flat fee. Tell your coordinator the exact condition (rolls and steers, no keys, needs a forklift, etc.) so the carrier arrives with the right equipment.",
  },
];

export async function generateMetadata() {
  const title = "Car Shipping Cost Calculator — Free Instant Auto Transport Estimate";
  const description =
    "Estimate your car shipping cost instantly. Enter your pickup and delivery ZIP codes, vehicle, and transport type for a real price range — then get a free exact quote from licensed, insured carriers.";
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${PATH}` },
    robots: { index: true, follow: true },
    openGraph: { title, description, url: `${SITE_URL}${PATH}`, siteName: "Scherz Trucking INC", type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default function CalculatorPage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Car Shipping Cost Calculator",
      url: `${SITE_URL}${PATH}`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "Free tool that estimates auto transport cost from pickup and delivery ZIP codes, vehicle type, and transport option.",
      provider: { "@type": "Organization", name: "Scherz Trucking INC", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Car Shipping Cost Calculator", item: `${SITE_URL}${PATH}` },
      ],
    },
  ];

  return (
    <main className="lx">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="lx-nav">
        <a className="lx-logo" href="/"><LogoMark size={22} />{BRAND.name}</a>
        <a className="lx-nav-cta" href="#quote">Get a free quote</a>
      </header>

      <section className="lx-hero">
        <div className="lx-hero-inner">
          <div className="lx-hero-copy">
            <div className="lx-eyebrow">Free tool</div>
            <h1>Car Shipping Cost Calculator</h1>
            <p className="lx-sub">
              Get an instant, data-based estimate for shipping your car anywhere in the U.S. Enter your route and
              vehicle — no email required. Then lock in your exact price with a free quote from licensed, insured carriers.
            </p>
            <ul className="lx-ticks">
              <li>No signup to estimate</li>
              <li>Real per-mile rates</li>
              <li>Open &amp; enclosed</li>
            </ul>
          </div>
          <div className="lx-hero-form">
            <CostCalculator />
          </div>
        </div>
      </section>

      <section className="lx-strip">
        <div className="lx-strip-inner">
          <div><b>$0.42–$1.15</b><span>typical per-mile range</span></div>
          <div><b>1–7 days</b><span>typical transit</span></div>
          <div><b>Open</b><span>best value</span></div>
          <div><b>Enclosed</b><span>full protection</span></div>
        </div>
      </section>

      <section className="lx-section">
        <h2>How car shipping costs are calculated</h2>
        <p className="lx-section-sub">Auto transport pricing isn&apos;t random — it comes down to a handful of factors.</p>
        <div className="lx-cards">
          <div className="lx-card"><h3>Distance</h3><p>Longer routes cost more in total but less per mile. Rates taper from around $1.15/mi on short hauls to about $0.42/mi cross-country.</p></div>
          <div className="lx-card"><h3>Vehicle size</h3><p>A compact sedan takes less deck space and fuel than a lifted truck, SUV, or van. Bigger, heavier vehicles cost more.</p></div>
          <div className="lx-card"><h3>Open vs. enclosed</h3><p>Open transport is the standard and the best value. Enclosed protects classics and exotics from weather and debris for roughly 30–50% more.</p></div>
          <div className="lx-card"><h3>Running condition</h3><p>A vehicle that starts and steers loads in minutes. Inoperable vehicles need a winch and extra labor, which adds to the rate.</p></div>
          <div className="lx-card"><h3>Season &amp; demand</h3><p>Snowbird season, summer moves, and month-end surges tighten truck space and push prices up.</p></div>
          <div className="lx-card"><h3>Pickup flexibility</h3><p>A 2–3 day pickup window lets us match a carrier already routed your way — the easiest way to save.</p></div>
        </div>
      </section>

      <section className="lx-section lx-alt" id="quote">
        <h2>Get your exact free quote</h2>
        <p className="lx-section-sub">
          The calculator gets you in the ballpark. This gets you the real number — free, no obligation, from licensed and insured carriers.
        </p>
        <div style={{ maxWidth: 460, margin: "0 auto" }}>
          <QuoteForm serviceSlug="car-shipping" sourcePageId={null} tenantId={null} />
        </div>
      </section>

      <section className="lx-section lx-alt">
        <h2>Car shipping cost questions</h2>
        <div className="lx-faq">
          {FAQ.map((item, i) => (
            <details key={i} open={i === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="lx-footer">
        <div className="lx-footer-inner">
          <a className="lx-logo" href="/"><LogoMark size={22} />{BRAND.name}</a>
          <p>Licensed &amp; insured auto transport, matched city by city.</p>
          <p className="lx-fineprint">© {new Date().getFullYear()} Scherz Trucking INC · Estimates are for budgeting only and are not a binding quote.</p>
        </div>
      </footer>
    </main>
  );
}
