"use client";

import { useState } from "react";

// Progressive enhancement only: the full state/city link list is rendered
// server-side by the parent (so every link is in the initial HTML for
// crawlers); this just hides non-matching entries client-side as the visitor
// types. No links are added/removed by JS, only display:none toggled.
export default function LocationsFilter() {
  const [q, setQ] = useState("");

  function onChange(e) {
    const value = e.target.value;
    setQ(value);
    const needle = value.trim().toLowerCase();
    document.querySelectorAll("[data-dir-state]").forEach((stateEl) => {
      let stateHasMatch = needle === "";
      stateEl.querySelectorAll("[data-dir-city]").forEach((cityEl) => {
        const matches = needle === "" || cityEl.dataset.dirCity.includes(needle) || stateEl.dataset.dirState.includes(needle);
        cityEl.style.display = matches ? "" : "none";
        if (matches) stateHasMatch = true;
      });
      stateEl.style.display = stateHasMatch ? "" : "none";
      if (needle !== "" && stateHasMatch) stateEl.open = true;
    });
  }

  return (
    <input
      type="search"
      className="loc-filter"
      placeholder="Search a city or state…"
      value={q}
      onChange={onChange}
      aria-label="Filter cities"
    />
  );
}
