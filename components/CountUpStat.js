"use client";

import { useEffect, useRef, useState } from "react";

// Animates a number from 0 to `target` using easeOutCubic once the cell
// scrolls into view (or immediately if already on-screen at mount).
export default function CountUpStat({ target, label, color, duration = 1300 }) {
  const ref = useRef(null);
  const started = useRef(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    function run() {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      function tick(now) {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setCount(Math.round(eased * target));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    // Unconditional last-resort: if requestAnimationFrame never fires at all
    // (e.g. a fully backgrounded/inactive tab throttles it to zero), jump
    // straight to the final number rather than leaving the cell stuck at 0.
    const hardStop = setTimeout(() => setCount(target), 1500 + duration);

    const el = ref.current;
    if (!el) return () => clearTimeout(hardStop);
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      run();
      return () => clearTimeout(hardStop);
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            run();
            io.disconnect();
          }
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    const fallback = setTimeout(run, 1500);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
      clearTimeout(hardStop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <div className="ha-stat-cell" ref={ref}>
      <div className="ha-stat-value" style={{ color }}>{count.toLocaleString()}</div>
      <div className="ha-stat-label">{label}</div>
    </div>
  );
}
