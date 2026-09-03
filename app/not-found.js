import Link from "next/link";
import { BRAND } from "../lib/brand";

// Custom not-found (App Router) — replaces Next's internal /_not-found
// prerender, which crashes on this Next 14.2 + React 18.3 combination
// ("<Html> should not be imported outside of pages/_document"). Keeping this
// a plain server component (no client/context) avoids that crash.
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1 style={{ fontSize: 42, margin: 0 }}>404</h1>
      <p style={{ color: "#5b6472", fontSize: 17 }}>
        We couldn&apos;t find that page. It may have moved or never existed.
      </p>
      <Link href="/" style={{ color: "#1f8a82", fontWeight: 600 }}>
        ← Back to {BRAND.name}
      </Link>
    </main>
  );
}
