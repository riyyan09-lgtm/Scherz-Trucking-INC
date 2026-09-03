// Single source of truth for the transport agreement terms & conditions.
// Used by both the CRM-generated agreement/invoice (app/agreement/[token]/page.js)
// and the customer booking flow (app/book/[token]/BookingForm.js) so the
// document a customer signs is identical to the one the CRM produces.
// {broker} is replaced with the tenant/company name at render time.

export function agreementTerms(broker) {
  const b = broker || "the Broker";
  return [
    `${b} is a licensed transportation broker arranging vehicle transport with licensed, insured motor carriers; it is not the carrier and does not itself transport vehicles.`,
    `Customer authorizes ${b} to arrange transport of the vehicle(s) described in this Agreement between the pickup and delivery addresses provided, assigning a licensed and insured motor carrier from its network.`,
    `While estimated pickup and delivery dates and prices are provided, specific dates cannot be guaranteed due to factors such as carrier availability, weather, or mechanical issues. ${b} is not responsible for costs caused by delays, including rental cars, hotels, or airline tickets. The carrier's pickup and delivery schedule is shared once the vehicle is dispatched.`,
    `During the shipping period, the customer agrees not to work with other brokers or carriers. If the customer is found booking with another company, the deposit paid to ${b} is non-refundable.`,
    `Carriers provide door-to-door service when road conditions allow. If pickup or delivery is inaccessible due to narrow streets, low trees, residential restrictions, or safety concerns, the driver may request a nearby meeting point (e.g., shopping center or large parking lot).`,
    `Carriers are not licensed to transport household or personal items. Personal belongings must be in the trunk and not exceed 200 lbs (unless prior approval is given). The carrier is not responsible for loss or damage to personal items. Excessive or undisclosed items may result in additional charges or cancellation. If the vehicle is not ready at pickup, a $150 dry run fee and/or a $75 rescheduling fee may apply.`,
    `The carrier is not responsible for damage caused by leaking fluids, freezing conditions, exhaust issues, loose parts, or pre-existing mechanical problems. All damages must be clearly noted on the Bill of Lading (BOL) at delivery.`,
    `Carriers maintain cargo insurance ranging from $100,000 to $1M, plus public liability insurance. ${b} assists with providing insurance information but is not responsible for claims. All damage claims must be noted on the delivery inspection report and submitted in writing within 15 days.`,
    `If the vehicle is not ready or the shipper is not available, a $75 rescheduling fee applies. If the vehicle is unavailable at dispatch, the deposit will not be refunded. The shipper must assign an alternate representative if unavailable.`,
    `The customer must never release the vehicle without a signed inspection report (BOL). Any damage must be documented on the BOL. Failure to note damage releases the carrier from liability. Damage must be reported to ${b} within 24 hours of delivery.`,
    `A $150 non-operational fee applies to vehicles that do not run under their own power. This fee is added to the final price.`,
    `Cancellations within 7 days of the scheduled pickup incur a $200 cancellation fee. ${b} is not responsible for rental vehicles, breakdowns, or mechanical failures. The shipper agrees to pay the full quoted price upon delivery and agrees not to dispute charges or file chargebacks.`,
    `Reservations can be paid via Credit/Debit Card, Zelle, or CashApp. The remaining balance is due at delivery and must be paid directly to the carrier via cash, cashier's check, or money order.`,
    `This Agreement is governed by the laws of the State of Texas. Legal action must be filed in a court within Texas. ${b}'s liability is limited strictly to the broker fee paid.`,
    `All deposits are final and non-refundable under any circumstances once a carrier has been picked up.`,
    `Quotes are based on current market conditions. Prices may change due to fuel price changes, driver shortages, weather conditions, or route demand. If a new price is required, the customer will be notified before the carrier is assigned.`,
  ];
}
