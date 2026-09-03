"use client";

// Same form/validation/submission logic as QuoteForm.js (ZIP lookup, NHTSA
// model lookup, email-typo suggestions, ad attribution, GA4/Meta conversion
// firing) — kept as a separate file rather than a themed variant of
// QuoteForm because this one is restyled to the "Organic" design system
// (app/organic.css), and QuoteForm.js is still used as-is on the homepage
// and the cost calculator, which haven't been redesigned. If those get the
// same redesign later, these two should merge back into one component.

import { useEffect, useRef, useState } from "react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX",
  "UT","VT","VA","WA","WV","WI","WY",
];

const MAKES = [
  "Acura","Audi","BMW","Buick","Cadillac","Chevrolet","Chrysler","Dodge","Ford",
  "Genesis","GMC","Honda","Hyundai","Infiniti","Jaguar","Jeep","Kia","Land Rover",
  "Lexus","Lincoln","Mazda","Mercedes-Benz","MINI","Mitsubishi","Nissan","Polestar",
  "Porsche","Ram","Rivian","Subaru","Tesla","Toyota","Volkswagen","Volvo",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 2 - 1950 }, (_, i) => CURRENT_YEAR + 1 - i);
const OTHER = "__other";

const EMPTY_VEHICLE = { year: "", make: "", model: "", inoperable: false, condition: "" };

const EMPTY = {
  name: "",
  phone: "",
  email: "",
  origin_state: "",
  origin_zip: "",
  origin_city: "",
  destination_state: "",
  destination_zip: "",
  destination_city: "",
  pickup_date: "",
  transport_type: "Open",
};

// US phone: 10 digits, or 11 starting with 1 (formatting characters ignored).
function isValidPhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}
function isValidEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw || "");
}

const POPULAR_DOMAINS = [
  "gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","aol.com",
  "comcast.net","msn.com","live.com","att.net","verizon.net","protonmail.com",
];
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
// "name@gmmail.com" / "name@gmail.comj" -> "name@gmail.com"
const KNOWN_REAL_DOMAINS = [
  ...POPULAR_DOMAINS,
  "mail.com","ymail.com","gmx.com","me.com","mac.com","rocketmail.com","googlemail.com","pm.me","proton.me",
];
function suggestEmail(raw) {
  const at = (raw || "").lastIndexOf("@");
  if (at < 1) return null;
  const domain = raw.slice(at + 1).toLowerCase();
  if (KNOWN_REAL_DOMAINS.includes(domain)) return null;
  for (const good of POPULAR_DOMAINS) {
    if (editDistance(domain, good) <= 2) return raw.slice(0, at + 1) + good;
  }
  return null;
}

// Free ZIP -> city/state lookup. Returns { city, state } or null.
async function lookupZip(zip) {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    return { city: place["place name"], state: place["state abbreviation"] };
  } catch {
    return null;
  }
}

// One vehicle's year/make/model selectors. Each row loads its own verified
// model list from the NHTSA database for the chosen year+make.
function VehicleRow({ index, vehicle, onChange, onRemove, showRemove }) {
  const [makeChoice, setMakeChoice] = useState("");
  const [modelChoice, setModelChoice] = useState("");
  const [models, setModels] = useState([]);

  useEffect(() => {
    setModels([]);
    setModelChoice("");
    onChange(index, { ...vehicle, model: "" });
    if (!vehicle.year || !makeChoice || makeChoice === OTHER) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(makeChoice)}/modelyear/${vehicle.year}?format=json`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setModels([...new Set((data.Results || []).map((r) => r.Model_Name))].sort());
      } catch {
        // API unreachable -- the model field falls back to free text.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.year, makeChoice]);

  const showModelSelect = models.length > 0 && modelChoice !== OTHER;

  return (
    <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 12, marginTop: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Vehicle {index + 1}</span>
        {showRemove && (
          <button type="button" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#dc2626", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => onRemove(index)} aria-label={`Remove vehicle ${index + 1}`} title="Delete vehicle">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 8, marginBottom: 8 }}>
        <select
          required
          className="input"
          value={vehicle.year}
          onChange={(e) => onChange(index, { ...vehicle, year: e.target.value })}
          aria-label={`Vehicle ${index + 1} year`}
        >
          <option value="" disabled>Year</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          required
          className="input"
          value={makeChoice}
          onChange={(e) => {
            const v = e.target.value;
            setMakeChoice(v);
            onChange(index, { ...vehicle, make: v === OTHER ? "" : v, model: "" });
          }}
          aria-label={`Vehicle ${index + 1} make`}
        >
          <option value="" disabled>Make</option>
          {MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
          <option value={OTHER}>Other…</option>
        </select>
      </div>
      {makeChoice === OTHER && (
        <input
          required
          className="input"
          placeholder="Make"
          aria-label={`Vehicle ${index + 1} make (other)`}
          value={vehicle.make}
          onChange={(e) => onChange(index, { ...vehicle, make: e.target.value })}
          style={{ marginBottom: 8 }}
        />
      )}
      {showModelSelect ? (
        <select
          required
          className="input"
          value={modelChoice}
          onChange={(e) => {
            const v = e.target.value;
            setModelChoice(v);
            onChange(index, { ...vehicle, model: v === OTHER ? "" : v });
          }}
          aria-label={`Vehicle ${index + 1} model`}
          style={{ marginBottom: 8 }}
        >
          <option value="" disabled>Model</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
          <option value={OTHER}>Other / not listed…</option>
        </select>
      ) : (
        <input
          required
          className="input"
          placeholder="Model (e.g. Camry, F-150)"
          aria-label={`Vehicle ${index + 1} model`}
          value={vehicle.model}
          onChange={(e) => onChange(index, { ...vehicle, model: e.target.value })}
          style={{ marginBottom: 8 }}
        />
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "color-mix(in srgb, var(--color-text) 65%, transparent)", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={!!vehicle.inoperable}
          onChange={(e) => onChange(index, { ...vehicle, inoperable: e.target.checked, condition: e.target.checked ? vehicle.condition || "" : "" })}
          style={{ width: 15, height: 15, accentColor: "var(--color-accent)", flexShrink: 0 }}
        />
        This vehicle is inoperable (doesn&apos;t start or drive)
      </label>
      {vehicle.inoperable && (
        <select
          required
          className="input"
          value={vehicle.condition || ""}
          onChange={(e) => onChange(index, { ...vehicle, condition: e.target.value })}
          aria-label={`Vehicle ${index + 1} condition`}
          style={{ marginTop: 8 }}
        >
          <option value="" disabled>How does it move?</option>
          <option>Rolls, steers, and brakes</option>
          <option>Rolls and steers, no brakes</option>
          <option>Rolls only (won&apos;t steer)</option>
          <option>Does not roll</option>
          <option>No keys</option>
          <option>Needs a forklift</option>
          <option>Needs a winch</option>
        </select>
      )}
    </div>
  );
}

export default function CityQuoteForm({ serviceSlug, sourcePageId, tenantId, adConversion, metaPixel }) {
  const [form, setForm] = useState(EMPTY);
  const vehicleIdRef = useRef(1);
  const [vehicles, setVehicles] = useState([{ ...EMPTY_VEHICLE, id: 0 }]);
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [originHint, setOriginHint] = useState(null); // {ok, text}
  const [destHint, setDestHint] = useState(null);
  const [phoneError, setPhoneError] = useState(null);
  const [emailError, setEmailError] = useState(null);
  // Ad attribution: capture gclid + UTM params from the landing URL so the
  // lead records which campaign produced it (and offline conversions can be
  // uploaded later). Read once on mount; sessionStorage survives in-site
  // navigation between landing pages before the form is submitted.
  const attribution = useRef({});
  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const keys = ["gclid", "utm_source", "utm_medium", "utm_campaign"];
      const fresh = {};
      for (const k of keys) if (qs.get(k)) fresh[k] = qs.get(k).slice(0, 200);
      if (Object.keys(fresh).length > 0) {
        sessionStorage.setItem("sg-attr", JSON.stringify(fresh));
        attribution.current = fresh;
      } else {
        attribution.current = JSON.parse(sessionStorage.getItem("sg-attr") || "{}");
      }
    } catch { /* attribution is best-effort */ }
  }, []);

  function checkPhone(value) {
    setPhoneError(value && !isValidPhone(value) ? "That phone number doesn't look right — use 10 digits, e.g. (555) 123-4567" : null);
  }
  function checkEmail(value) {
    if (value && !isValidEmail(value)) {
      setEmailError("That email doesn't look right — e.g. name@example.com");
      return;
    }
    const suggestion = value ? suggestEmail(value) : null;
    setEmailError(suggestion ? `That email looks misspelled — did you mean ${suggestion}?` : null);
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // ZIP auto-fill: when a full ZIP is typed, resolve it and fill state + city.
  useEffect(() => {
    if (!/^\d{5}$/.test(form.origin_zip)) { setOriginHint(null); return; }
    const t = setTimeout(async () => {
      const found = await lookupZip(form.origin_zip);
      if (found) {
        setForm((f) => ({ ...f, origin_state: found.state, origin_city: found.city }));
        setOriginHint({ ok: true, text: `${found.city}, ${found.state}` });
      } else {
        setForm((f) => ({ ...f, origin_city: "" }));
        setOriginHint({ ok: false, text: "ZIP not recognized — pick the state manually" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [form.origin_zip]);

  useEffect(() => {
    if (!/^\d{5}$/.test(form.destination_zip)) { setDestHint(null); return; }
    const t = setTimeout(async () => {
      const found = await lookupZip(form.destination_zip);
      if (found) {
        setForm((f) => ({ ...f, destination_state: found.state, destination_city: found.city }));
        setDestHint({ ok: true, text: `${found.city}, ${found.state}` });
      } else {
        setForm((f) => ({ ...f, destination_city: "" }));
        setDestHint({ ok: false, text: "ZIP not recognized — pick the state manually" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [form.destination_zip]);

  function updateVehicle(index, vehicle) {
    setVehicles((v) => v.map((x, i) => (i === index ? vehicle : x)));
  }
  function addVehicle() {
    setVehicles((v) => [...v, { ...EMPTY_VEHICLE, id: vehicleIdRef.current++ }]);
  }
  function removeVehicle(index) {
    setVehicles((v) => v.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValidPhone(form.phone)) {
      checkPhone(form.phone || "x");
      return;
    }
    if (form.email && (!isValidEmail(form.email) || suggestEmail(form.email))) {
      checkEmail(form.email);
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          vehicles: vehicles.map((v) => ({
            year: v.year ? Number(v.year) : null,
            make: v.make || null,
            model: v.model || null,
            inoperable: !!v.inoperable,
            condition: v.inoperable ? v.condition || null : null,
          })),
          service_slug: serviceSlug,
          source_page_id: sourcePageId,
          tenant_id: tenantId,
          ...attribution.current,
        }),
      });
      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        if (out.error === "invalid_email") {
          setStatus("idle");
          setEmailError("That email address doesn't seem to exist — double-check it (or leave it blank).");
          return;
        }
        throw new Error("Request failed");
      }
      setStatus("success");
      // Fire the owning tenant's ad-manager conversion tags (self-managed ads).
      // Both are no-ops unless the page injected the vendor scripts.
      try {
        if (adConversion && typeof window.gtag === "function") {
          window.gtag("event", "conversion", { send_to: adConversion });
        }
        if (typeof window.gtag === "function") {
          window.gtag("event", "generate_lead", { form: "quote" });
        }
        if (metaPixel && typeof window.fbq === "function") {
          window.fbq("track", "Lead");
        }
      } catch { /* tracking must never break the thank-you state */ }
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)", padding: 18, borderRadius: 16, fontWeight: 600, textAlign: "center" }}>
        Thanks — a coordinator will reach out shortly with your quote.
      </div>
    );
  }

  return (
    <form className="card elev-lg" style={{ background: "var(--color-neutral-100)", padding: "clamp(20px,3vw,28px)", gap: 14 }} onSubmit={handleSubmit}>
      <h3 style={{ fontSize: 20, marginBottom: 2 }}>Get your free instant quote</h3>
      <p style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)", margin: "-4px 0 4px" }}>Takes under two minutes. No obligation.</p>

      <div className="og-row-3">
        <div className="field"><label>Full name</label><input required className="input" placeholder="Jane Rivera" autoComplete="name" value={form.name} onChange={set("name")} /></div>
        <div className="field">
          <label>Phone number</label>
          <input
            required
            type="tel"
            className="input"
            placeholder="(555) 123-4567"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => { set("phone")(e); if (phoneError) checkPhone(e.target.value); }}
            onBlur={(e) => checkPhone(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Email (optional)</label>
          <input
            type="email"
            className="input"
            placeholder="jane@example.com"
            autoComplete="email"
            value={form.email}
            onChange={(e) => { set("email")(e); if (emailError) checkEmail(e.target.value); }}
            onBlur={(e) => checkEmail(e.target.value)}
          />
        </div>
      </div>
      {phoneError && <div className="og-hint warn">{phoneError}</div>}
      {emailError && <div className="og-hint warn">{emailError}</div>}

      <div className="og-row-3">
        <div className="field"><label>Pickup ZIP</label>
          <input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} className="input" placeholder="77002" value={form.origin_zip} onChange={set("origin_zip")} />
        </div>
        <div className="field"><label>Drop-off ZIP</label>
          <input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} className="input" placeholder="75201" value={form.destination_zip} onChange={set("destination_zip")} />
        </div>
        <div className="field"><label>Pickup date</label>
          <input required type="date" className="input" min={new Date().toISOString().slice(0, 10)} value={form.pickup_date} onChange={set("pickup_date")} />
        </div>
      </div>
      {originHint && <div className={originHint.ok ? "og-hint ok" : "og-hint warn"}>{originHint.ok ? "✓ " : ""}{originHint.text}</div>}
      {destHint && <div className={destHint.ok ? "og-hint ok" : "og-hint warn"}>{destHint.ok ? "✓ " : ""}{destHint.text}</div>}

      <div className="field">
        <label>Trailer type</label>
        <div className="seg" style={{ width: "100%" }}>
          <label className="seg-opt" style={{ flex: 1, justifyContent: "center" }}>
            <input type="radio" name="trailer" checked={form.transport_type === "Open"} onChange={() => setForm((f) => ({ ...f, transport_type: "Open" }))} />Open — best value
          </label>
          <label className="seg-opt" style={{ flex: 1, justifyContent: "center" }}>
            <input type="radio" name="trailer" checked={form.transport_type === "Enclosed"} onChange={() => setForm((f) => ({ ...f, transport_type: "Enclosed" }))} />Enclosed
          </label>
        </div>
      </div>

      {vehicles.map((v, i) => (
        <VehicleRow
          key={v.id}
          index={i}
          vehicle={v}
          onChange={updateVehicle}
          onRemove={removeVehicle}
          showRemove={vehicles.length > 1}
        />
      ))}
      {vehicles[vehicles.length - 1]?.year && vehicles[vehicles.length - 1]?.make && vehicles[vehicles.length - 1]?.model && (
        <button type="button" className="btn btn-secondary btn-block" style={{ borderStyle: "dashed" }} onClick={addVehicle}>
          + Add another vehicle{vehicles.length > 1 ? ` (${vehicles.length} added)` : ""}
        </button>
      )}

      <button type="submit" className="btn btn-primary btn-block" style={{ fontSize: 15, padding: 13 }} disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting..." : "Get My Free Quote"}
      </button>
      {status === "error" && <p style={{ color: "var(--color-accent-700)", fontSize: 13 }}>Something went wrong — please try again.</p>}
    </form>
  );
}
