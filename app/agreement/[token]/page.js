import { getPool } from "../../../lib/db";
import PrintButton from "./PrintButton";
import { agreementTerms } from "../../../lib/agreementTerms";
import "./agreement.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: { absolute: "Transport Agreement" },
  robots: { index: false, follow: false },
};

function money(n) {
  return n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}
function vehicles(l) {
  if (Array.isArray(l.vehicles) && l.vehicles.length) return l.vehicles;
  if (l.vehicle_year || l.vehicle_make || l.vehicle_model)
    return [{ year: l.vehicle_year, make: l.vehicle_make, model: l.vehicle_model }];
  return [];
}

async function getDoc(token) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select l.*, t.company_name, t.company_address, t.contact_phone as company_phone
       from leads l join tenants t on l.tenant_id = t.id
       where l.booking_token = $1 limit 1`,
      [token]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

export default async function AgreementPage({ params }) {
  const l = await getDoc(params.token);
  if (!l) {
    return <div className="ag-wrap"><div className="ag-doc"><p>This document link is invalid or expired.</p></div></div>;
  }

  const tariff = l.total_tariff != null ? Number(l.total_tariff) : null;
  const carrierPay = l.carrier_pay != null ? Number(l.carrier_pay) : null;
  const brokerFee = tariff != null && carrierPay != null ? tariff - carrierPay : null;
  const signedDate = l.signed_at
    ? new Date(l.signed_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div className="ag-wrap">
      <PrintButton />
      <div className="ag-doc">
        <header className="ag-head">
          <div>
            <div className="ag-company">{l.company_name}</div>
            {l.company_address && <div className="ag-addr">{l.company_address}</div>}
            {l.company_phone && <div className="ag-addr">{l.company_phone}</div>}
          </div>
          <div className="ag-order">
            <div className="ag-order-no">ORDER #{String(l.reference_id || l.id).toString().padStart(6, "0")}</div>
            <div className="ag-badge">{l.signed_at ? "Signed" : "Unsigned"}</div>
          </div>
        </header>

        <section className="ag-two">
          <div>
            <h2>Customer</h2>
            <div className="ag-kv"><span>Name</span><b>{l.name}</b></div>
            <div className="ag-kv"><span>Phone</span><b>{l.phone}</b></div>
            <div className="ag-kv"><span>Email</span><b>{l.email || "—"}</b></div>
            <div className="ag-kv"><span>Order date</span><b>{new Date(l.created_at).toLocaleDateString("en-US")}</b></div>
          </div>
          <div>
            <h2>Price and payment</h2>
            <div className="ag-kv"><span>Total tariff</span><b>{money(tariff)}</b></div>
            <div className="ag-kv"><span>Deposit / broker fee</span><b>{money(brokerFee)}</b></div>
            <div className="ag-kv"><span>Due to carrier (COD)</span><b>{money(carrierPay)}</b></div>
            <div className="ag-kv"><span>Deposit due</span><b>On order placement</b></div>
            {l.carrier_pay_terms && <div className="ag-kv"><span>Carrier pay terms</span><b>{l.carrier_pay_terms}</b></div>}
          </div>
        </section>

        <section>
          <h2>Shipment details</h2>
          <div className="ag-kv"><span>Transport type</span><b>{l.transport_type || "Open"}</b></div>
          <div className="ag-kv"><span>First available pickup</span><b>{l.pickup_date ? String(l.pickup_date).slice(0, 10) : "—"}</b></div>
          <div className="ag-kv"><span>Pickup address</span><b>{l.origin_address || [l.origin_city, l.origin_state, l.origin_zip].filter(Boolean).join(", ")}</b></div>
          <div className="ag-kv"><span>Delivery address</span><b>{l.destination_address || [l.destination_city, l.destination_state, l.destination_zip].filter(Boolean).join(", ")}</b></div>
          <div className="ag-kv"><span>Vehicles</span><b>{vehicles(l).map((v) => [v.year, v.make, v.model].filter(Boolean).join(" ") + (v.inoperable ? ` (inoperable${v.condition ? ` — ${v.condition}` : ""})` : "")).join(", ") || "—"}</b></div>
          {l.special_terms && <div className="ag-kv"><span>Special terms</span><b>{l.special_terms}</b></div>}
        </section>

        {l.signed_at && (
          <section className="ag-sig">
            <h2>Digital signature certificate</h2>
            <p className="ag-sig-note">
              By entering their full name as a binding electronic signature, the customer acknowledged that an
              electronic signature has the same legal effect as a written signature and accepted the terms and
              conditions below.
            </p>
            <div className="ag-kv"><span>Electronic signature</span><b className="ag-signature">{l.signed_name}</b></div>
            <div className="ag-kv"><span>Signature IP address</span><b>{l.signed_ip || "—"}</b></div>
            <div className="ag-kv"><span>Signed and accepted on</span><b>{signedDate}</b></div>
          </section>
        )}

        <section className="ag-terms">
          <h2>Terms and conditions</h2>
          <ol>
            {agreementTerms(l.company_name).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </section>

        <footer className="ag-foot">
          Document generated by {l.company_name}. This is the customer&apos;s copy of the signed transport agreement and invoice.
        </footer>
      </div>
    </div>
  );
}
