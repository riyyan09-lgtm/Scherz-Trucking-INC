import { getDirectory } from "../../lib/cityDirectory";
import SiteHeader from "../../components/SiteHeader";
import { LogoMark } from "../../components/Logo";
import { BRAND } from "../../lib/brand";
import LocationsFilter from "../../components/LocationsFilter";
import ChatWidget from "../../components/ChatWidget";
export const dynamic = "force-dynamic";

export const revalidate = 300;

export const metadata = {
  title: "Car Shipping Locations — All Cities We Cover",
  description: "Browse every U.S. city Scherz Trucking INC ships cars to and from. Free instant quotes, licensed and insured carriers.",
  alternates: { canonical: "/locations" },
  openGraph: {
    title: "Car Shipping Locations — All Cities We Cover",
    description: "Browse every U.S. city Scherz Trucking INC ships cars to and from.",
    url: "/locations",
    siteName: "Scherz Trucking INC",
    type: "website",
  },
};

export default async function LocationsPage() {
  const directory = await getDirectory();
  const cityCount = directory.reduce((n, [, s]) => n + s.cities.length, 0);

  return (
    <main className="lx">
      <SiteHeader />

      <section className="lx-section" style={{ paddingBottom: 0 }}>
        <h1 style={{ color: "var(--navy)", fontSize: 34, letterSpacing: "-0.02em", marginBottom: 10 }}>All locations</h1>
        <p className="lx-section-sub" style={{ marginBottom: 22 }}>
          {cityCount || "500+"} cities across all 50 states. Pick yours for local pricing and pickup details, or search below.
        </p>
        <LocationsFilter />
      </section>

      {directory.length > 0 && (
        <section className="lx-dir">
          {directory.map(([stateName, s]) => (
            <details key={s.abbr} id={s.abbr.toLowerCase()} data-dir-state={stateName.toLowerCase()}>
              <summary>{stateName} <span>— {s.cities.length} cit{s.cities.length === 1 ? "y" : "ies"}</span></summary>
              <div className="lx-dir-cities">
                {s.cities.map((c) => (
                  <a key={c.city_slug} href={`/car-shipping/${c.state_slug}/${c.city_slug}`} data-dir-city={c.city_name.toLowerCase()}>
                    {c.city_name}
                  </a>
                ))}
              </div>
            </details>
          ))}
        </section>
      )}

      <footer className="lx-footer">
        <div className="lx-footer-inner">
          <a className="lx-logo" href="/"><LogoMark size={22} />{BRAND.name}</a>
          <p>Licensed &amp; insured auto transport, matched city by city.</p>
          <p className="lx-fineprint">© {new Date().getFullYear()} Scherz Trucking INC</p>
        </div>
      </footer>
      <ChatWidget serviceSlug="car-shipping" />
    </main>
  );
}
