"use client";

import { useState } from "react";

const EMPTY = { name: "", company: "", phone: "", email: "", message: "" };

function isValidPhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

// "Request a business account" form for the 3 B2B pages — volume pricing /
// invoice terms inquiry, not a single-vehicle quote (that's CityQuoteForm).
export default function BusinessInquiryForm({ segment }) {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [phoneError, setPhoneError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValidPhone(form.phone)) {
      setPhoneError("That phone number doesn't look right — use 10 digits, e.g. (555) 123-4567");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/business-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment, ...form }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)", padding: 18, borderRadius: 16, fontWeight: 600, textAlign: "center" }}>
        Thanks — a coordinator will reach out about your business account shortly.
      </div>
    );
  }

  return (
    <form className="card elev-lg" style={{ background: "var(--color-neutral-100)", padding: "clamp(20px,3vw,28px)", gap: 14 }} onSubmit={handleSubmit}>
      <h3 style={{ fontSize: 20, marginBottom: 2 }}>Request a business account</h3>
      <p style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", margin: "-4px 0 4px" }}>Volume pricing, invoice terms, and a dedicated coordinator.</p>

      <div className="field"><label>Full name</label><input required className="input" placeholder="Jane Rivera" autoComplete="name" value={form.name} onChange={set("name")} /></div>
      <div className="field"><label>Company</label><input className="input" placeholder="Company name" autoComplete="organization" value={form.company} onChange={set("company")} /></div>
      <div className="field">
        <label>Phone number</label>
        <input
          required
          type="tel"
          className="input"
          placeholder="(555) 123-4567"
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => { set("phone")(e); if (phoneError) setPhoneError(null); }}
        />
      </div>
      {phoneError && <div className="og-hint warn">{phoneError}</div>}
      <div className="field"><label>Email (optional)</label><input type="email" className="input" placeholder="jane@example.com" autoComplete="email" value={form.email} onChange={set("email")} /></div>
      <div className="field"><label>What do you need shipped? <em>(optional)</em></label>
        <textarea className="input" rows={3} placeholder="Volume, typical routes, timeline…" value={form.message} onChange={set("message")} />
      </div>

      <button type="submit" className="btn btn-primary btn-block" style={{ fontSize: 15, padding: 13 }} disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting..." : "Request a Business Account"}
      </button>
      {status === "error" && <p style={{ color: "var(--color-accent-700)", fontSize: 13 }}>Something went wrong — please try again.</p>}
    </form>
  );
}
