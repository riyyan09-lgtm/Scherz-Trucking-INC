"use client";

import { useState } from "react";

// Independent toggling per row (not single-open accordion behavior) --
// clicking one question doesn't close another that's already open.
export default function FaqAccordion({ items }) {
  const [open, setOpen] = useState(() => new Set());

  function toggle(i) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="ha-faq-card">
      {items.map((f, i) => {
        const isOpen = open.has(i);
        return (
          <div key={f.q} className="ha-faq-row">
            <button type="button" className="ha-faq-q" onClick={() => toggle(i)} aria-expanded={isOpen}>
              <span>{f.q}</span>
              <span className="ha-faq-icon">{isOpen ? "–" : "+"}</span>
            </button>
            {isOpen && <div className="ha-faq-a">{f.a}</div>}
          </div>
        );
      })}
    </div>
  );
}
