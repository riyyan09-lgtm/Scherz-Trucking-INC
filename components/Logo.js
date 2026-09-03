import { BRAND } from "../lib/brand";

// Scherz Trucking INC mark: a shield (trust) enclosing a lane of road
// receding to a vanishing point, with tapered centre stripes (lane).
//
// Colour choices are fixed rather than inherited so the mark reads on both
// surfaces it has to sit on -- the navy hero header and the cream/white
// landing-page headers. The blue shield carries enough contrast against both;
// only the wordmark next to it uses currentColor and flips per theme.
export function LogoMark({ size = 26, className = "", title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {/* shield */}
      <path
        d="M16 1.75 28.25 5.9v9.35c0 7.6-5.3 12.85-12.25 15.25C9.05 28.1 3.75 22.85 3.75 15.25V5.9L16 1.75Z"
        fill="#2f6fed"
      />
      {/* road surface, inset so the shield keeps a visible border */}
      <path d="M13.4 8.9h5.2l5.3 15.4H8.1L13.4 8.9Z" fill="#fff" />
      {/* centre stripes, widening toward the viewer */}
      <path d="M15.62 10.4h.76l.1 2.5h-.96l.1-2.5Z" fill="#2f6fed" />
      <path d="M15.42 14.35h1.16l.16 3.1h-1.48l.16-3.1Z" fill="#2f6fed" />
      <path d="M15.16 19.1h1.68l.26 3.75h-2.2l.26-3.75Z" fill="#2f6fed" />
    </svg>
  );
}

// Full lockup for headers: mark + wordmark. The wordmark inherits colour from
// the link, so the existing per-theme .sh-logo rules keep working unchanged.
export default function Logo({ size = 26, showWordmark = true, full = false }) {
  return (
    <>
      <LogoMark size={size} title={showWordmark ? undefined : BRAND.name} />
      {showWordmark && (
        <span className="brand-wordmark">
          <span className="brand-wordmark-strong">Scherz Trucking</span>
          {full && <span className="brand-wordmark-sub"> INC</span>}
        </span>
      )}
    </>
  );
}
