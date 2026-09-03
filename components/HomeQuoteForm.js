"use client";

// Homepage quote form — same validation/ZIP-lookup/submission logic as
// CityQuoteForm.js, but rendering the markup from the animated design handoff
// ("Animate ShipGrid website.zip", section 3): a full-width card with two
// 3-column placeholder-only input rows, bordered vehicle cards, and a footer
// row that puts the trailer pills and the CTA on one line. Kept separate from
// CityQuoteForm.js for the same reason that file is separate from
// QuoteForm.js — one component per design system, so restyling the homepage
// can't regress the 2,000+ city landing pages.

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

const CONDITIONS = [
  "Rolls, steers, and brakes",
  "Rolls and steers, no brakes",
  "Rolls only (won't steer)",
  "Does not roll",
  "No keys",
  "Needs a forklift",
  "Needs a winch",
];

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

// One vehicle's card. Year/make/model on one row, then Operable/Inoperable
// pills, then the "how does it move?" follow-up only when inoperable.
function VehicleCard({ index, vehicle, onChange, onRemove }) {
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
    <div className="ha-veh">
      <div className="ha-veh-head">
        <span className="ha-veh-title">Vehicle {index + 1}</span>
        {onRemove && (
          <button type="button" className="ha-veh-del" onClick={() => onRemove(index)} aria-label={`Remove vehicle ${index + 1}`} title="Remove vehicle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
          </button>
        )}
      </div>

      <div className="ha-row-3">
        <select
          required
          className="input"
          value={vehicle.year}
          onChange={(e) => onChange(index, { ...vehicle, year: e.target.value })}
          aria-label={`Vehicle ${index + 1} year`}
        >
          <option value="" disabled>Vehicle year</option>
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
          <option value="" disabled>Vehicle make</option>
          {MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
          <option value={OTHER}>Other…</option>
        </select>
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
          >
            <option value="" disabled>Vehicle model</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value={OTHER}>Other / not listed…</option>
          </select>
        ) : (
          <input
            required
            className="input"
            placeholder="Vehicle model"
            aria-label={`Vehicle ${index + 1} model`}
            value={vehicle.model}
            onChange={(e) => onChange(index, { ...vehicle, model: e.target.value })}
          />
        )}
      </div>

      {makeChoice === OTHER && (
        <input
          required
          className="input"
          placeholder="Vehicle make"
          aria-label={`Vehicle ${index + 1} make (other)`}
          value={vehicle.make}
          onChange={(e) => onChange(index, { ...vehicle, make: e.target.value })}
        />
      )}

      <div className="ha-pills" role="group" aria-label={`Vehicle ${index + 1} condition`}>
        <button
          type="button"
          className={`ha-pill${!vehicle.inoperable ? " is-on" : ""}`}
          aria-pressed={!vehicle.inoperable}
          onClick={() => onChange(index, { ...vehicle, inoperable: false, condition: "" })}
        >
          Operable
        </button>
        <button
          type="button"
          className={`ha-pill${vehicle.inoperable ? " is-on" : ""}`}
          aria-pressed={!!vehicle.inoperable}
          onClick={() => onChange(index, { ...vehicle, inoperable: true })}
        >
          Inoperable
        </button>
      </div>

      {vehicle.inoperable && (
        <select
          required
          className="input"
          value={vehicle.condition || ""}
          onChange={(e) => onChange(index, { ...vehicle, condition: e.target.value })}
          aria-label={`Vehicle ${index + 1} — how does it move?`}
        >
          <option value="" disabled>How does it move?</option>
          {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
    </div>
  );
}

export default function HomeQuoteForm({ serviceSlug, sourcePageId, tenantId, adConversion, metaPixel }) {
  const [form, setForm] = useState(EMPTY);
  const vehicleIdRef = useRef(1);
  const [vehicles, setVehicles] = useState([{ ...EMPTY_VEHICLE, id: 0 }]);
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [originHint, setOriginHint] = useState(null); // {ok, text}
  const [destHint, setDestHint] = useState(null);
  const [phoneError, setPhoneError] = useState(null);
  const [emailError, setEmailError] = useState(null);

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

  // The design has no state dropdowns -- state comes from the ZIP lookup.
  // A manual picker only appears if the lookup can't resolve the ZIP, so the
  // lead still records a state instead of posting a blank one.
  useEffect(() => {
    if (!/^\d{5}$/.test(form.origin_zip)) { setOriginHint(null); return; }
    const t = setTimeout(async () => {
      const found = await lookupZip(form.origin_zip);
      if (found) {
        setForm((f) => ({ ...f, origin_state: found.state, origin_city: found.city }));
        setOriginHint({ ok: true, text: `${found.city}, ${found.state}` });
      } else {
        setForm((f) => ({ ...f, origin_city: "" }));
        setOriginHint({ ok: false, text: "ZIP not recognized — pick the state" });
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
        setDestHint({ ok: false, text: "ZIP not recognized — pick the state" });
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
      <div className="ha-form-success">
        Thanks — a coordinator will reach out shortly with your quote.
      </div>
    );
  }

  return (
    <form className="ha-form" onSubmit={handleSubmit}>
      <div>
        <div className="ha-form-title">Get your free instant quote</div>
        <div className="ha-form-sub">Takes under two minutes. No obligation.</div>
      </div>

      <div className="ha-row-3">
        <input required className="input" placeholder="Full name" autoComplete="name" aria-label="Full name" value={form.name} onChange={set("name")} />
        <input
          required
          type="tel"
          className="input"
          placeholder="Phone number"
          autoComplete="tel"
          aria-label="Phone number"
          value={form.phone}
          onChange={(e) => { set("phone")(e); if (phoneError) checkPhone(e.target.value); }}
          onBlur={(e) => checkPhone(e.target.value)}
        />
        <input
          type="email"
          className="input"
          placeholder="Email (optional)"
          autoComplete="email"
          aria-label="Email (optional)"
          value={form.email}
          onChange={(e) => { set("email")(e); if (emailError) checkEmail(e.target.value); }}
          onBlur={(e) => checkEmail(e.target.value)}
        />
      </div>
      {phoneError && <div className="og-hint warn">{phoneError}</div>}
      {emailError && <div className="og-hint warn">{emailError}</div>}

      <div className="ha-row-3">
        <input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} className="input" placeholder="Pickup ZIP" aria-label="Pickup ZIP" value={form.origin_zip} onChange={set("origin_zip")} />
        <input required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} className="input" placeholder="Drop-off ZIP" aria-label="Drop-off ZIP" value={form.destination_zip} onChange={set("destination_zip")} />
        <input required type="date" className="input" aria-label="Pickup date" min={new Date().toISOString().slice(0, 10)} value={form.pickup_date} onChange={set("pickup_date")} />
      </div>

      {originHint && (
        <div className={originHint.ok ? "og-hint ok" : "og-hint warn"}>
          {originHint.ok ? `✓ Pickup: ${originHint.text}` : `Pickup ${originHint.text}`}
        </div>
      )}
      {originHint && !originHint.ok && (
        <select required className="input ha-state-fallback" value={form.origin_state} onChange={set("origin_state")} aria-label="Pickup state">
          <option value="" disabled>Pickup state</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {destHint && (
        <div className={destHint.ok ? "og-hint ok" : "og-hint warn"}>
          {destHint.ok ? `✓ Drop-off: ${destHint.text}` : `Drop-off ${destHint.text}`}
        </div>
      )}
      {destHint && !destHint.ok && (
        <select required className="input ha-state-fallback" value={form.destination_state} onChange={set("destination_state")} aria-label="Drop-off state">
          <option value="" disabled>Drop-off state</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      {vehicles.map((v, i) => (
        <VehicleCard
          key={v.id}
          index={i}
          vehicle={v}
          onChange={updateVehicle}
          onRemove={vehicles.length > 1 ? removeVehicle : null}
        />
      ))}

      <button type="button" className="ha-add-veh" onClick={addVehicle}>
        + Add another vehicle
      </button>

      <div className="ha-form-foot">
        <div className="ha-pills" role="group" aria-label="Trailer type">
          <button
            type="button"
            className={`ha-pill${form.transport_type === "Open" ? " is-on" : ""}`}
            aria-pressed={form.transport_type === "Open"}
            onClick={() => setForm((f) => ({ ...f, transport_type: "Open" }))}
          >
            Open — best value
          </button>
          <button
            type="button"
            className={`ha-pill${form.transport_type === "Enclosed" ? " is-on" : ""}`}
            aria-pressed={form.transport_type === "Enclosed"}
            onClick={() => setForm((f) => ({ ...f, transport_type: "Enclosed" }))}
          >
            Enclosed
          </button>
        </div>
        <button type="submit" className="btn btn-primary ha-form-cta" disabled={status === "submitting"}>
          {status === "submitting" ? "Submitting…" : "Get My Free Quote →"}
        </button>
      </div>

      {status === "error" && <p className="og-hint warn">Something went wrong — please try again.</p>}
    </form>
  );
}
