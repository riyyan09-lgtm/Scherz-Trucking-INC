"use client";

import { useEffect, useRef, useState } from "react";
import { SERVICE_NAV } from "../lib/serviceContent";
import { BUSINESS_NAV } from "../lib/businessSegments";
import { BRAND } from "../lib/brand";
import { LogoMark } from "./Logo";
import "./siteHeader.css";

const NAV = [
  { label: "How It Works", href: "/#how-it-works" },
  {
    label: "Services",
    heading: "Shipping Services",
    // All 8 service pages, generated from lib/serviceContent.js so the menu
    // and the pages can't drift apart.
    items: SERVICE_NAV,
  },
  { label: "Cost Calculator", href: "/car-shipping-cost-calculator" },
  {
    label: "For Business",
    heading: "We Partner With",
    // Generated from lib/businessSegments.js, same reason as Services above.
    items: BUSINESS_NAV,
  },
  { label: "All Locations", href: "/locations" },
];

export default function SiteHeader({ quoteHref = "/#quote", theme = "light" }) {
  const [openMenu, setOpenMenu] = useState(null); // label of the open dropdown, or null
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMobileGroup, setOpenMobileGroup] = useState(null); // one expanded group at a time
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef(null);

  // Closing the sheet collapses whatever was expanded, so reopening it always
  // starts from the same short top-level list.
  function closeMobile() {
    setMobileOpen(false);
    setOpenMobileGroup(null);
  }
  function toggleMobile() {
    setMobileOpen((v) => {
      if (v) setOpenMobileGroup(null);
      return !v;
    });
  }

  useEffect(() => {
    function onClick(e) {
      if (!e.target.closest(".sh-drop")) setOpenMenu(null);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // "navy" theme starts transparent over a dark hero image and turns solid
  // navy once the page scrolls past it -- only meaningful for that theme,
  // so the listener is a no-op (and never attached) for "warm"/"light".
  useEffect(() => {
    if (theme !== "navy") return;
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [theme]);

  // Hover-to-open on desktop, with a short close-delay so moving the mouse
  // from the button down into the menu doesn't close it. Click still works
  // (toggle) for touch devices and keyboard users.
  function openOnHover(label) {
    clearTimeout(closeTimer.current);
    setOpenMenu(label);
  }
  function closeOnHoverOut() {
    closeTimer.current = setTimeout(() => setOpenMenu(null), 150);
  }

  // The navy bar is transparent over the hero and turns solid once the page
  // scrolls past it. It also has to be solid whenever the mobile sheet is
  // open, even at scrollTop 0: the wordmark and burger are white, so over a
  // light page background a transparent bar left them invisible.
  const barSolid = theme === "navy" && (scrolled || mobileOpen);

  return (
    <header
      className={
        "sh-header" +
        (theme === "warm" ? " sh-warm" : "") +
        (theme === "navy" ? " sh-navy" + (barSolid ? " sh-navy-scrolled" : "") : "")
      }
    >
      <div className={`sh-inner${barSolid ? " sh-inner-solid" : ""}`}>
        <a className="sh-logo" href="/" aria-label={`${BRAND.name} home`}>
          <img src="/logo.png" alt={BRAND.name} width={32} height={32} className="sh-logo-img" />
          <span className="sh-wordmark">
            Scherz Trucking<span className="sh-wordmark-sub">INC</span>
          </span>
        </a>

        <nav className="sh-nav">
          {NAV.map((item) =>
            item.items ? (
              <div
                className="sh-drop"
                key={item.label}
                onMouseEnter={() => openOnHover(item.label)}
                onMouseLeave={closeOnHoverOut}
              >
                <button type="button" className="sh-nav-link sh-drop-btn" onClick={() => setOpenMenu((v) => (v === item.label ? null : item.label))}>
                  {item.label} <span className="sh-caret">▾</span>
                </button>
                {openMenu === item.label && (
                  <div className="sh-drop-menu">
                    {item.heading && <div className="sh-drop-heading">{item.heading}</div>}
                    {item.items.map((sub) => (
                      <a key={sub.label} href={sub.href} className="sh-drop-item">{sub.label}</a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <a key={item.href} href={item.href} className="sh-nav-link">{item.label}</a>
            )
          )}
        </nav>

        <a className="sh-cta" href={quoteHref}>Get a Free Quote</a>

        <button
          type="button"
          className={`sh-burger${mobileOpen ? " is-open" : ""}`}
          aria-label={mobileOpen ? "Close menu" : "Menu"}
          aria-expanded={mobileOpen}
          onClick={toggleMobile}
        >
          <span /><span /><span />
        </button>
      </div>

      {/* Mobile sheet. The two dropdown groups hold 15 links between them, so
          they collapse behind their own toggle -- rendering them all flat made
          the sheet several screens long. Only one group is open at a time. */}
      {mobileOpen && (
        <div className="sh-mobile">
          {NAV.map((item) => {
            if (!item.items) {
              return (
                <a key={item.href} href={item.href} className="sh-mobile-link" onClick={closeMobile}>
                  {item.label}
                </a>
              );
            }
            const expanded = openMobileGroup === item.label;
            return (
              <div key={item.label} className="sh-mobile-group">
                <button
                  type="button"
                  className={`sh-mobile-toggle${expanded ? " is-open" : ""}`}
                  aria-expanded={expanded}
                  onClick={() => setOpenMobileGroup(expanded ? null : item.label)}
                >
                  <span>{item.label}</span>
                  <span className="sh-mobile-chev" aria-hidden="true">▾</span>
                </button>
                {expanded && (
                  <div className="sh-mobile-sub">
                    {item.items.map((sub) => (
                      <a key={sub.label} href={sub.href} className="sh-mobile-link sh-mobile-sublink" onClick={closeMobile}>
                        {sub.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <a className="sh-cta sh-cta-mobile" href={quoteHref} onClick={closeMobile}>Get a Free Quote</a>
        </div>
      )}
    </header>
  );
}
