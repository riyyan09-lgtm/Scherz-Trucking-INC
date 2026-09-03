"use client";

import { useEffect, useRef, useState } from "react";

// Fades content in and slides it up the first time it enters the viewport.
// Anything already on-screen at mount reveals immediately instead of
// waiting for a scroll event (checked via getBoundingClientRect on mount) --
// an IntersectionObserver alone never fires for above-the-fold content that
// never crosses the viewport boundary. A ~1.2s fallback timer force-reveals
// anything still hidden, so a slow/blocked observer never leaves content
// permanently invisible.
export default function ScrollReveal({ as: Tag = "div", className = "", children, ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // The fallback timer is unconditional (not just for the IntersectionObserver
    // branch below): a backgrounded/inactive tab throttles requestAnimationFrame
    // to near-zero, which would otherwise leave "already in view at mount"
    // content stuck invisible until the tab is focused and scrolled.
    const fallback = setTimeout(() => setVisible(true), 1200);

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(fallback);
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  return (
    <Tag ref={ref} className={`ha-reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </Tag>
  );
}
