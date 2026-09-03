// Content for the 8 service pages in the design handoff's Services dropdown
// ("Animate ShipGrid website.zip", nav spec). One entry per page; the shared
// template is app/services/[slug]/page.js, so adding a service here creates a
// fully-built page with no new layout code.
//
// `priceFactor` multiplies the base open-carrier rate from lib/pricing.js
// (rateRange) so every quoted range stays derived from the one pricing model
// the rest of the site uses -- no hand-typed dollar figures that can drift out
// of sync with real quotes. `transitFactor` does the same for transit days.

export const SERVICES = [
  {
    // The umbrella service — the one nav label that points at the broad
    // "car shipping" offering rather than a specific trailer type. Adding it
    // here (a) makes /services/car-shipping resolve instead of 404-ing and
    // (b) puts "Car Shipping" at the top of the Services dropdown, which had
    // been missing its own primary entry.
    slug: "car-shipping",
    name: "Car Shipping",
    navLabel: "Car Shipping",
    eyebrow: "Nationwide auto transport",
    h1: "Car shipping quotes, matched with a licensed carrier",
    lede: "Ship your car to or from anywhere in the U.S. with licensed, insured carriers — free instant quote, door-to-door shipment, and upfront pricing.",
    checklist: ["Licensed & insured carriers", "Door-to-door, nationwide", "Small initial payment reserves your spot"],
    priceFactor: 1,
    transitFactor: 1,
    why: [
      { title: "One vetted carrier network", body: "Every carrier's FMCSA license and cargo insurance is verified before your vehicle moves — whichever trailer type fits." },
      { title: "You stay informed", body: "Booking, dispatch, pickup, and delivery — you hear from a coordinator at every step, not a call-center handoff." },
      { title: "Honest pricing", body: "Your quote reflects the real market rate for your lane, not a teaser that changes at pickup." },
    ],
    how: [
      { title: "Get your quote", body: "Enter your route and vehicle for an instant, upfront price." },
      { title: "We match a carrier", body: "We dispatch to a licensed, insured carrier from our network routed through your pickup." },
      { title: "Pickup and delivery", body: "Loaded, inspected on the Bill of Lading, and delivered as close to your door as the street allows." },
      { title: "Receive your vehicle", body: "Inspect, sign off, and you're done — the balance is due at delivery." },
    ],
    bestFor: [
      { title: "Everyday vehicles", body: "Sedans, SUVs, and trucks in normal running condition." },
      { title: "Cross-country moves", body: "Relocation shipping where open transport's savings add up most." },
      { title: "Buying or selling", body: "Vehicles moving between private sellers, dealers, or auction." },
    ],
    faqs: [
      { q: "How is my quote calculated?", a: "Your quote is based on the distance of your route, the type of vehicle being shipped, and current carrier demand on that lane." },
      { q: "Do I have to pay anything upfront?", a: "No. Payment is due once a carrier is dispatched to your pickup — standard practice among reputable brokers." },
      { q: "Is my vehicle insured during transport?", a: "Every carrier in our network has verified cargo insurance for shipments within the continental U.S. Coverage is not available to/from Hawaii, Alaska, or Puerto Rico." },
    ],
  },
  {
    slug: "open-car-transport",
    name: "Open Car Transport",
    navLabel: "Open Car Transport",
    eyebrow: "Most popular service",
    h1: "Open car transport, the industry standard",
    lede: "Roughly 4 in 5 vehicles ship on an open carrier — it's the most affordable way to move a car, and every carrier in our network is licensed and insured.",
    checklist: ["Lowest cost per mile", "Widest carrier availability", "Licensed & insured carriers"],
    priceFactor: 1,
    transitFactor: 1,
    why: [
      { title: "The best value, by a wide margin", body: "Your vehicle shares a multi-car trailer, so the cost of the trip is split across 6–10 vehicles instead of falling on yours alone." },
      { title: "Most carriers, shortest wait", body: "Open trailers make up the large majority of the fleet, so there are more carriers running your route and less waiting for a match." },
      { title: "Fully insured in transit", body: "Every carrier's FMCSA license and cargo insurance is verified before your vehicle is loaded." },
    ],
    how: [
      { title: "Get your quote", body: "Enter your route and vehicle for an upfront open-carrier price." },
      { title: "We match a carrier", body: "We dispatch to a licensed, insured carrier already running your route." },
      { title: "Loaded and inspected", body: "The driver records the vehicle's condition on the Bill of Lading at pickup." },
      { title: "Delivered to your door", body: "Inspect against the Bill of Lading, sign off, and you're done." },
    ],
    bestFor: [
      { title: "Everyday vehicles", body: "Sedans, SUVs, and trucks in normal running condition." },
      { title: "Cost-first shipping", body: "When price matters more than shaving a day or two off transit." },
      { title: "Longer moves", body: "Cross-country relocations where open transport's savings add up most." },
    ],
    faqs: [
      { q: "Is my car safe on an open carrier?", a: "Yes — it's the same method manufacturers use to deliver new cars to dealerships. Your vehicle is exposed to weather and road spray, but it's secured by trained drivers and covered by the carrier's cargo insurance." },
      { q: "How far in advance should I book?", a: "Booking one to two weeks ahead usually gets you the best price and the widest choice of pickup dates. Last-minute shipments can still be placed, but rates are driven by whatever carriers are nearby." },
      { q: "Can I pack belongings in the car?", a: "On most open shipments carriers allow up to 150 lbs of personal belongings packed below the window line. Belongings aren't permitted on Hawaii or Puerto Rico shipments." },
    ],
  },
  {
    slug: "enclosed-car-transport",
    name: "Enclosed Car Transport",
    navLabel: "Enclosed Car Transport",
    eyebrow: "Premium protection",
    h1: "Enclosed transport for cars that shouldn't see the road",
    lede: "A fully enclosed trailer keeps weather, road debris, and prying eyes off your vehicle from pickup to delivery — the standard choice for classics, exotics, and anything irreplaceable.",
    checklist: ["Fully enclosed trailer", "Soft straps & lift-gate loading", "Higher insurance limits"],
    priceFactor: 1.4,
    transitFactor: 1,
    why: [
      { title: "Nothing touches your vehicle", body: "Hard walls and a roof mean no rain, hail, road salt, gravel, or UV exposure for the entire trip." },
      { title: "Built for low clearance", body: "Lift-gate or low-angle ramps and soft straps load vehicles that would scrape on an open trailer's ramps." },
      { title: "Higher coverage limits", body: "Enclosed carriers typically carry substantially more cargo insurance, which is what makes them the right call for high-value vehicles." },
    ],
    how: [
      { title: "Get your quote", body: "Enter your route and vehicle for an upfront enclosed-carrier price." },
      { title: "We match a specialist", body: "We dispatch to a carrier that runs enclosed equipment and handles high-value vehicles." },
      { title: "Careful, documented loading", body: "Condition is photographed and recorded on the Bill of Lading before the doors close." },
      { title: "Delivered enclosed", body: "The vehicle comes off in the same condition it went on — inspect and sign off." },
    ],
    bestFor: [
      { title: "Classics & collectors", body: "Vintage and restored vehicles where paint and originality carry the value." },
      { title: "Exotics & supercars", body: "Low-clearance, high-value cars that need lift-gate loading." },
      { title: "New & rare deliveries", body: "Anything arriving to a buyer or a show where condition on arrival is the whole point." },
    ],
    faqs: [
      { q: "How much more does enclosed cost?", a: "Plan on roughly 40% above the open-carrier rate for the same route. The gap comes from lower capacity per trailer and higher insurance costs." },
      { q: "Is enclosed faster than open?", a: "Transit time is about the same — the protection is what you're paying for, not speed. If timing is the priority, ask about expedited service instead." },
      { q: "Can inoperable vehicles ship enclosed?", a: "Yes. Enclosed carriers with a winch or lift-gate are usually the best option for a non-running project car; tell your coordinator how the vehicle moves when booking." },
    ],
  },
  {
    slug: "door-to-door-shipping",
    name: "Door-to-Door Shipping",
    navLabel: "Door-to-Door Shipping",
    eyebrow: "Default on every quote",
    h1: "Door-to-door shipment and delivery, included",
    lede: "The carrier comes to you and delivers as close to your door as the street legally and safely allows — no terminal drop-offs, no second trip to collect your car.",
    checklist: ["Pickup at your address", "Delivery at your address", "No terminal fees"],
    priceFactor: 1,
    transitFactor: 1,
    why: [
      { title: "No terminal detour", body: "You don't drive to a depot, wait in line, or arrange a ride home — the trailer meets you where the vehicle already is." },
      { title: "Fewer hands on your car", body: "Terminal shipping means extra loading and unloading between yards. Door-to-door keeps handling to pickup and delivery." },
      { title: "You pick the window", body: "Your coordinator arranges a pickup window that fits your schedule and calls ahead before delivery." },
    ],
    how: [
      { title: "Give us both addresses", body: "Quote with your pickup and delivery ZIP codes — no terminal lookup needed." },
      { title: "Confirm your window", body: "The carrier contacts you to lock in a pickup time that works." },
      { title: "Loaded at the curb", body: "If a full-size trailer can't reach the street, the driver meets you at a nearby lot." },
      { title: "Delivered to you", body: "Inspect against the Bill of Lading at your address and sign off." },
    ],
    bestFor: [
      { title: "Household moves", body: "Relocations where you're already juggling movers and flights." },
      { title: "Rural addresses", body: "Places where the nearest terminal is hours away." },
      { title: "Anyone short on time", body: "Skipping two terminal trips usually saves most of a day." },
    ],
    faqs: [
      { q: "What if the truck can't fit on my street?", a: "Full-size carriers are around 75 feet long, so narrow streets, low branches, and tight cul-de-sacs sometimes don't work. The driver will arrange to meet you at a nearby wide street or parking lot — usually within a few minutes' drive." },
      { q: "Does door-to-door cost extra?", a: "No. Door-to-door is how our quotes are priced by default; you'd only see a different structure if you specifically requested terminal-to-terminal." },
      { q: "Do I have to be there in person?", a: "Someone does need to hand over keys and sign the Bill of Lading at both ends, but it doesn't have to be you — any adult you designate can release and receive the vehicle." },
    ],
  },
  {
    slug: "terminal-to-terminal-shipping",
    name: "Terminal-to-Terminal Shipping",
    navLabel: "Terminal-to-Terminal Shipping",
    eyebrow: "Budget option",
    h1: "Terminal-to-terminal shipping when you want the lowest rate",
    lede: "Drop your vehicle at a regional terminal and collect it from another. You handle the first and last mile; in exchange the line-haul is cheaper and pickup timing is more flexible.",
    checklist: ["Lower line-haul cost", "Flexible drop-off timing", "Secured storage yards"],
    priceFactor: 0.9,
    transitFactor: 1.15,
    why: [
      { title: "Cheaper than door-to-door", body: "Carriers save time when they load a full trailer at one yard instead of driving to a dozen separate addresses, and that saving comes back in the rate." },
      { title: "Drop off on your own schedule", body: "Terminals accept vehicles during business hours across a range of days, so you're not waiting on a driver's arrival window." },
      { title: "Good for tight streets", body: "If a 75-foot carrier can't reach your address at all, a terminal removes the problem entirely." },
    ],
    how: [
      { title: "Get your quote", body: "We confirm which terminals serve your origin and destination." },
      { title: "Drop off your vehicle", body: "Bring it to the origin terminal during their receiving hours." },
      { title: "Line-haul transit", body: "Your car moves once the trailer heading your direction is loaded." },
      { title: "Collect at destination", body: "Pick up from the destination terminal and inspect before signing off." },
    ],
    bestFor: [
      { title: "Budget-driven moves", body: "When you'd rather do the driving than pay for the convenience." },
      { title: "Dense urban addresses", body: "City blocks where a full carrier genuinely cannot get through." },
      { title: "Flexible timelines", body: "Shipments where waiting for the trailer to fill is fine." },
    ],
    faqs: [
      { q: "How much cheaper is terminal-to-terminal?", a: "Typically around 10% below the door-to-door rate for the same route — though once you factor in your own driving time and fuel to both terminals, the real-world saving is often smaller than it looks." },
      { q: "Is there a storage fee?", a: "Most terminals include a few days of free storage. Beyond that they charge a daily rate, so it's worth collecting your vehicle promptly after it arrives." },
      { q: "Are terminals secure?", a: "Terminals are fenced, monitored commercial yards. Your vehicle is still covered by the carrier's cargo insurance while it's in transit." },
    ],
  },
  {
    slug: "expedited-car-shipping",
    name: "Expedited / Express Shipping",
    navLabel: "Expedited / Express Shipping",
    eyebrow: "Fastest pickup",
    h1: "Expedited car shipping when the date won't move",
    lede: "Priority dispatch puts your vehicle at the front of the queue — pickup typically inside 24 to 48 hours, with a tighter delivery window than standard service.",
    checklist: ["Pickup in 24–48 hours", "Priority carrier match", "Open or enclosed"],
    priceFactor: 1.2,
    transitFactor: 0.75,
    why: [
      { title: "Front of the dispatch queue", body: "Your shipment is offered at a premium rate, which gets it picked up by the first suitable carrier rather than the cheapest one." },
      { title: "Shorter, firmer windows", body: "Fewer stops and a tighter route plan mean the delivery estimate you're given holds up better." },
      { title: "Works with either trailer", body: "Expedited is a dispatch priority, not a trailer type — you can pair it with open or enclosed transport." },
    ],
    how: [
      { title: "Flag the deadline", body: "Tell your coordinator the date you actually need the vehicle by." },
      { title: "Priority dispatch", body: "We post at a premium rate to secure the fastest available carrier." },
      { title: "Fast pickup", body: "Most expedited shipments are collected within 24–48 hours of booking." },
      { title: "Direct-route delivery", body: "Fewer intermediate stops means a shorter, more predictable transit." },
    ],
    bestFor: [
      { title: "Job relocations", body: "Start dates that were set before the car was arranged." },
      { title: "Vehicle sales", body: "Buyer deadlines, auction settlement windows, and dealer trades." },
      { title: "Emergencies", body: "Family situations and military orders that can't wait on standard dispatch." },
    ],
    faqs: [
      { q: "What does expedited add to the price?", a: "Budget roughly 20% above the standard rate for the same route. The premium is what motivates a carrier to reshuffle their existing load plan for your vehicle." },
      { q: "Is a delivery date guaranteed?", a: "Expedited buys you priority dispatch and a tighter window, not a contractual guarantee — weather, traffic, and DOT hours-of-service limits still apply. Your coordinator will tell you honestly what's realistic for your route." },
      { q: "Can I expedite an enclosed shipment?", a: "Yes. Expedited and enclosed stack; the quote reflects both." },
    ],
  },
  {
    slug: "motorcycle-shipping",
    name: "Motorcycle Shipping",
    navLabel: "Motorcycle Shipping",
    eyebrow: "Two-wheel transport",
    h1: "Motorcycle shipping with equipment built for bikes",
    lede: "Bikes ship on wheel chocks and soft straps, crated or in an enclosed trailer — never strapped down by the frame or the handlebars.",
    checklist: ["Wheel chocks & soft straps", "Enclosed option available", "Cruisers to sport bikes"],
    priceFactor: 0.7,
    transitFactor: 1,
    why: [
      { title: "Bike-specific tie-downs", body: "Chocks hold the front wheel and soft straps run over the suspension, so nothing loads against the frame, forks, or bars." },
      { title: "Enclosed is the norm", body: "Most motorcycle shipments run enclosed, which keeps chrome, paint, and leather out of the weather." },
      { title: "Cheaper than a car", body: "A bike takes a fraction of the deck space, so the rate lands well below a passenger vehicle on the same route." },
    ],
    how: [
      { title: "Quote your bike", body: "Give us year, make, model, and both ZIP codes." },
      { title: "Prep for pickup", body: "Fuel down to about a quarter tank, fold the mirrors, and remove loose luggage." },
      { title: "Chocked and strapped", body: "The driver secures the bike upright and records its condition." },
      { title: "Delivered and inspected", body: "Check it over against the Bill of Lading before signing off." },
    ],
    bestFor: [
      { title: "Cross-country rides", body: "Getting the bike there without adding thousands of miles to it." },
      { title: "Rally & track season", body: "Moving a bike to an event and back." },
      { title: "Sales & purchases", body: "Bikes bought online that need to reach a new owner." },
    ],
    faqs: [
      { q: "Do you ship non-running motorcycles?", a: "Yes — a bike that doesn't start can still be rolled and chocked. If it won't roll at all, mention that when booking so a carrier with the right equipment is matched." },
      { q: "Should I crate my motorcycle?", a: "Not necessary. Carriers that handle bikes have chocks and soft straps designed for the job; crating is normally only used for international freight." },
      { q: "How much does motorcycle shipping cost?", a: "Typically around 30% less than a car on the same route, since a bike uses much less deck space." },
    ],
  },
  {
    slug: "student-car-shipping",
    name: "Student Car Shipping",
    navLabel: "Student Car Shipping",
    eyebrow: "Student discount",
    h1: "Student car shipping between home and campus",
    lede: "Get your car to school without driving it there — and without paying full freight. Semester-timed pickup windows and a student discount on every quote.",
    checklist: ["Student discount", "Semester-timed pickup", "Dorm-area delivery"],
    priceFactor: 0.92,
    transitFactor: 1,
    why: [
      { title: "A discount that actually applies", body: "Show a valid student ID or enrollment letter and the discount comes off the quote — no promo-code hunting." },
      { title: "Booked around the calendar", body: "Move-in and finals weeks are the busiest shipping windows of the year; booking early is what keeps the rate down." },
      { title: "Delivered near campus", body: "If the carrier can't get into campus itself, the driver meets you at a nearby lot within a short walk or drive." },
    ],
    how: [
      { title: "Quote with your dates", body: "Tell us your move-in or move-out week and both ZIP codes." },
      { title: "Verify enrollment", body: "Send a student ID or enrollment letter to apply the discount." },
      { title: "Pickup at home", body: "The carrier collects from your home address before you fly out." },
      { title: "Collect near campus", body: "Meet the driver at the agreed spot, inspect, and sign off." },
    ],
    bestFor: [
      { title: "Out-of-state students", body: "Schools far enough that driving there isn't worth the miles." },
      { title: "First-year move-in", body: "Flying in for orientation with the car arriving separately." },
      { title: "Summer & semester breaks", body: "Round trips home that repeat every year." },
    ],
    faqs: [
      { q: "What proof do you need for the student discount?", a: "A current student ID or an enrollment/acceptance letter with your name and the school on it is enough. Send it to your coordinator and the discount is applied before you pay anything." },
      { q: "When should I book for move-in week?", a: "Three to four weeks out. Late August and early September are the highest-demand weeks of the year on most college routes, and prices climb as pickup dates get closer." },
      { q: "Can the car be delivered to my dorm?", a: "As close as the street allows. Many campuses restrict large trucks, so the driver will usually meet you at an adjacent lot or nearby street instead." },
    ],
  },
  {
    slug: "military-car-shipping",
    name: "Military Car Shipping",
    navLabel: "Military Car Shipping",
    eyebrow: "Military & veteran discount",
    h1: "Military car shipping built around PCS orders",
    lede: "PCS and deployment moves on short notice, with a military discount and coordinators who understand report dates and base access rules.",
    checklist: ["Military & veteran discount", "PCS-timed scheduling", "Base-area pickup & delivery"],
    priceFactor: 0.9,
    transitFactor: 1,
    why: [
      { title: "Discount for service members", body: "Active duty, reserve, and veteran discounts apply with a military ID or DD-214." },
      { title: "Scheduled to your orders", body: "Tell us the report date and we work the pickup window backwards from it, including short-notice PCS." },
      { title: "Base access handled", body: "Carriers generally can't drive onto an installation, so pickup and delivery are arranged just outside the gate or at an agreed nearby lot." },
    ],
    how: [
      { title: "Share your dates", body: "Give us your report date and both duty-station ZIP codes." },
      { title: "Verify service", body: "A military ID or DD-214 applies the discount to your quote." },
      { title: "Pickup near the gate", body: "The carrier meets you off-installation to load." },
      { title: "Delivered on station", body: "Collect near your new duty station, inspect, and sign off." },
    ],
    bestFor: [
      { title: "PCS moves", body: "Permanent change of station on a fixed report date." },
      { title: "Deployment", body: "Getting a vehicle home or into storage before you ship out." },
      { title: "Separation & retirement", body: "Final moves back to a home of record." },
    ],
    faqs: [
      { q: "How does the military discount work?", a: "Send your coordinator a military ID or DD-214 and the discount is applied to the quote before you pay anything. It stacks with multi-vehicle pricing if you're shipping more than one car." },
      { q: "Can you ship on short-notice PCS orders?", a: "Yes. Short-notice moves are usually dispatched as expedited so the vehicle is collected within a day or two, which does carry a premium — your coordinator will lay out the options against your report date." },
      { q: "Can the carrier come onto the installation?", a: "Almost never — commercial carriers don't have base access. Pickup and delivery are arranged just outside the gate or at a nearby lot you agree on with the driver." },
    ],
  },
];

export const SERVICE_BY_SLUG = Object.fromEntries(SERVICES.map((s) => [s.slug, s]));

// Nav entries for the header's Services dropdown.
export const SERVICE_NAV = SERVICES.map((s) => ({ label: s.navLabel, href: `/services/${s.slug}` }));
