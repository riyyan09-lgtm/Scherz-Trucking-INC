// Shared with both the server-side PDF filler (lib/pdfInvoice.js) and the
// admin visual field mapper (client component) — kept in its own file so the
// client bundle doesn't have to pull in pdf-lib just for this list.
//
// Grouped for the mapper's variable palette. The broker/company/agent group
// is Scherz Trucking INC-specific (pre-existing); the rest matches the shipping-order
// field set most carrier invoice templates use (customer, pickup/dropoff,
// vehicle, order, and payment info).
// Box size used when a field is placed with a plain click (no drag) in the
// mapper, and the fallback size for any field saved before box-drawing
// existed. Both InvoiceFieldMapper.js's preview and lib/pdfInvoice.js's fill
// logic import this so they can never drift apart. Kept narrow enough to
// fit inside a typical table cell (e.g. a 6-column vehicle table) without
// a click-placed field automatically overlapping its neighbor — drag to
// draw a wider box for fields that need more room.
export const DEFAULT_BOX = { w: 0.14, h: 0.02 };

export const INVOICE_TOKENS = [
  // Customer
  { key: "customer_name", label: "Customer name", group: "Customer" },
  { key: "customer_phone", label: "Customer phone", group: "Customer" },
  { key: "customer_email", label: "Customer email", group: "Customer" },
  { key: "customer_signature", label: "Customer signature", group: "Customer" },
  // Pickup
  { key: "pickup_contact", label: "Pickup contact", group: "Pickup" },
  { key: "pickup_phone", label: "Pickup phone", group: "Pickup" },
  { key: "pickup_address", label: "Pickup address", group: "Pickup" },
  // Dropoff
  { key: "dropoff_contact", label: "Dropoff contact", group: "Dropoff" },
  { key: "dropoff_phone", label: "Dropoff phone", group: "Dropoff" },
  { key: "dropoff_address", label: "Dropoff address", group: "Dropoff" },
  // Shipment
  { key: "trailer_type", label: "Trailer type", group: "Shipment" },
  { key: "shipping_method", label: "Shipping method", group: "Shipment" },
  { key: "load_date", label: "Load date", group: "Shipment" },
  { key: "delivery_date", label: "Delivery date", group: "Shipment" },
  // Vehicle
  { key: "vehicle_year", label: "Vehicle year", group: "Vehicle" },
  { key: "vehicle_make", label: "Vehicle make", group: "Vehicle" },
  { key: "vehicle_model", label: "Vehicle model", group: "Vehicle" },
  { key: "vehicle_type", label: "Vehicle type", group: "Vehicle" },
  { key: "vehicle_running", label: "Vehicle running", group: "Vehicle" },
  { key: "vehicle_condition", label: "Vehicle condition", group: "Vehicle" },
  // Order / payment
  { key: "order_number", label: "Order #", group: "Order" },
  { key: "order_date", label: "Order date", group: "Order" },
  { key: "invoice_date", label: "Invoice date", group: "Order" },
  { key: "invoice_total", label: "Invoice total", group: "Order" },
  { key: "deposit_due", label: "Deposit due", group: "Order" },
  { key: "balance_due", label: "Balance due", group: "Order" },
  // Scherz Trucking INC broker fields (kept for tenants already using them)
  { key: "company_name", label: "Company name", group: "Broker" },
  { key: "agent_name", label: "Agent name", group: "Broker" },
  { key: "agent_phone", label: "Agent phone", group: "Broker" },
  { key: "order_id", label: "Order # (legacy)", group: "Broker" },
  { key: "origin", label: "Origin (city/state/zip)", group: "Broker" },
  { key: "destination", label: "Destination (city/state/zip)", group: "Broker" },
  { key: "vehicle", label: "Vehicle (summary)", group: "Broker" },
  { key: "pickup_date", label: "Pickup date (legacy)", group: "Broker" },
  { key: "total_amount", label: "Total amount (legacy)", group: "Broker" },
  { key: "broker_fee", label: "Broker fee", group: "Broker" },
  { key: "amount_paid", label: "Amount paid (broker-collected)", group: "Broker" },
  { key: "broker_due", label: "Broker due", group: "Broker" },
  { key: "payment_status", label: "Broker payment status", group: "Broker" },
];
