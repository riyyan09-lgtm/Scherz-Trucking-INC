// Static content that's identical across every city landing page — kept in
// one place so all 2,000+ pages import the same object instead of each
// re-declaring it. See HANDOFF-implementation.md section 3.

import { rateRange } from "./pricing";

export const STATS = [
  { value: "2,000+", label: "cities served" },
  { value: "Vetted", label: "carrier network" },
  { value: "Instant", label: "free quote" },
  { value: "1–7 days", label: "typical transit" },
];

// NOTE: the DC design's "trust stats" band (12+ years in business, 48,000+
// vehicles shipped, 98% satisfaction, 96% on-time, 99.7% damage-free) and
// its reviews section are fabricated numbers/testimonials with no source —
// deliberately not implemented. Presenting made-up stats and customer
// quotes as real on a live commercial site is the kind of deceptive
// advertising that gets flagged (FTC testimonial guidelines, plus it's
// just not true). Wire real ones in if/when they exist.

export const BUSINESS_SEGMENTS = [
  {
    tag: "Dealers",
    name: "Car dealerships",
    href: "/car-shipping/dealers",
    linkLabel: "Dealer shipping",
    description: "Multi-vehicle discounts, dealer trade transport, and auction pickup.",
  },
  {
    tag: "Repair & body shops",
    name: "Auto repair & body shops",
    href: "/car-shipping/repair-shops",
    linkLabel: "Shop shipping",
    description: "Get damaged or repaired vehicles moved to and from your shop without tying up a bay.",
  },
  {
    tag: "Fleet & auction",
    name: "Fleet & auction transport",
    href: "/car-shipping/fleet",
    linkLabel: "Fleet shipping",
    description: "Coordinated multi-car pickups for auctions, fleet resales, and relocations.",
  },
];

// Open is the base rate (lib/pricing.js); Enclosed and Expedited are derived
// multipliers so there's one source of truth for pricing across the rate
// table, estimator, and these tiers.
export function pricingTiers(distance) {
  const open = rateRange(distance);
  const enclosed = { low: Math.round(open.low * 1.4), high: Math.round(open.high * 1.4) };
  const expedited = { low: Math.round(open.low * 1.15), high: Math.round(open.high * 1.25) };
  return [
    {
      name: "Open Transport",
      tag: "Most popular",
      priceLow: open.low,
      priceHigh: open.high,
      highlighted: true,
      features: ["Best value, industry standard", "Multi-car carrier", "1–7 day transit typical", "Fully insured"],
    },
    {
      name: "Enclosed Transport",
      tag: "Premium protection",
      priceLow: enclosed.low,
      priceHigh: enclosed.high,
      highlighted: false,
      features: ["Weather & road-debris protection", "Ideal for classics & exotics", "Dedicated loading care", "Fully insured"],
    },
    {
      name: "Expedited",
      tag: "Fastest pickup",
      priceLow: expedited.low,
      priceHigh: expedited.high,
      highlighted: false,
      features: ["Priority carrier match", "Pickup within 24–48 hrs", "Open or enclosed available", "Fully insured"],
    },
  ];
}

// Free-license stock photos matching the design's 3 placeholder captions,
// reused across all pages (not location-specific) — see HANDOFF-implementation.md
// section 6. Swap these for real photography whenever it's available.
//
// Every consumer appends Imgix-style resize params (?w=&q=&fm=&fit=), e.g.
// the srcSet in app/[service]/[state]/[city]/page.js. Unsplash and Pexels are
// both Imgix-backed and honour the same parameter names, so mixing the two
// hosts is safe — but any future host must accept those params too, or the
// call sites need a builder function instead.
export const STOCK_PHOTOS = {
  // Side-on wide shot of a full multi-level carrier with ~7 uncovered vehicles
  // loaded. Unsplash's free pool had no equivalent wide, fully-loaded shot.
  hero: "https://images.pexels.com/photos/34539243/pexels-photo-34539243.jpeg",
  whyChooseUs: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf", // coordinator/office on a call
  prep: "https://images.unsplash.com/photo-1502877338535-766e1452684a", // vehicle being prepped/loaded
};
