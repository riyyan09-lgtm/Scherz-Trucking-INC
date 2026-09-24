"use client";
import Link from "next/link";
import { BRAND } from "../lib/brand";

export default function Error({ error, reset }) {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1 style={{ fontSize: 38, margin: 0 }}>Something went wrong</h1>
      <p style={{ color: "#5b6472", fontSize: 17 }}>
        {error?.message || "An unexpected error occurred. You can try again, or head back to the homepage."}
      </p>
      {error && (
        <details style={{ marginTop: 12, background: "#f5f5f5", borderRadius: 6, padding: 12, fontFamily: "monospace", fontSize: 13, textAlign: "left", color: "#333" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Error details</summary>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{error?.stack || "No stack available"}</div>
        </details>
      )}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16 }}>
        <button onClick={reset} style={{ cursor: "pointer", padding: "10px 18px", borderRadius: 8, border: "1px solid #e3e7ee", background: "#fff", fontWeight: 600 }}>
          Try again
        </button>
        <Link href="/" style={{ color: "#1f8a82", fontWeight: 600, alignSelf: "center" }}>
          {"← Back to " + BRAND.name}
        </Link>
      </div>
    </main>
  );
}
