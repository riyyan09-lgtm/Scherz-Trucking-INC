// Shared tapering per-mile rate model — used by the city page's rate table
// and price estimator, and the price-tiers card. Kept in one place so they
// never drift apart. (components/CostCalculator.js has its own copy for the
// standalone /car-shipping-cost-calculator page; not touched here.)
export function perMile(dist) {
  if (dist <= 500) return 1.15;
  if (dist <= 1000) return 0.75;
  if (dist <= 1500) return 0.6;
  if (dist <= 2500) return 0.5;
  return 0.42;
}
const round5 = (n) => Math.round(n / 5) * 5;
export function rateRange(dist) {
  const base = Math.max(dist * perMile(dist), 300);
  return { low: round5(base * 0.9), high: round5(base * 1.1) };
}
// Carriers cover roughly 400–500 road miles a day; call it ~450.
export function transitDays(dist) {
  const d = Math.max(1, Math.ceil(dist / 450));
  return d === 1 ? "1–2 days" : `${d}–${d + 2} days`;
}
