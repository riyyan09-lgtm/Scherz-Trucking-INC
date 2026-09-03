"use client";
import Link from "next/link";
import { BRAND } from "../lib/brand";

// Custom error boundary (App Router) — replaces Next's internal /_error (500)
// prerender, which crashes on this Next 14.2 + React 18.3 combination.
// Plain server component: no client/context, so it prerenders cleanly.
export const dynamic = "force-dynamic";

export default function Error({ reset }) {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1 style={{ fontSize: 38, margin: 0 }}>Something went wrong</h1>
      <p style={{ color: "#5b6472", fontSize: 17 }}>
        An unexpected error occurred. You can try again, or head back to the homepage.
      </p>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16 }}>
        <button onClick={reset} style={{ cursor: "pointer", padding: "10px 18px", borderRadius: 8, border: "1px solid #e3e7ee", background: "#fff", fontWeight: 600 }}>
          Try again
        </button>
        <Link href="/" style={{ color: "#1f8a82", fontWeight: 600, alignSelf: "center" }}>
          ← Back to {BRAND.name}
        </Link>
      </div>
    </main>
  );
}
