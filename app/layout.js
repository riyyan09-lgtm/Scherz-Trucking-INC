import { BRAND } from "../lib/brand";
import { SITE_URL } from "../lib/siteUrl";
import "./globals.css";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND.name} — Car Shipping & Auto Transport, City by City`,
    template: `%s | ${BRAND.titleSuffix}`,
  },
  description:
    "Free instant car shipping quotes from licensed, insured auto transport carriers. Door-to-door shipment nationwide, upfront pricing, and a small initial payment reserves your spot.",
  keywords: [
    "car shipping",
    "auto transport",
    "vehicle shipping",
    "car transport company",
    "ship a car",
    "door to door car shipping",
    "open car transport",
    "enclosed car transport",
    "car shipping quote",
    "licensed and insured auto transport",
  ],
  // The SVG mark is the primary icon (crisp at any size, and the only asset
  // carrying the new branding). The legacy PNGs are kept as fallbacks for
  // clients that don't support SVG favicons -- they still show the old mark
  // and want re-exporting from public/logo.svg.
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/logo.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/logo.png",
    shortcut: "/favicon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
