import { notFound } from "next/navigation";
import { cache } from "react";
import { getPool } from "../../../../lib/db";
import { rateRange, transitDays } from "../../../../lib/pricing";
import { STATS, BUSINESS_SEGMENTS, pricingTiers, STOCK_PHOTOS } from "../../../../lib/landingConstants";
import CityQuoteForm from "../../../../components/CityQuoteForm";
import PriceEstimator from "../../../../components/PriceEstimator";
import BusinessSegments from "../../../../components/BusinessSegments";
import SiteHeader from "../../../../components/SiteHeader";
import ChatWidget from "../../../../components/ChatWidget";
import { LogoMark } from "../../../../components/Logo";
import { BRAND } from "../../../../lib/brand";
import "../../../organic.css";
export const dynamic = "force-dynamic";

// Loaded only for this route tree (not site-wide — admin/CRM/portal keep
// Inter). CSS variables so app/organic.css can reference them under .og-page
// without this file needing to know the generated font-family strings.
// Incremental Static Regeneration: this page is cached after first render and
// only rebuilt at most once per 5 minutes, instead of hitting the database on
// every visit. This is what keeps hosting cheap at thousands of pages while
// still reflecting data changes (new cities, geo, pricing) quickly.
export const revalidate = 300;

import { SITE_URL } from "../../../../lib/siteUrl";

// Shipping rules shown on every page (and appended to the FAQ). Keep these in
// sync with what carriers actually enforce:
//  - no insurance coverage on shipments to/from Hawaii, Alaska, Puerto Rico
//  - no personal belongings in the vehicle, EXCEPT Alaska (allowed for a fee)
const RULES_FAQ = [
  {
    q: "Can I pack personal belongings in my vehicle?",
    a: "On most shipments, yes — carriers allow up to 150 lbs of personal belongings, packed below the window line. Belongings are not allowed on shipments to or from Hawaii or Puerto Rico. On Alaska shipments, belongings are subject to an additional fee — ask your coordinator when booking.",
  },
  {
    q: "Is my vehicle insured during transport?",
    a: "Every carrier in our network has verified cargo insurance for shipments within the continental U.S. Note that insurance coverage is not available on shipments to or from Hawaii, Alaska, or Puerto Rico.",
  },
];

// cache() dedupes the query between generateMetadata and the page render.
const getPageData = cache(async function getPageData(serviceSlug, stateAbbr, citySlug) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select p.id, p.content_json, p.tenant_id,
              c.id as city_id, c.name as city_name, c.population as city_population,
              s.id as state_id, s.name as state_name, s.abbreviation as state_abbr,
              sv.name as service_name, sv.slug as service_slug,
              t.ga4_id, t.gads_conversion_id, t.gads_conversion_label, t.meta_pixel_id
       from pages p
       join cities c on p.location_city_id = c.id
       join states s on c.state_id = s.id
       join services sv on p.service_id = sv.id
       left join tenants t on p.tenant_id = t.id and t.deleted_at is null
       where sv.slug = $1
         and lower(s.abbreviation) = lower($2)
         and lower(replace(c.name, ' ', '-')) = lower($3)
         and p.status = 'published'
       limit 1`,
      [serviceSlug, stateAbbr, citySlug]
    );
    return rows[0] || null;
  } catch {
    // No database connected yet -- treat it the same as "page not found"
    // rather than crashing the whole route.
    return null;
  }
});

async function getNearbyCities(stateId, cityId, serviceSlug) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select c.name as city_name,
              lower(replace(c.name, ' ', '-')) as city_slug,
              lower(s.abbreviation) as state_abbr
       from pages p
       join cities c on p.location_city_id = c.id
       join states s on c.state_id = s.id
       join services sv on p.service_id = sv.id
       where s.id = $1
         and c.id <> $2
         and sv.slug = $3
         and p.status = 'published'
       order by c.population desc nulls last
       limit 6`,
      [stateId, cityId, serviceSlug]
    );
    return rows;
  } catch {
    return [];
  }
}

// City-unique "popular routes" — distances from THIS city to the largest U.S.
// metros (haversine on lat/lng). Every page therefore shows different, real
// route data, which is what separates it from a templated duplicate.
function haversine(a, b) {
  const R = 3958.8; // miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

const getRoutes = cache(async function getRoutes(cityId, citySlug) {
  try {
    const pool = getPool();
    const me = await pool.query(`select lat, lng from cities where id=$1`, [cityId]);
    const myGeo = me.rows[0] && me.rows[0].lat != null ? { lat: me.rows[0].lat, lng: me.rows[0].lng } : null;
    const { rows } = await pool.query(
      `select c.name, lower(s.abbreviation) as state, lower(replace(c.name,' ','-')) as slug, c.lat, c.lng
       from cities c join states s on c.state_id=s.id
       join pages p on p.location_city_id=c.id
       where c.lat is not null and p.service_id=1 and p.status='published'
       order by c.population desc nulls last limit 12`
    );
    return rows
      .map((r) => ({
        name: r.name,
        state: r.state,
        slug: r.slug,
        dist: myGeo ? haversine(myGeo, { lat: r.lat, lng: r.lng }) : null,
      }))
      .filter((r) => r.slug && r.slug !== citySlug.split("/")[1])
      .slice(0, 8);
  } catch {
    return [];
  }
});

// Unique title/description/canonical/social tags per city page.
export async function generateMetadata({ params }) {
  const { service, state, city } = params;
  const data = await getPageData(service, state, city);
  if (!data) return { title: "Page not found" };

  const content = data.content_json || {};
  const routes = await getRoutes(data.city_id, `${data.state_abbr.toLowerCase()}/${city.toLowerCase()}`);
  const topRoute = routes[0] || null;
  const topEst = topRoute && topRoute.dist != null ? rateRange(topRoute.dist) : null;
  const topTransit = topRoute && topRoute.dist != null ? transitDays(topRoute.dist) : null;
  const title = topRoute
    ? `${data.city_name}, ${data.state_abbr} → ${topRoute.name} Car Shipping — Licensed, Insured`
    : `Car Shipping ${data.city_name}, ${data.state_abbr} — Licensed Auto Transport Quotes`;
  const description = topEst
    ? `Ship a car ${data.city_name}, ${data.state_abbr} → ${topRoute.name}: est. $${topEst.low.toLocaleString()}–$${topEst.high.toLocaleString()} open (enclosed +30–50%), ${topTransit} transit, flexible door-to-door shipment. Get a free quote.`
    : (content.intro || `Ship your car to or from ${data.city_name}, ${data.state_name} with licensed, insured carriers. Free instant quote, door-to-door shipment.`).slice(0, 160);
  const path = `/${data.service_slug}/${state.toLowerCase()}/${city.toLowerCase()}`;
  const canonical = `${SITE_URL}${path}`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title, description, url: canonical, siteName: "Scherz Trucking INC", type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function LocationPage({ params }) {
  const { service, state, city } = params;
  const data = await getPageData(service, state, city);

  if (!data) return notFound();

  const content = data.content_json || {};
  const nearby = await getNearbyCities(data.state_id, data.city_id, data.service_slug);
  const routes = await getRoutes(data.city_id, `${data.state_abbr.toLowerCase()}/${city.toLowerCase()}`);
  const topRoute = routes[0] || null;
  const topEst = topRoute && topRoute.dist != null ? rateRange(topRoute.dist) : null;
  const topTransit = topRoute && topRoute.dist != null ? transitDays(topRoute.dist) : null;
  const routeFaq = topEst
    ? [
        {
          q: `How much does it cost to ship a car from ${data.city_name}, ${data.state_abbr} to ${topRoute.name}?`,
          a: `Open-transport estimates for ${data.city_name} → ${topRoute.name} typically run $${topEst.low.toLocaleString()}–$${topEst.high.toLocaleString()} (about ${topTransit}). Enclosed transport runs roughly 30–50% more for added protection. Get your exact quote above.`,
        },
        {
          q: `How long does car shipping take from ${data.city_name} to ${topRoute.name}?`,
          a: `Most ${data.city_name} → ${topRoute.name} shipments are picked up within a few days and delivered in ${topTransit}, depending on carrier schedule and exact pickup and drop-off ZIPs.`,
        },
        {
          q: `Should I choose open or enclosed transport for ${data.city_name} → ${topRoute.name}?`,
          a: `Open transport is the industry standard and best value for everyday cars. Choose enclosed if you're shipping a classic, exotic, or high-value vehicle that needs weather and road-debris protection.`,
        },
        {
          q: `How flexible is pickup when shipping from ${data.city_name}?`,
          a: `We arrange door-to-door shipment as close to your address as the street allows, with a pickup window you coordinate with your carrier. A small initial payment reserves your spot, and expedited pickup within 24–48 hours is available.`,
        },
      ]
    : [];
  const faq = [...(content.faq || []), ...routeFaq, ...RULES_FAQ];
  const pagePath = `/${data.service_slug}/${state.toLowerCase()}/${city.toLowerCase()}`;
  const title = topRoute
    ? `${data.city_name}, ${data.state_abbr} → ${topRoute.name} Car Shipping — Licensed, Insured`
    : `Car Shipping ${data.city_name}, ${data.state_abbr} — Licensed Auto Transport Quotes`;
  const tiers = pricingTiers(600);

  // Structured data: AutoDealer + FAQ + Breadcrumbs + WebPage. Stronger than a
  // generic Service type so Google can surface rich results (local business,
  // FAQ, breadcrumbs) and clearly ties the page to the Scherz Trucking INC brand entity.
  const org = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "Scherz Trucking INC",
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    sameAs: ["https://scherztruckinginc.com"],
  };
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "AutoDealer",
      "@id": `${SITE_URL}${pagePath}#business`,
      name: `Scherz Trucking INC — Car Shipping ${data.city_name}, ${data.state_name}`,
      url: `${SITE_URL}${pagePath}`,
      image: `${SITE_URL}/icon-512.png`,
      description:
        content.intro ||
        `Licensed, insured car shipping to and from ${data.city_name}, ${data.state_name}. Free instant quote, door-to-door shipment.`,
      priceRange: "$$",
      areaServed: {
        "@type": "City",
        name: data.city_name,
        containedInPlace: {
          "@type": "State",
          name: data.state_name,
          address: { "@type": "PostalAddress", addressRegion: data.state_abbr },
        },
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: data.city_name,
        addressRegion: data.state_abbr,
        addressCountry: "US",
      },
      makesOffer: {
        "@type": "Offer",
        name: `Car shipping quote — ${data.city_name}, ${data.state_name}`,
        description: topEst
          ? `Free instant quote for licensed, insured auto transport. Typical ${data.city_name} → ${topRoute.name}: $${topEst.low.toLocaleString()}–$${topEst.high.toLocaleString()} open, ${topTransit}.`
          : "Free instant quote for licensed, insured auto transport.",
        priceCurrency: "USD",
        ...(topEst ? { priceSpecification: { "@type": "PriceSpecification", minPrice: topEst.low, maxPrice: topEst.high, priceCurrency: "USD" } } : {}),
        url: `${SITE_URL}${pagePath}#quote`,
      },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: `Auto transport services in ${data.city_name}, ${data.state_name}`,
        itemListElement: [
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "Open carrier transport", description: `Multi-car open trailer shipping to and from ${data.city_name} — the industry standard and best value.` } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "Enclosed transport", description: "Fully enclosed trailers for classics, exotics, and high-value vehicles." } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "Door-to-door delivery", description: `Pickup and delivery as close to your ${data.city_name} address as the street allows.` } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "Inoperable vehicle transport", description: "Winch loading and specialty equipment for vehicles that don't run." } },
        ],
      },
      provider: org,
      parentOrganization: org,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${SITE_URL}${pagePath}#webpage`,
      name: title,
      description:
        content.intro ||
        `Ship your car to or from ${data.city_name}, ${data.state_name} with licensed, insured carriers.`,
      url: `${SITE_URL}${pagePath}`,
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: `${data.city_name}, ${data.state_abbr}`, item: `${SITE_URL}${pagePath}` },
        ],
      },
      mainEntity: {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    },
    org,
  ];

  // Self-managed ads: the OWNING tenant's ad-manager tags, rendered only on
  // pages this tenant owns (never on platform pages or other tenants' pages).
  // IDs are format-validated at save time (app/api/portal/adsettings) so they
  // are safe to interpolate. Conversion firing happens in QuoteForm on submit.
  const adConversion =
    data.gads_conversion_id && data.gads_conversion_label
      ? `${data.gads_conversion_id}/${data.gads_conversion_label}`
      : null;
  const gtagIds = [data.ga4_id, data.gads_conversion_id].filter(Boolean);

  const nonContiguousNote =
    data.state_abbr === "HI" || data.state_abbr === "AK"
      ? " Note: because this is an island/non-contiguous state, carrier insurance does not apply and personal belongings aren't permitted in the vehicle."
      : "";

  return (
    <main className={`og-page`}>
      {/* Warm up the connection to the image host before the hero loads —
          shaves TLS/DNS time off Largest Contentful Paint, especially on mobile. */}
      <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {gtagIds.length > 0 && (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${gtagIds[0]}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${gtagIds
                .map((id) => `gtag('config','${id}');`)
                .join("")}`,
            }}
          />
        </>
      )}
      {data.meta_pixel_id && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${data.meta_pixel_id}');fbq('track','PageView');`,
          }}
        />
      )}

      {/* ============ NAV ============ */}
      <SiteHeader theme="warm" quoteHref="#quote" />

      {/* ============ BREADCRUMB ============ */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px clamp(16px,4vw,40px) 0", fontSize: 13, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", display: "flex", gap: 6, flexWrap: "wrap" }}>
        <a href="/">Home</a><span>/</span>
        <a href={`/${data.service_slug}/${data.state_abbr.toLowerCase()}`}>{data.state_name}</a><span>/</span>
        <span style={{ color: "var(--color-text)" }}>{data.city_name}</span>
      </div>

      {/* ============ HERO + QUOTE ON IMAGE ============ */}
      {/* Full-bleed hero that runs from the header down to the next section.
          The carrier photo is an edge-to-edge background; the headline/checklist
          sit on the left over a dark gradient, and the city-themed quote card
          (cream/orange "Organic" theme) sits on the right ON the photo. */}
      <section className="og-hero" style={{ position: "relative", overflow: "hidden", display: "block", width: "100%", padding: "clamp(40px,5vw,64px) clamp(16px,4vw,40px) 0", borderBottom: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(180deg, var(--color-navy, #2e2b25) 0%, color-mix(in srgb, var(--color-navy, #2e2b25) 82%, var(--color-accent-800)) 100%)" }}>
        <img
          src={`${STOCK_PHOTOS.hero}?w=1600&q=55&fm=jpg&fit=crop`}
          srcSet={[640, 1024, 1600].map((w) => `${STOCK_PHOTOS.hero}?w=${w}&q=55&fm=jpg&fit=crop ${w}w`).join(", ")}
          sizes="100vw"
          width="1600"
          height="900"
          alt={`Auto transport carrier heading to ${data.city_name}, ${data.state_abbr}`}
          fetchPriority="high"
          decoding="async"
          className="og-hero-bg"
        />
        <div className="og-hero-overlay" />
        <div className="og-hero-grid" style={{ position: "relative", zIndex: 1, maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ paddingBottom: "clamp(28px,5vw,56px)" }}>
            <span className="tag tag-accent">{data.service_name} · {data.city_name}, {data.state_abbr}</span>
            <h1 style={{ marginTop: 14, fontSize: "clamp(32px,5vw,50px)", color: "#fff" }}>{content.headline || `${data.service_name} in ${data.city_name}, ${data.state_name}`}</h1>
            <p style={{ fontSize: 17, color: "color-mix(in srgb, var(--color-neutral-100) 82%, transparent)", maxWidth: "52ch", marginBottom: 22 }}>{content.intro}</p>
            <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: "10px 22px", padding: 0, margin: "0 0 22px" }}>
              {["Licensed, bonded & FMCSA compliant", "Fully insured, transparent pricing", "Door-to-door, nationwide coverage"].map((t) => (
                <li key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14, color: "var(--color-neutral-100)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-2-300)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                  {t}
                </li>
              ))}
            </ul>
            <div style={{ marginBottom: 26 }}>
              <a href="#quote" className="btn btn-primary" style={{ padding: "13px 24px", fontSize: 15 }}>Get My Free Quote</a>
            </div>
          </div>
          <div style={{ paddingBottom: "clamp(28px,5vw,56px)" }}>
            <div id="quote">
              <CityQuoteForm serviceSlug={data.service_slug} sourcePageId={data.id} tenantId={data.tenant_id} adConversion={adConversion} metaPixel={Boolean(data.meta_pixel_id)} />
            </div>
          </div>
        </div>
      </section>

      {/* ============ STATS STRIP ============ */}
      <section style={{ background: "var(--color-accent-2-800)", marginTop: "clamp(28px,4vw,48px)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px clamp(16px,4vw,40px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 16, textAlign: "center" }}>
          {STATS.map((s) => (
            <div key={s.label}><b style={{ display: "block", fontFamily: "var(--font-heading)", color: "var(--color-accent-300)", fontSize: 22 }}>{s.value}</b><span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12.5 }}>{s.label}</span></div>
          ))}
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="og-wrap">
        <h2>How shipping your car works</h2>
        <p className="text-muted" style={{ fontSize: 15.5, marginBottom: 28 }}>Three steps from quote to delivery — a coordinator handles everything in between.</p>
        <div className="og-grid-auto">
          <div className="card elev-sm" style={{ padding: 24 }}>
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--color-accent)", color: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", marginBottom: 8 }}>1</span>
            <h3 className="card-title">Get your quote</h3><p className="card-body">Tell us the route, dates, and vehicles. Takes under two minutes and costs nothing.</p>
          </div>
          <div className="card elev-sm" style={{ padding: 24 }}>
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--color-accent)", color: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", marginBottom: 8 }}>2</span>
            <h3 className="card-title">We match a carrier</h3><p className="card-body">A licensed carrier from our vetted network whose route and equipment fit your shipment.</p>
          </div>
          <div className="card elev-sm" style={{ padding: 24 }}>
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--color-accent)", color: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", marginBottom: 8 }}>3</span>
            <h3 className="card-title">Pickup and delivery</h3><p className="card-body">Picked up in {data.city_name} and delivered as close to the door as the street allows.</p>
          </div>
        </div>
      </section>

      {/* ============ WHY CHOOSE US ============ */}
      <section className="og-surface">
        <div className="og-wrap">
          <div className="og-2col" style={{ alignItems: "center", marginBottom: 26 }}>
            <div>
              <h2>Why ship with us</h2>
              <p className="text-muted" style={{ fontSize: 15.5 }}>Every {data.city_name} shipment runs through the same vetted network and the same coordinator — no call-center handoffs.</p>
            </div>
            <img
              src={`${STOCK_PHOTOS.whyChooseUs}?w=900&q=60&fm=jpg&fit=crop`}
              alt="Coordinator on a call"
              loading="lazy"
              width="900"
              height="600"
              className="washed"
              style={{ width: "100%", height: "clamp(180px,22vw,260px)", objectFit: "cover", borderRadius: 28 }}
            />
          </div>
          <div className="og-grid-auto">
            <div className="card elev-sm"><span className="tag tag-accent-2" style={{ width: "fit-content" }}>Verified</span><h3 className="card-title">Verified carriers only</h3><p className="card-body">Operating license, safety record, and certified insurance — checked on every booking.</p></div>
            <div className="card elev-sm"><span className="tag tag-accent-2" style={{ width: "fit-content" }}>Honest</span><h3 className="card-title">Honest pricing</h3><p className="card-body">Your quote reflects the real market rate for the {data.city_name} lane, not a teaser that changes at pickup.</p></div>
            <div className="card elev-sm"><span className="tag tag-accent-2" style={{ width: "fit-content" }}>Informed</span><h3 className="card-title">You stay informed</h3><p className="card-body">Booking, dispatch, pickup, delivery — you hear from us at every step.</p></div>
            <div className="card elev-sm"><span className="tag tag-accent-2" style={{ width: "fit-content" }}>Secure</span><h3 className="card-title">Secure payment</h3><p className="card-body">A deposit locks in your carrier; the balance is due on delivery. No surprises.</p></div>
          </div>
        </div>
      </section>

      {/* ============ SERVICES ============ */}
      <section id="services" className="og-wrap">
        <h2>Car shipping services in {data.city_name}</h2>
        <p className="text-muted" style={{ fontSize: 15.5, marginBottom: 26 }}>Whatever you're moving and wherever it's headed, we match you with a carrier routed through {data.city_name}.</p>
        <div className="og-grid-auto">
          <div className="card elev-sm"><h3 className="card-title">Open carrier transport</h3><p className="card-body">The industry standard — multi-car trailers, best value, most availability in and out of {data.city_name}.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Enclosed transport</h3><p className="card-body">Full coverage for classics, exotics, and high-value vehicles — roughly 30–50% more.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Door-to-door delivery</h3><p className="card-body">Pickup and delivery as close to your {data.city_name} address as the street allows.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Inoperable &amp; modified vehicles</h3><p className="card-body">Winching and specialty equipment for vehicles that don't run or don't fit standard dimensions.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Expedited shipping</h3><p className="card-body">Priority carrier match with pickup in as little as 24–48 hours when your timeline is tight.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Luxury &amp; exotic vehicles</h3><p className="card-body">White-glove enclosed handling for high-value vehicles, with top/soft-tie strapping on request.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Motorcycle shipping</h3><p className="card-body">Crated or standing transport for motorcycles, routed alongside our {data.city_name} auto carriers.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Military &amp; dealer transport</h3><p className="card-body">PCS-friendly scheduling for service members, plus volume dealer and auction transport accounts.</p></div>
        </div>
      </section>

      {/* ============ BUSINESS SEGMENTS ============ */}
      <BusinessSegments city={data.city_name} />

      {/* ============ PRICING TIERS ============ */}
      <section className="og-surface">
        <div className="og-wrap">
          <h2>{data.city_name} shipping options &amp; pricing</h2>
          <p className="text-muted" style={{ fontSize: 15.5, marginBottom: 24 }}>Pick the trailer type that fits your vehicle and timeline — every tier ships fully insured.</p>

          <PriceEstimator initialDistance={600} />

          <div className="og-grid-auto">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className="card"
                style={
                  tier.highlighted
                    ? { background: "var(--color-neutral-100)", boxShadow: "var(--shadow-lg)", border: "2px solid var(--color-accent)", padding: 24 }
                    : { background: "var(--color-neutral-100)", boxShadow: "var(--shadow-sm)", padding: 24 }
                }
              >
                <span className="tag tag-accent" style={{ width: "fit-content" }}>{tier.tag}</span>
                <h3 className="card-title" style={{ marginTop: 6 }}>{tier.name}</h3>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 26, color: "var(--color-accent-700)" }}>${tier.priceLow}–${tier.priceHigh}</div>
                <ul style={{ listStyle: "none", margin: "6px 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                  {tier.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, opacity: 0.85 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-2-700)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="#quote" className="btn btn-primary btn-block">Get this quote</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRICE FACTORS ============ */}
      <section className="og-wrap">
        <h2>What affects your {data.city_name} car shipping price</h2>
        <p className="text-muted" style={{ fontSize: 15.5, marginBottom: 26 }}>Auto transport pricing isn&apos;t a mystery — it comes down to a handful of factors.</p>
        <div className="og-grid-auto">
          <div className="card elev-sm"><h3 className="card-title">Distance &amp; route</h3><p className="card-body">Popular lanes out of {data.city_name} run cheaper per mile — carriers fill their trucks faster.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Vehicle size &amp; weight</h3><p className="card-body">A compact sedan costs less than a lifted truck or SUV. Oversized vehicles may need special equipment.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Open vs. enclosed</h3><p className="card-body">Open transport is the best value. Enclosed protects classics and exotics for roughly 30–50% more.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Running condition</h3><p className="card-body">A vehicle that starts and steers loads in minutes. Inoperable vehicles need a winch and extra labor.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Season &amp; demand</h3><p className="card-body">Snowbird season, summer moves, and month-end surges tighten truck space.</p></div>
          <div className="card elev-sm"><h3 className="card-title">Pickup flexibility</h3><p className="card-body">A 2–3 day pickup window lets us match a carrier already routed through {data.city_name}.</p></div>
        </div>
      </section>

      {/* ============ PREP BAND ============ */}
      <section className="og-wrap og-2col" style={{ alignItems: "center" }}>
        <img
          src={`${STOCK_PHOTOS.prep}?w=1000&q=70&fm=jpg&fit=crop`}
          alt="Vehicle prepared for open or enclosed auto transport"
          loading="lazy"
          width="1000"
          height="667"
          style={{ width: "100%", height: "clamp(220px,28vw,340px)", objectFit: "cover", borderRadius: 28 }}
        />
        <div>
          <h2>Getting your vehicle ready</h2>
          <p className="text-muted" style={{ fontSize: 15, marginBottom: 14 }}>A few minutes of prep protects you and speeds up pickup day:</p>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9, padding: 0 }}>
            {[
              "Wash the car and photograph it from every angle",
              "Leave about a quarter tank of fuel",
              "Remove toll tags and parking passes",
              "Disable alarms and note any quirks for the driver",
              "Keep belongings under 150 lbs and below the window line",
              "Hand over one working key — keep your spare",
            ].map((t) => (
              <li key={t} style={{ display: "flex", gap: 10, fontSize: 14.5 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-2-700)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============ RULES ============ */}
      <section className="og-wrap">
        <h2>Coverage &amp; rules to know</h2>
        <div className="og-grid-auto" style={{ marginTop: 24 }}>
          <div className="card" style={{ background: "var(--color-accent-100)" }}>
            <span className="tag tag-accent" style={{ width: "fit-content" }}>Know before you ship</span>
            <h3 className="card-title">Personal belongings</h3>
            <p className="card-body" style={{ opacity: 1, color: "var(--color-accent-800)" }}>Carriers allow up to <b>150 lbs</b>, packed <b>below the window line</b>. Not allowed to/from <b>Hawaii or Puerto Rico</b>; on Alaska shipments, belongings carry an added fee.</p>
          </div>
          <div className="card" style={{ background: "var(--color-accent-100)" }}>
            <span className="tag tag-accent" style={{ width: "fit-content" }}>Know before you ship</span>
            <h3 className="card-title">Insurance coverage</h3>
            <p className="card-body" style={{ opacity: 1, color: "var(--color-accent-800)" }}>Carrier cargo insurance covers shipments within the continental U.S. <b>Not available</b> to/from <b>Hawaii, Alaska, or Puerto Rico</b>.</p>
          </div>
        </div>
      </section>

      {/* ============ RATE TABLE ============ */}
      <section className="og-surface">
        <div className="og-wrap">
          <h2>{data.city_name} car shipping rates &amp; transit times</h2>
          <p className="text-muted" style={{ fontSize: 15.5, marginBottom: 24 }}>Estimated open-transport rates for the routes {data.city_name} shippers ask about most. Enclosed transport runs roughly 30–50% more.</p>
          {routes.length > 0 ? (
            <div style={{ overflowX: "auto", border: "1px solid var(--color-divider)", borderRadius: 16, background: "var(--color-neutral-100)" }}>
              <table className="table" style={{ minWidth: 560 }}>
                <thead><tr><th>Route</th><th>Distance</th><th>Est. cost (open)</th><th>Transit time</th></tr></thead>
                <tbody>
                  {routes.map((r) => {
                    const est = r.dist != null ? rateRange(r.dist) : null;
                    return (
                      <tr key={r.slug}>
                        <td><a href={`/${data.service_slug}/${r.state}/${r.slug}`}>{data.city_name} → {r.name}</a></td>
                        <td>{r.dist != null ? `~${r.dist.toLocaleString()} mi` : "—"}</td>
                        <td>{est ? `$${est.low.toLocaleString()} – $${est.high.toLocaleString()}` : "quote for price"}</td>
                        <td>{r.dist != null ? transitDays(r.dist) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="og-grid-auto">
              {nearby.slice(0, 6).map((n) => (
                <a key={n.city_slug} className="card elev-sm" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none" }} href={`/${data.service_slug}/${n.state_abbr}/${n.city_slug}`}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: "var(--color-text)" }}>{data.city_name} → {n.city_name}</span>
                  <span className="text-muted" style={{ fontSize: 13 }}>get a quote</span>
                </a>
              ))}
            </div>
          )}
          <p className="text-muted" style={{ fontSize: 13, marginTop: 14 }}>
            Estimates are for budgeting, not a binding quote. Shipping a different route? Try our <a href="/car-shipping-cost-calculator">cost calculator</a>, or <a href="#quote">get your exact quote</a> above.
          </p>
        </div>
      </section>

      {/* ============ SERVICE AREA ============ */}
      {nearby.length > 0 && (
        <section className="og-wrap">
          <h2>Serving {data.city_name} &amp; the surrounding area</h2>
          <p className="text-muted" style={{ fontSize: 15, marginBottom: 16 }}>Coordinators dispatch carriers throughout the {data.city_name} metro — including:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {nearby.map((n) => (
              <a key={n.city_slug} href={`/${data.service_slug}/${n.state_abbr}/${n.city_slug}`} className="tag tag-neutral">{n.city_name}</a>
            ))}
          </div>
        </section>
      )}

      {/* ============ LOCATION OVERVIEW ============ */}
      <section className="og-wrap">
        <h2>Shipping a car in {data.city_name}, {data.state_name}</h2>
        <p className="text-muted" style={{ fontSize: 15.5, maxWidth: "80ch", marginBottom: 22 }}>
          {data.city_name} is one of {data.state_name}&apos;s {data.city_population != null ? "communities" : "destinations"}, and our coordinators
          dispatch carriers through it year-round. Whether you&apos;re moving in, relocating out, buying from a
          distant seller, or sending a vehicle to family, we match you with a licensed, insured carrier
          routed through {data.city_name} — so pickup and delivery stay close to your door.{nonContiguousNote}
        </p>
      </section>

      {/* ============ FAQ ============ */}
      {faq.length > 0 && (
        <section style={{ maxWidth: 820, margin: "0 auto", padding: "clamp(40px,6vw,72px) clamp(16px,4vw,40px)" }}>
          <h2>{data.city_name} car shipping questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
            {faq.map((item, i) => (
              <details key={i} className="card elev-sm" open={i === 0} style={{ padding: "16px 18px" }}>
                <summary style={{ fontWeight: 700, fontFamily: "var(--font-heading)", fontSize: 15 }}>{item.q}</summary>
                <p style={{ marginTop: 10, opacity: 0.8, fontSize: 14.5 }}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* ============ FOOTER CTA ============ */}
      <section style={{ background: "var(--color-accent)", padding: "clamp(40px,6vw,64px) clamp(16px,4vw,40px)", textAlign: "center" }}>
        <h2 style={{ color: "var(--color-bg)" }}>Ready to ship your car from {data.city_name}?</h2>
        <p style={{ color: "color-mix(in srgb, var(--color-bg) 90%, transparent)", margin: "8px 0 22px" }}>Free instant quote, licensed &amp; insured carriers, no obligation.</p>
        <a href="#quote" className="btn" style={{ background: "var(--color-bg)", color: "var(--color-accent-800)", padding: "14px 28px", fontSize: 15 }}>Get My Free Quote</a>
      </section>

      {/* ============ FOOTER ============ */}
      <footer style={{ background: "var(--color-neutral-900)", padding: "40px clamp(16px,4vw,40px)", color: "rgba(255,255,255,0.85)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontFamily: "var(--font-heading)", color: "#fff", fontSize: 18 }}>
            <LogoMark size={26} />{BRAND.name}
          </div>
          <p style={{ fontSize: 14, marginTop: 10 }}>Licensed &amp; insured auto transport, matched city by city.</p>
          {nearby.length > 0 && (
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginTop: 10 }}>
              Also serving:{" "}
              {nearby.map((n, i) => (
                <span key={n.city_slug}>
                  {i > 0 && " · "}
                  <a href={`/${data.service_slug}/${n.state_abbr}/${n.city_slug}`} style={{ color: "rgba(255,255,255,0.75)" }}>{n.city_name}</a>
                </span>
              ))}
              {" · "}
              <a href="/" style={{ color: "rgba(255,255,255,0.75)" }}>all cities</a>
            </p>
          )}
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 14 }}>© {new Date().getFullYear()} Scherz Trucking INC</p>
        </div>
      </footer>

      {/* ============ STICKY MOBILE CTA ============ */}
      <div className="og-mobile-cta" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "var(--color-bg)", borderTop: "1px solid var(--color-divider)", padding: "10px 16px", boxShadow: "0 -6px 20px rgba(0,0,0,0.08)" }}>
        <a href="#quote" className="btn btn-primary btn-block" style={{ fontSize: 15, padding: 13 }}>Get My Free {data.city_name} Quote</a>
      </div>
      <ChatWidget serviceSlug={data.service_slug} sourcePageId={data.id} tenantId={data.tenant_id} />
    </main>
  );
}

// Pre-builds the most important pages at deploy time; everything else
// generates on first visit and gets cached (see `revalidate` above).
export async function generateStaticParams() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select sv.slug as service, lower(s.abbreviation) as state, lower(replace(c.name,' ','-')) as city
       from pages p
       join cities c on p.location_city_id = c.id
       join states s on c.state_id = s.id
       join services sv on p.service_id = sv.id
       where p.status = 'published'
       limit 50` // keep the build-time set small; the rest render on-demand via ISR
    );
    return rows;
  } catch {
    return [];
  }
}
