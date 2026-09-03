import B2BPage from "../../components/B2BPage";
import { BUSINESS_SEGMENT_BY_SLUG } from "../../lib/businessSegments";
import "../organic.css";
export const dynamic = "force-dynamic";

// Shared factory for the For Business routes. Each app/car-shipping/<slug>/page.js
// is a thin wrapper around this, because these have to stay explicit static
// routes -- see the note in lib/businessSegments.js about why a dynamic
// app/car-shipping/[segment] route would shadow the 51 state pages.
//
// Content lives in lib/businessSegments.js; this only wires it to the layout.

import { SITE_URL } from "../../lib/siteUrl";

export function businessMetadata(slug) {
  const seg = BUSINESS_SEGMENT_BY_SLUG[slug];
  if (!seg) return {};
  return {
    title: seg.title,
    description: seg.description,
    alternates: { canonical: `${SITE_URL}/car-shipping/${seg.slug}` },
  };
}

export function BusinessSegmentPage({ slug }) {
  const seg = BUSINESS_SEGMENT_BY_SLUG[slug];
  if (!seg) return null;
  return (
    <main className={`og-page`}>
      <B2BPage
        segment={seg.slug}
        eyebrow={seg.eyebrow}
        heading={seg.heading}
        intro={seg.intro}
        points={seg.points}
        faq={seg.faq}
        faqHeading={seg.faqHeading}
      />
    </main>
  );
}
