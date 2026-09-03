"use client";

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
    <>
      <div className="quote-vehicle-head">
        <span className="quote-label">Vehicle {index + 1}</span>
        {showRemove && (
          <button type="button" className="quote-remove" onClick={() => onRemove(index)} aria-label={`Remove vehicle ${index + 1}`}>
            Remove
          </button>
        )}
      </div>
      <div className="quote-row-2v">
        <select
          required
          value={vehicle.year}
          onChange={(e) => onChange(index, { ...vehicle, year: e.target.value })}
          aria-label={`Vehicle ${index + 1} year`}
        >
          <option value="" disabled>Year</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          required
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
          placeholder="Make"
          aria-label={`Vehicle ${index + 1} make (other)`}
          value={vehicle.make}
          onChange={(e) => onChange(index, { ...vehicle, make: e.target.value })}
        />
      )}
      {showModelSelect ? (
        <select
          required
          value={modelChoice}
          onChange={(e) => {
            const v = e.target.value;
            setModelChoice(v);
            onChange(index, { ...vehicle, model: v === OTHER ? "" : v });
          }}
          aria-label={`Vehicle ${index + 1} model`}
        >
          <option value="" disabled>Model</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
          <option value={OTHER}>Other / not listed…</option>
        </select>
      ) : (
        <input
          required
          placeholder="Model"
          aria-label={`Vehicle ${index + 1} model`}
          value={vehicle.model}
          onChange={(e) => onChange(index, { ...vehicle, model: e.target.value })}
        />
      )}
      <label className="quote-inop">
        <input
          type="checkbox"
          checked={!!vehicle.inoperable}
          onChange={(e) => onChange(index, { ...vehicle, inoperable: e.target.checked, condition: e.target.checked ? vehicle.condition || "" : "" })}
        />
        This vehicle is inoperable (doesn&apos;t start or drive)
      </label>
      {vehicle.inoperable && (
        <select
          required
          value={vehicle.condition || ""}
          onChange={(e) => onChange(index, { ...vehicle, condition: e.target.value })}
          aria-label={`Vehicle ${index + 1} condition`}
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
    </>
  );
}

export default function QuoteForm({ serviceSlug, sourcePageId, tenantId, adConversion, metaPixel }) {
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
    return <p className="quote-success">Thanks — we'll be in touch shortly with your quote.</p>;
  }

  return (
    <form className="quote-card" onSubmit={handleSubmit}>
      <h3>Get your free instant quote</h3>

      <input required placeholder="Full name" autoComplete="name" value={form.name} onChange={set("name")} />
      <input
        required
        type="tel"
        placeholder="Phone number"
        autoComplete="tel"
        value={form.phone}
        onChange={(e) => { set("phone")(e); if (phoneError) checkPhone(e.target.value); }}
        onBlur={(e) => checkPhone(e.target.value)}
      />
      {phoneError && <div className="quote-hint warn">{phoneError}</div>}
      <input
        type="email"
        placeholder="Email (optional)"
        autoComplete="email"
        value={form.email}
        onChange={(e) => { set("email")(e); if (emailError) checkEmail(e.target.value); }}
        onBlur={(e) => checkEmail(e.target.value)}
      />
      {emailError && <div className="quote-hint warn">{emailError}</div>}

      <div className="quote-label">Pickup location</div>
      <div className="quote-row-2">
        <input
          required
          inputMode="numeric"
          pattern="[0-9]{5}"
          maxLength={5}
          placeholder="ZIP code"
          aria-label="Pickup ZIP code"
          value={form.origin_zip}
          onChange={set("origin_zip")}
        />
        <select required value={form.origin_state} onChange={set("origin_state")} aria-label="Pickup state">
          <option value="" disabled>State</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {originHint && (
        <div className={originHint.ok ? "quote-hint ok" : "quote-hint warn"}>
          {originHint.ok ? "✓ " : ""}{originHint.text}
        </div>
      )}

      <div className="quote-label">Drop-off location</div>
      <div className="quote-row-2">
        <input
          required
          inputMode="numeric"
          pattern="[0-9]{5}"
          maxLength={5}
          placeholder="ZIP code"
          aria-label="Drop-off ZIP code"
          value={form.destination_zip}
          onChange={set("destination_zip")}
        />
        <select required value={form.destination_state} onChange={set("destination_state")} aria-label="Drop-off state">
          <option value="" disabled>State</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {destHint && (
        <div className={destHint.ok ? "quote-hint ok" : "quote-hint warn"}>
          {destHint.ok ? "✓ " : ""}{destHint.text}
        </div>
      )}

      <div className="quote-label">Pickup date</div>
      <input
        required
        type="date"
        aria-label="Pickup date"
        min={new Date().toISOString().slice(0, 10)}
        value={form.pickup_date}
        onChange={set("pickup_date")}
      />

      <div className="quote-label">Trailer type</div>
      <div className="quote-trailer">
        <button
          type="button"
          className={`quote-trailer-opt ${form.transport_type === "Open" ? "on" : ""}`}
          onClick={() => setForm((f) => ({ ...f, transport_type: "Open" }))}
        >
          Open<span>Best value</span>
        </button>
        <button
          type="button"
          className={`quote-trailer-opt ${form.transport_type === "Enclosed" ? "on" : ""}`}
          onClick={() => setForm((f) => ({ ...f, transport_type: "Enclosed" }))}
        >
          Enclosed<span>Full protection</span>
        </button>
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
      <button type="button" className="quote-add-vehicle" onClick={addVehicle}>
        + Add another vehicle{vehicles.length > 1 ? ` (${vehicles.length} added)` : ""}
      </button>

      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting..." : "Get My Free Quote"}
      </button>
      {status === "error" && <p className="quote-error">Something went wrong — please try again.</p>}
    </form>
  );
}
