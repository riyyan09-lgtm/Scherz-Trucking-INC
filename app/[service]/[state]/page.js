import { notFound } from "next/navigation";
import { cache } from "react";
import { getPool } from "../../../lib/db";
import { STOCK_PHOTOS } from "../../../lib/landingConstants";
import { rateRange, transitDays } from "../../../lib/pricing";
import CityQuoteForm from "../../../components/CityQuoteForm";
import SiteHeader from "../../../components/SiteHeader";
import ChatWidget from "../../../components/ChatWidget";
import { LogoMark } from "../../../components/Logo";
import { BRAND } from "../../../lib/brand";
import "../../organic.css";
export const dynamic = "force-dynamic";

export const revalidate = 300;

import { SITE_URL } from "../../../lib/siteUrl";

const getStateData = cache(async function getStateData(serviceSlug, stateAbbr) {
  try {
    const pool = getPool();
    const stateRes = await pool.query(
      `select id, name, abbreviation from states where lower(abbreviation) = lower($1) limit 1`,
      [stateAbbr]
    );
    if (stateRes.rows.length === 0) return null;
    const state = stateRes.rows[0];

    const cityRes = await pool.query(
      `select c.name as city_name, lower(replace(c.name, ' ', '-')) as city_slug, c.population
         from pages p
         join cities c on p.location_city_id = c.id
         join services sv on p.service_id = sv.id
        where sv.slug = $1 and c.state_id = $2 and p.status = 'published'
        order by c.population desc nulls last, c.name asc`,
      [serviceSlug, state.id]
    );
    return { state, cities: cityRes.rows };
  } catch {
    return null;
  }
});

export async function generateStaticParams() {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select distinct sv.slug as service, lower(s.abbreviation) as state
         from pages p
         join cities c on p.location_city_id = c.id
         join states s on c.state_id = s.id
         join services sv on p.service_id = sv.id
        where p.status = 'published'
        limit 55`
    );
    return rows;
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }) {
  const { service, state } = params;
  const data = await getStateData(service, state);
  if (!data) return { title: "Page not found" };
  const title = `Car Shipping in ${data.state.name} — Licensed Auto Transport Quotes`;
  // Representative mid-range estimate so the SERP snippet shows a real price
  // band + transit for state-level (no single destination) pages.
  const repEst = rateRange(600);
  const repTransit = transitDays(600);
  const description = `Ship your car to or from ${data.cities.length} cities in ${data.state.name} with licensed, insured carriers. Open transport ~$${repEst.low.toLocaleString()}–$${repEst.high.toLocaleString()} (enclosed +30–50%), ${repTransit} transit. Free instant quote, door-to-door shipment.`;
  const canonical = `${SITE_URL}/${service}/${state.toLowerCase()}`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title, description, url: canonical, siteName: "Scherz Trucking INC", type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function StatePage({ params }) {
  const { service, state } = params;
  const data = await getStateData(service, state);
  if (!data) return notFound();

  const { state: st, cities } = data;
  const topCities = cities.slice(0, 4).map((c) => c.city_name).join(", ");

  return (
    <main className={`og-page`}>
      <SiteHeader theme="warm" quoteHref="#quote" />

      {/* ============ HERO ============ */}
      <section className="og-hero" style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(28px,4vw,48px) clamp(16px,4vw,40px) 8px", gap: "clamp(24px,4vw,48px)", alignItems: "start" }}>
        <div>
          <span className="tag tag-accent">Car Shipping · {st.name}</span>
          <h1 style={{ marginTop: 14, fontSize: "clamp(32px,5vw,50px)" }}>Car shipping across {st.name}</h1>
          <p style={{ fontSize: 17, color: "color-mix(in srgb, var(--color-text) 72%, transparent)", maxWidth: "52ch", marginBottom: 22 }}>
            {cities.length > 0
              ? `Free instant quotes in ${cities.length} ${st.name} cit${cities.length === 1 ? "y" : "ies"}${topCities ? `, including ${topCities}` : ""}. Licensed, insured carriers — door-to-door shipment.`
              : `Free instant car shipping quotes anywhere in ${st.name}. Licensed, insured carriers — door-to-door shipment.`}
          </p>
          <img
            src={`${STOCK_PHOTOS.hero}?w=1200&q=55&fm=jpg&fit=crop`}
            width="1600"
            height="900"
            alt={`Auto transport carrier serving ${st.name}`}
            fetchPriority="high"
            decoding="async"
            className="washed"
            style={{ width: "100%", height: "clamp(180px,26vw,320px)", objectFit: "cover", borderRadius: 28 }}
          />
        </div>
        <div id="quote">
          <CityQuoteForm serviceSlug={service} sourcePageId={null} tenantId={null} />
        </div>
      </section>

      {/* ============ CITY LIST ============ */}
      {cities.length > 0 && (
        <section className="og-wrap">
          <h2>Cities we cover in {st.name}</h2>
          <p className="text-muted" style={{ fontSize: 15.5, marginBottom: 24 }}>Pick your city for local pricing and pickup details.</p>
          <div className="og-grid-auto" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {cities.map((c) => (
              <a
                key={c.city_slug}
                href={`/${service}/${state.toLowerCase()}/${c.city_slug}`}
                className="card elev-sm"
                style={{ padding: "16px 18px", textDecoration: "none" }}
              >
                <span className="card-title" style={{ fontSize: 15 }}>{c.city_name}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer style={{ borderTop: "1px solid var(--color-divider)", marginTop: "clamp(28px,4vw,48px)" }}>
        <div className="og-wrap" style={{ textAlign: "center", paddingTop: "clamp(24px,4vw,36px)", paddingBottom: "clamp(24px,4vw,36px)" }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--color-text)", fontWeight: 700, fontSize: 17 }}>
            <LogoMark size={26} />
            {BRAND.name}
          </a>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>Licensed &amp; insured auto transport, matched city by city.</p>
          <p className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>© {new Date().getFullYear()} Scherz Trucking INC</p>
        </div>
      </footer>
      <ChatWidget serviceSlug={service} />
    </main>
  );
}
