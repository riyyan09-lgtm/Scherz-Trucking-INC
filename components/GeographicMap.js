"use client";

import { useEffect, useRef, useState } from "react";

// Real US state geography (d3-geo + us-atlas TopoJSON, Albers USA projection
// with the AK/HI insets already baked into the coordinates -- so paths are
// drawn with a bare d3.geoPath() and no extra projection).
//
// Hovering a state shows a tooltip with its live city count; clicking opens
// that state's car-shipping page. Counts come from the `cityCounts` prop
// (built from lib/cityDirectory in app/page.js), never a hardcoded table --
// an earlier version hardcoded six states, which is why every other state
// showed nothing on hover.

const FIPS_TO_ABBR = {
  1: "AL", 2: "AK", 4: "AZ", 5: "AR", 6: "CA", 8: "CO", 9: "CT", 10: "DE", 11: "DC", 12: "FL",
  13: "GA", 15: "HI", 16: "ID", 17: "IL", 18: "IN", 19: "IA", 20: "KS", 21: "KY", 22: "LA", 23: "ME",
  24: "MD", 25: "MA", 26: "MI", 27: "MN", 28: "MS", 29: "MO", 30: "MT", 31: "NE", 32: "NV", 33: "NH",
  34: "NJ", 35: "NM", 36: "NY", 37: "NC", 38: "ND", 39: "OH", 40: "OK", 41: "OR", 42: "PA", 44: "RI",
  45: "SC", 46: "SD", 47: "TN", 48: "TX", 49: "UT", 50: "VT", 51: "VA", 53: "WA", 54: "WV", 55: "WI", 56: "WY",
};

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "Washington DC", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const BASE_FILL = "#dbeafe";
const SELECTED_FILL = "#2f6fed";
const NO_COVERAGE_FILL = "#eef2f7";

// State pages live at /car-shipping/<lowercased abbreviation> -- the route's
// state_slug is `lower(s.abbreviation)` (lib/cityDirectory.js), not the state
// name, so "NM" -> /car-shipping/nm.
function stateHref(abbr) {
  return STATE_NAMES[abbr] ? `/car-shipping/${abbr.toLowerCase()}` : null;
}

export default function GeographicMap({ cityCounts = {} }) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [selectedState, setSelectedState] = useState(null);
  const [hover, setHover] = useState(null); // { abbr, x, y }
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.d3 && window.topojson) {
      setReady(true);
      return;
    }

    let loaded = 0;
    const onLoad = () => {
      loaded++;
      if (loaded === 2) setReady(true);
    };

    const d3Script = document.createElement("script");
    d3Script.src = "https://unpkg.com/d3@7.9.0/dist/d3.min.js";
    d3Script.onload = onLoad;
    document.head.appendChild(d3Script);

    const topoScript = document.createElement("script");
    topoScript.src = "https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js";
    topoScript.onload = onLoad;
    document.head.appendChild(topoScript);
  }, []);

  // Draw once the libraries are in. Deliberately does NOT depend on
  // selectedState/hover -- re-running the whole D3 join on every hover would
  // thrash the DOM; the fill/stroke updates below mutate attributes directly.
  useEffect(() => {
    if (!ready || !svgRef.current || !window.d3 || !window.topojson) return;

    const d3 = window.d3;
    const topojson = window.topojson;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json");
        if (!res.ok || cancelled) return;
        const topology = await res.json();
        if (cancelled) return;
        const features = topojson.feature(topology, topology.objects.states).features;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();
        svg
          .attr("viewBox", "0 0 975 610")
          .attr("width", "100%")
          .style("display", "block")
          .style("height", "auto");

        const path = d3.geoPath();

        svg
          .selectAll("path")
          .data(features)
          .join("path")
          .attr("d", path)
          .attr("data-abbr", (d) => FIPS_TO_ABBR[+d.id] || null)
          .attr("fill", (d) => {
            const abbr = FIPS_TO_ABBR[+d.id];
            return abbr && (cityCounts[abbr] || 0) > 0 ? BASE_FILL : NO_COVERAGE_FILL;
          })
          .attr("stroke", "#fff")
          .attr("stroke-width", 0.75)
          .style("cursor", (d) => (FIPS_TO_ABBR[+d.id] ? "pointer" : "default"))
          .style("transition", "filter 0.15s ease")
          .on("mousemove", function (event, d) {
            const abbr = FIPS_TO_ABBR[+d.id];
            if (!abbr) return;
            this.style.filter = "brightness(0.92)";
            const box = wrapRef.current?.getBoundingClientRect();
            if (!box) return;
            setHover({ abbr, x: event.clientX - box.left, y: event.clientY - box.top });
          })
          .on("mouseleave", function () {
            this.style.filter = "none";
            setHover(null);
          })
          .on("click", (event, d) => {
            const abbr = FIPS_TO_ABBR[+d.id];
            if (!abbr) return;
            setSelectedState(abbr);
            const href = stateHref(abbr);
            if (href) window.location.href = href;
          });

        svg
          .selectAll("text")
          .data(features.filter((d) => FIPS_TO_ABBR[+d.id]))
          .join("text")
          .attr("data-label", (d) => FIPS_TO_ABBR[+d.id])
          .attr("x", (d) => path.centroid(d)[0])
          .attr("y", (d) => path.centroid(d)[1])
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("font-size", 9)
          .attr("font-weight", 700)
          .attr("font-family", "Manrope, system-ui, sans-serif")
          .attr("fill", "#0b2545")
          .style("pointer-events", "none")
          .text((d) => FIPS_TO_ABBR[+d.id]);
      } catch (e) {
        console.error("Map render failed:", e);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cityCounts]);

  // Highlight the selected state without redrawing the map.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.querySelectorAll("path[data-abbr]").forEach((node) => {
      const abbr = node.getAttribute("data-abbr");
      const isSel = abbr === selectedState;
      const covered = (cityCounts[abbr] || 0) > 0;
      node.setAttribute("fill", isSel ? SELECTED_FILL : covered ? BASE_FILL : NO_COVERAGE_FILL);
      node.setAttribute("stroke", isSel ? "#0b2545" : "#fff");
      node.setAttribute("stroke-width", isSel ? "2" : "0.75");
    });
    svg.querySelectorAll("text[data-label]").forEach((node) => {
      node.setAttribute("fill", node.getAttribute("data-label") === selectedState ? "#fff" : "#0b2545");
    });
  }, [selectedState, cityCounts, ready]);

  const hoverCount = hover ? cityCounts[hover.abbr] || 0 : 0;

  return (
    <div className="ha-map" ref={wrapRef}>
      <svg ref={svgRef} role="img" aria-label="Map of US states we cover — select a state to see its cities" />

      {hover && (
        <div
          className="ha-map-tip"
          style={{ left: hover.x, top: hover.y }}
          aria-hidden="true"
        >
          <span className="ha-map-tip-name">{STATE_NAMES[hover.abbr]}</span>
          <span className="ha-map-tip-count">
            {hoverCount > 0
              ? `${hoverCount.toLocaleString()} ${hoverCount === 1 ? "city" : "cities"} covered`
              : "Coverage on request"}
          </span>
        </div>
      )}
    </div>
  );
}
