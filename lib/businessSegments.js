// Single source of truth for the "For Business" segments.
//
// Three of these (dealers, repair-shops, fleet) shipped as hand-built pages
// with their content inline; the design handoff's For Business menu lists six
// categories, so the rest are added here. Consolidating means the page list,
// the header dropdown (components/SiteHeader.js), and the API's accepted
// segment allowlist (app/api/business-inquiry/route.js) all derive from one
// array — that allowlist silently 400s any segment it doesn't know, so a new
// page added without updating it would render fine and then fail on submit.
//
// NOTE: these pages are deliberately explicit static routes
// (app/car-shipping/<slug>/page.js) rather than one dynamic
// app/car-shipping/[segment] route. A dynamic segment there would be a more
// specific match than app/[service]/[state], so /car-shipping/tx would resolve
// to the business template instead of the Texas state page, breaking all 51
// state routes.

export const BUSINESS_SEGMENTS_FULL = [
  {
    slug: "dealers",
    navLabel: "Auto Dealerships & Dealer Trades",
    eyebrow: "Car Dealerships",
    title: "Car Dealer Vehicle Shipping — Multi-Vehicle & Trade Transport",
    description: "Volume-friendly car shipping for dealerships — multi-vehicle discounts, dealer trade transport, and auction pickup, with a dedicated coordinator.",
    heading: "Multi-vehicle shipping for car dealerships",
    intro: "Dealer trade transport, auction pickup, and multi-vehicle discounts — with a dedicated coordinator who knows your account, not a new rep every time.",
    points: [
      "Volume-based pricing that scales with your shipment count",
      "Dealer trade transport between rooftops",
      "Auction lot pickup and delivery",
      "One coordinator who knows your account",
    ],
    faqHeading: "Dealer shipping questions",
    faq: [
      { q: "Do you offer volume pricing for dealerships?", a: "Yes — pricing scales with your shipping volume, and a dedicated coordinator manages your account rather than routing each shipment through general intake." },
      { q: "Can you handle auction pickups?", a: "Yes, we regularly coordinate pickup and delivery to and from auction lots as part of dealer trade transport." },
      { q: "Do you offer invoice terms?", a: "Business accounts can be set up with invoice terms — ask your coordinator when you request an account." },
    ],
  },
  {
    slug: "auctions",
    navLabel: "Vehicle Auctions & Remarketers",
    eyebrow: "Auctions & Remarketing",
    title: "Auction & Remarketing Vehicle Transport",
    description: "Post-sale transport for auctions and remarketers — lot pickup within the free-storage window, gate-pass handling, and volume pricing.",
    heading: "Auction and remarketing vehicle transport",
    intro: "Move sold units off the lot before storage fees start. We coordinate gate passes, buyer delivery, and multi-unit runs out of any major auction.",
    points: [
      "Lot pickup inside the free-storage window",
      "Gate pass and release paperwork coordinated for you",
      "Multi-unit runs consolidated onto one carrier",
      "Direct delivery to the winning buyer",
    ],
    faqHeading: "Auction transport questions",
    faq: [
      { q: "How fast can you collect a sold unit?", a: "For most major auction locations we can have a carrier on the lot within a couple of business days, which is normally inside the free-storage window. Tell your coordinator the sale date and we'll work backwards from when storage fees begin." },
      { q: "Can you handle the gate pass and release paperwork?", a: "Yes. Send us the buyer number and release details and we handle the gate pass with the auction directly — the driver arrives with everything needed to load." },
      { q: "Do you ship units that don't run?", a: "Yes. Flag any non-running or damaged units when booking so a carrier with a winch is assigned; that's common on remarketing runs." },
      { q: "Can several units go on one carrier?", a: "Where the units are at the same location and headed the same direction, yes — consolidating onto one carrier is usually the cheapest way to clear a lot." },
    ],
  },
  {
    slug: "fleet",
    navLabel: "Fleet & Rental Companies",
    eyebrow: "Fleet & Rental",
    title: "Fleet & Rental Vehicle Transport",
    description: "Coordinated multi-car pickups for fleet rebalancing, rental resales, and relocations — volume pricing with a dedicated coordinator.",
    heading: "Fleet & rental vehicle transport",
    intro: "Coordinated multi-car pickups for fleet rebalancing, rental resales, and relocations — one coordinator managing the whole run.",
    points: [
      "Multi-vehicle pickup coordinated in a single visit where possible",
      "Branch-to-branch rebalancing and seasonal repositioning",
      "Recurring fleet relocation scheduling",
      "Volume pricing for fleet accounts",
    ],
    faqHeading: "Fleet & rental shipping questions",
    faq: [
      { q: "Can you coordinate a multi-vehicle pickup in one visit?", a: "Yes — that's the core of fleet transport. Tell us the vehicle count and locations and we'll coordinate a single carrier run where possible." },
      { q: "Do you handle recurring fleet relocations?", a: "Yes, a dedicated coordinator can manage a recurring shipping schedule for fleet resales, relocations, or seasonal repositioning." },
      { q: "Can you move units between rental branches?", a: "Yes. Branch-to-branch rebalancing is a standard fleet run — give us the origin and destination branches and the unit count." },
    ],
  },
  {
    slug: "repair-shops",
    navLabel: "Repair & Body Shops",
    eyebrow: "Repair & Body Shops",
    title: "Auto Repair & Body Shop Vehicle Shipping",
    description: "Get damaged or repaired vehicles moved to and from your shop without tying up a bay — volume-friendly pricing for repair and body shops.",
    heading: "Vehicle shipping for repair & body shops",
    intro: "Get damaged or repaired vehicles moved to and from your shop without tying up a bay — winch loading available for vehicles that don't run.",
    points: [
      "Winching and specialty equipment for non-running vehicles",
      "Pickup from the customer, insurer, or auction — delivery to your shop",
      "Return delivery once repairs are complete",
      "Volume pricing for recurring shop shipments",
    ],
    faqHeading: "Repair & body shop shipping questions",
    faq: [
      { q: "Can you pick up an inoperable or wrecked vehicle?", a: "Yes — winching and specialty equipment are available for vehicles that don't run or don't fit standard dimensions." },
      { q: "Do you work directly with insurance/customer drop-offs?", a: "Yes, we can coordinate pickup from wherever the vehicle currently is and delivery to your shop, or from your shop back to the owner." },
      { q: "Is there a discount for recurring shop volume?", a: "Yes — pricing scales with how often your shop ships, and a dedicated coordinator manages your account." },
    ],
  },
  {
    slug: "relocation",
    navLabel: "Relocation & Corporate Movers",
    eyebrow: "Relocation & Corporate",
    title: "Corporate Relocation Vehicle Shipping",
    description: "Employee vehicle shipping for relocation firms and corporate mobility teams — billed to the company, coordinated around the household move.",
    heading: "Vehicle shipping for corporate relocation",
    intro: "Ship the employee's vehicles on the same timeline as the household goods, billed to the company instead of the transferee.",
    points: [
      "Timed to the household goods move-in date",
      "Billed to the company, not the employee",
      "One coordinator across multiple transferees",
      "Consolidated reporting for mobility teams",
    ],
    faqHeading: "Relocation shipping questions",
    faq: [
      { q: "Can you bill the company instead of the employee?", a: "Yes. Corporate accounts are invoiced directly, so the transferee never puts a card down — ask your coordinator to set up billing terms when you open the account." },
      { q: "Can delivery be timed to the household goods arrival?", a: "That's the usual request. Give us the move-in date and we schedule pickup backwards from it, so the vehicle isn't sitting at an empty house or arriving after the family needs it." },
      { q: "Can you handle several transferees at once?", a: "Yes — one coordinator manages all of your active files rather than each transferee going through general intake separately." },
      { q: "What if the employee's dates change?", a: "Relocation dates move constantly. Tell your coordinator as soon as you know and the pickup is rescheduled; nothing is charged until a carrier is dispatched." },
    ],
  },
  {
    slug: "marketplaces",
    navLabel: "Online Car Marketplaces",
    eyebrow: "Online Marketplaces",
    title: "Vehicle Delivery for Online Car Marketplaces",
    description: "Buyer delivery for online car marketplaces and dealers selling remotely — seller pickup, buyer delivery, and condition documentation.",
    heading: "Buyer delivery for online car sales",
    intro: "Close the sale without the buyer flying in. We collect from the seller, document condition, and deliver to the buyer's door.",
    points: [
      "Seller pickup and buyer doorstep delivery",
      "Photographed condition record at both ends",
      "Enclosed option for high-value listings",
      "Per-transaction or volume pricing",
    ],
    faqHeading: "Marketplace delivery questions",
    faq: [
      { q: "How is the vehicle's condition documented?", a: "Condition is recorded on the Bill of Lading at pickup and again at delivery, with photos at both ends — which is what settles the overwhelming majority of remote-sale disputes before they start." },
      { q: "Can the buyer inspect before accepting?", a: "The buyer inspects against the Bill of Lading at delivery and notes anything before signing. That signature is the delivery record, so it's worth telling buyers up front not to sign until they've walked the car." },
      { q: "Do you offer enclosed transport for premium listings?", a: "Yes — enclosed is available on any route and is the normal choice above roughly the $75k mark or for anything collectible." },
      { q: "Can this be white-labelled into our checkout?", a: "Talk to your coordinator about a volume arrangement. We can quote per transaction or set up account pricing your listings can reference." },
    ],
  },
  {
    slug: "manufacturers",
    navLabel: "Manufacturers & OEM Distribution",
    eyebrow: "Manufacturers & OEM",
    title: "OEM & Manufacturer Vehicle Distribution",
    description: "Plant-to-dealer and port-to-dealer vehicle distribution for manufacturers and OEM programmes — scheduled runs with volume pricing.",
    heading: "OEM and manufacturer vehicle distribution",
    intro: "Scheduled plant, port, and rail-head distribution to your dealer network, plus press-fleet and pre-production moves that need discretion.",
    points: [
      "Plant, port, and rail-head to dealer distribution",
      "Scheduled recurring runs on fixed lanes",
      "Enclosed transport for press and pre-production units",
      "Contract pricing for programme volume",
    ],
    faqHeading: "OEM distribution questions",
    faq: [
      { q: "Do you run scheduled distribution lanes?", a: "Yes. For recurring volume on a fixed lane we set up a standing schedule with contract pricing rather than quoting each load individually." },
      { q: "Can you move pre-production or press units?", a: "Yes — those normally ship enclosed, and we can restrict handling and photography where a unit is under embargo. Tell your coordinator the confidentiality requirements when the programme is set up." },
      { q: "Can you collect from ports and rail heads?", a: "Yes, port and rail-head collection to the dealer network is standard OEM distribution work." },
      { q: "What reporting do you provide?", a: "Programme accounts get consolidated reporting across all active loads rather than per-shipment updates only." },
    ],
  },
];

// Slugs the business-inquiry API will accept.
export const BUSINESS_SEGMENT_SLUGS = BUSINESS_SEGMENTS_FULL.map((s) => s.slug);

export const BUSINESS_SEGMENT_BY_SLUG = Object.fromEntries(BUSINESS_SEGMENTS_FULL.map((s) => [s.slug, s]));

// Header "For Business" dropdown entries, in the design handoff's order.
export const BUSINESS_NAV = BUSINESS_SEGMENTS_FULL.map((s) => ({
  label: s.navLabel,
  href: `/car-shipping/${s.slug}`,
}));
