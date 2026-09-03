"use client";

import { useEffect, useState } from "react";
import { agreementTerms } from "../../../lib/agreementTerms";
import "./book.css";

// Customer-facing booking + e-signature flow. The URL token is the only auth.
// Presented as a multi-step wizard (eDoc-style): review details, enter exact
// addresses + contacts, read the full transport agreement, then sign.

function vehicleLine(v) {
  return [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
}

const STEPS = ["Review", "Addresses", "Agreement", "Sign"];

export default function BookingForm({ token }) {
  const [state, setState] = useState("loading"); // loading | ready | signed | error | done
  const [booking, setBooking] = useState(null);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ origin_address: "", destination_address: "", pickup_contact: "", pickup_phone: "", delivery_contact: "", delivery_phone: "", signed_name: "", agreed: false });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/book/${token}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) { setErr(data.error); setState("error"); return; }
        setBooking(data.booking);
        if (data.booking.signed_at && !data.booking.change_order) { setState("signed"); return; }
        setForm((f) => ({
          ...f,
          origin_address: data.booking.origin_address || "",
          destination_address: data.booking.destination_address || "",
          pickup_contact: data.booking.pickup_contact || "",
          pickup_phone: data.booking.pickup_phone || "",
          delivery_contact: data.booking.delivery_contact || "",
          delivery_phone: data.booking.delivery_phone || "",
        }));
        setState("ready");
      } catch {
        setErr("Could not load your booking. Please try again.");
        setState("error");
      }
    })();
  }, [token]);

  function next() {
    setErr(null);
    if (step === 1) {
      if (form.origin_address.trim().length < 6 || form.destination_address.trim().length < 6) {
        setErr("Enter complete pickup and drop-off addresses to continue.");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() { setErr(null); setStep((s) => Math.max(s - 1, 0)); }

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (form.signed_name.trim().length < 2 || !form.agreed) {
      setErr("Type your full legal name and accept the agreement to sign.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/book/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit.");
      setState("done");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "loading") return <div className="bk"><div className="bk-card"><p>Loading your booking…</p></div></div>;
  if (state === "error") return <div className="bk"><div className="bk-card"><h1>Something went wrong</h1><p className="bk-err">{err}</p></div></div>;

  if (state === "done" || state === "signed") {
    return (
      <div className="bk">
        <div className="bk-card bk-done">
          <div className="bk-check">✓</div>
          <h1>You&apos;re all set{booking?.name ? `, ${booking.name.split(" ")[0]}` : ""}</h1>
          <p>Your transport agreement is signed and your shipment is confirmed. {booking?.company} will be in touch with pickup details.</p>
          <a className="bk-doc-link" href={`/agreement/${token}`} target="_blank" rel="noopener noreferrer">View &amp; download your agreement / invoice →</a>
        </div>
      </div>
    );
  }

  const price = booking.total_tariff != null ? `$${Number(booking.total_tariff).toLocaleString()}` : "Quoted separately";

  return (
    <div className="bk">
      <div className="bk-head">
        <div className="bk-logo"><span className="dot" />{booking.company}</div>
        <span className="bk-secure">Secure booking</span>
      </div>

      <div className="bk-card">
        {booking.change_order && (
          <div className="bk-change">Your order was updated — please review the revised details and re-sign this change order.</div>
        )}

        {/* Step progress */}
        <div className="bk-steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`bk-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}>
              <span className="bk-step-num">{i < step ? "✓" : i + 1}</span>
              <span className="bk-step-lbl">{label}</span>
            </div>
          ))}
        </div>

        {/* STEP 1 — Review shipment */}
        {step === 0 && (
          <div className="bk-pane">
            <h1>{booking.change_order ? "Review your updated shipment" : "Review your shipment"}</h1>
            <p className="bk-sub">Confirm these details are correct before you continue.</p>
            <div className="bk-summary">
              <div><span>Route</span><b>{booking.origin || "—"} → {booking.destination || "—"}</b></div>
              {booking.vehicles.length > 0 ? (
                <div className="bk-veh-rows">
                  <span>Vehicle(s)</span>
                  {booking.vehicles.map((v, i) => (
                    <b key={i}>{vehicleLine(v)}</b>
                  ))}
                </div>
              ) : <div><span>Vehicle(s)</span><b>—</b></div>}
              {booking.broker_fee != null && (
                <div><span>First payment</span><b className="bk-price">${Number(booking.broker_fee).toLocaleString()}</b></div>
              )}
              {booking.pickup_date && <div><span>Requested pickup</span><b>{String(booking.pickup_date).slice(0, 10)}</b></div>}
              <div><span>Transport</span><b>{booking.transport_type || "Open"}</b></div>
              <div><span>Total price</span><b className="bk-price">{price}</b></div>
            </div>
            <div className="bk-nav">
              <span />
              <button type="button" onClick={next}>Continue →</button>
            </div>
          </div>
        )}

        {/* STEP 2 — Addresses & contacts */}
        {step === 1 && (
          <div className="bk-pane">
            <h1>Pickup &amp; drop-off</h1>
            <p className="bk-sub">Give us the exact addresses and the people we&apos;ll coordinate with.</p>

            <label className="bk-label">Exact pickup address</label>
            <textarea rows={2}
              placeholder={`Street, city, ${booking.origin || "state"} ${booking.origin_zip || "ZIP"}`}
              value={form.origin_address}
              onChange={(e) => setForm({ ...form, origin_address: e.target.value })}
            />
            <div className="bk-2col">
              <div>
                <label className="bk-label">Pickup contact name</label>
                <input className="bk-sign" placeholder="Who releases the vehicle" value={form.pickup_contact} onChange={(e) => setForm({ ...form, pickup_contact: e.target.value })} />
              </div>
              <div>
                <label className="bk-label">Pickup contact phone</label>
                <input className="bk-sign" type="tel" placeholder="(555) 555-5555" value={form.pickup_phone} onChange={(e) => setForm({ ...form, pickup_phone: e.target.value })} />
              </div>
            </div>

            <label className="bk-label">Exact drop-off address</label>
            <textarea rows={2}
              placeholder={`Street, city, ${booking.destination || "state"} ${booking.destination_zip || "ZIP"}`}
              value={form.destination_address}
              onChange={(e) => setForm({ ...form, destination_address: e.target.value })}
            />
            <div className="bk-2col">
              <div>
                <label className="bk-label">Drop-off contact name</label>
                <input className="bk-sign" placeholder="Who receives the vehicle" value={form.delivery_contact} onChange={(e) => setForm({ ...form, delivery_contact: e.target.value })} />
              </div>
              <div>
                <label className="bk-label">Drop-off contact phone</label>
                <input className="bk-sign" type="tel" placeholder="(555) 555-5555" value={form.delivery_phone} onChange={(e) => setForm({ ...form, delivery_phone: e.target.value })} />
              </div>
            </div>

            {err && <p className="bk-err">{err}</p>}
            <div className="bk-nav">
              <button type="button" className="bk-ghost" onClick={back}>← Back</button>
              <button type="button" onClick={next}>Continue →</button>
            </div>
          </div>
        )}

        {/* STEP 3 — Full agreement to review */}
        {step === 2 && (
          <div className="bk-pane">
            <h1>Transport agreement</h1>
            <p className="bk-sub">Please read the full agreement below before signing.</p>
            <div className="bk-contract">
              <h2>Vehicle Transport Service Agreement</h2>
              <p>This Agreement is entered into between <b>{booking.company}</b> (&quot;Broker&quot;) and the customer named below (&quot;Customer&quot;) for the arrangement of motor vehicle transport.</p>

              <h3>1. Shipment</h3>
              <ul>
                {booking.vehicles.length > 0 ? (
                  <li><b>Vehicle(s):</b> {booking.vehicles.map(vehicleLine).join(", ")}</li>
                ) : <li><b>Vehicle(s):</b> —</li>}
                <li><b>Route:</b> {booking.origin || "—"} → {booking.destination || "—"}</li>
                <li><b>Pickup address:</b> {form.origin_address || "—"}</li>
                <li><b>Drop-off address:</b> {form.destination_address || "—"}</li>
                {form.pickup_contact && <li><b>Pickup contact:</b> {form.pickup_contact}{form.pickup_phone ? ` · ${form.pickup_phone}` : ""}</li>}
                {form.delivery_contact && <li><b>Drop-off contact:</b> {form.delivery_contact}{form.delivery_phone ? ` · ${form.delivery_phone}` : ""}</li>}
                {booking.pickup_date && <li><b>Requested pickup date:</b> {String(booking.pickup_date).slice(0, 10)}</li>}
                <li><b>Transport type:</b> {booking.transport_type || "Open"}</li>
                <li><b>Total price:</b> {price}</li>
              </ul>

              <h3>Terms &amp; Conditions</h3>
              <ol className="bk-terms">
                {agreementTerms(booking.company).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>

              <h3>Electronic Signature</h3>
              <p>By typing their name and accepting on the next step, Customer agrees this constitutes a legally binding electronic signature under the E-SIGN Act, and consents to the recording of the date, time, and IP address of signing.</p>
            </div>
            <div className="bk-nav">
              <button type="button" className="bk-ghost" onClick={back}>← Back</button>
              <button type="button" onClick={next}>I&apos;ve read it — continue →</button>
            </div>
          </div>
        )}

        {/* STEP 4 — Sign */}
        {step === 3 && (
          <form className="bk-pane" onSubmit={submit}>
            <h1>Sign &amp; confirm</h1>
            <p className="bk-sub">Type your full legal name to sign the transport agreement.</p>

            <label className="bk-label">Type your full name to sign</label>
            <input required className="bk-sign" placeholder="Your full legal name"
              value={form.signed_name} onChange={(e) => setForm({ ...form, signed_name: e.target.value })} />
            {form.signed_name && <div className="bk-signature">{form.signed_name}</div>}

            <label className="bk-check-row">
              <input type="checkbox" checked={form.agreed} onChange={(e) => setForm({ ...form, agreed: e.target.checked })} />
              I have read and agree to the transport agreement.
            </label>

            {err && <p className="bk-err">{err}</p>}
            <div className="bk-nav">
              <button type="button" className="bk-ghost" onClick={back}>← Back</button>
              <button type="submit" disabled={submitting}>{submitting ? "Confirming…" : "Sign & confirm booking"}</button>
            </div>
            <p className="bk-fine">Your electronic signature is legally binding. We record the date, time, and IP address of signing.</p>
          </form>
        )}
      </div>
    </div>
  );
}
