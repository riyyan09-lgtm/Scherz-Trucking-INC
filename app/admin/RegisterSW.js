"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration only works over HTTPS (or localhost) -- expected to
        // fail silently until this is deployed to a real domain.
      });
    }
  }, []);
  return null;
}
