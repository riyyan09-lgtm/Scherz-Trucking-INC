// Rule-based FAQ knowledge base for the chat widget (components/ChatWidget.js).
// No LLM call, no per-message cost — matches the visitor's message against
// keyword sets and returns the first strong match. Anything that doesn't
// match falls through to the "let me get your info" lead-capture flow.
export const FAQ = [
  {
    keywords: ["cost", "price", "pricing", "how much", "rate", "quote", "expensive", "cheap"],
    answer: "Pricing depends on distance, vehicle size, and trailer type (open vs. enclosed) — most routes run $500–$1,500+. The fastest way to get an exact number is our free instant quote form, or try the Cost Calculator in the menu above.",
  },
  {
    keywords: ["how long", "transit", "time", "days", "when will", "delivery time", "eta"],
    answer: "Typical transit is 1–7 days depending on distance. Pickup is usually scheduled within a few days of booking, and your coordinator will give you a firmer window once a carrier is assigned.",
  },
  {
    keywords: ["insurance", "insured", "damage", "coverage", "protected"],
    answer: "Every carrier in our network carries verified cargo insurance for shipments within the continental U.S. Coverage isn't available on shipments to or from Hawaii, Alaska, or Puerto Rico.",
  },
  {
    keywords: ["open", "enclosed", "trailer", "difference"],
    answer: "Open transport (multi-car carrier) is the industry standard and most affordable option. Enclosed transport fully protects your vehicle from weather and road debris — usually about 40% more, popular for classics and exotics.",
  },
  {
    keywords: ["door to door", "door-to-door", "pickup location", "drop off", "where"],
    answer: "We're door-to-door — pickup and delivery happen as close to your specified addresses as a carrier truck can legally and safely get (some tight residential streets may need a nearby meeting spot).",
  },
  {
    keywords: ["deposit", "pay", "payment", "when do i pay", "upfront"],
    answer: "Most bookings need a small deposit to secure your carrier, with the balance due on delivery. Your coordinator will walk you through the exact terms when you book.",
  },
  {
    keywords: ["belongings", "items", "personal items", "pack", "luggage"],
    answer: "Carriers allow up to 150 lbs of personal belongings, packed below the window line. Not allowed on shipments to or from Hawaii or Puerto Rico; Alaska shipments allow it for an added fee.",
  },
  {
    keywords: ["hawaii", "alaska", "puerto rico"],
    answer: "We ship to Hawaii, Alaska, and Puerto Rico, but note: cargo insurance and personal-belongings allowances don't apply the same way there — Alaska allows belongings for an extra fee, Hawaii/Puerto Rico don't allow them at all, and insurance coverage is limited to the continental U.S.",
  },
  {
    keywords: ["how does it work", "how it works", "process", "steps"],
    answer: "Three steps: 1) Get a free quote (route, dates, vehicle), 2) We match you with a licensed, insured carrier from our vetted network, 3) Pickup and door-to-door delivery. A coordinator handles everything in between.",
  },
  {
    keywords: ["license", "licensed", "legit", "legitimate", "fmcsa", "trust"],
    answer: "Every carrier we work with is FMCSA-licensed and insured — we verify that before your vehicle ever gets booked.",
  },
  {
    keywords: ["dealer", "dealership", "wholesale", "auction"],
    answer: "We work with dealerships on multi-vehicle discounts, trade transport, and auction pickup — check out the For Business menu for dealer-specific shipping.",
  },
  {
    keywords: ["cancel", "cancellation", "refund"],
    answer: "You can cancel before a carrier is dispatched. Reach out to your coordinator or the tenant handling your shipment for the specifics of your booking.",
  },
];

const HUMAN_TRIGGERS = ["human", "agent", "representative", "real person", "talk to someone", "speak to someone"];

export function matchFaq(message) {
  const m = message.toLowerCase();
  if (HUMAN_TRIGGERS.some((t) => m.includes(t))) return null;
  let best = null;
  let bestScore = 0;
  for (const entry of FAQ) {
    const score = entry.keywords.reduce((n, k) => (m.includes(k) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best ? best.answer : null;
}
