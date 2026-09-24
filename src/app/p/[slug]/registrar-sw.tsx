"use client";

import { useEffect } from "react";

/** Registra el service worker para que la app sea instalable y muestre una pantalla sin conexión. */
export function RegistrarServiceWorker({ scope }: { scope: string }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope }).catch(() => {});
    }
  }, [scope]);
  return null;
}
