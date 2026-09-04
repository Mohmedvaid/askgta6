"use client";

import Script from "next/script";
import { useEffect, useId, useRef } from "react";

/**
 * The Turnstile widget, rendered explicitly rather than by class name scanning, so
 * it works inside a form React may unmount and remount.
 *
 * Renders nothing at all when the flag is off, which is what keeps the whole
 * feature a single environment variable away from being reverted. The server never
 * trusts this component: lib/turnstile.ts verifies the token it produces.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

export function Turnstile() {
  // Read here rather than passed down. Both are NEXT_PUBLIC, so Next inlines them
  // into the client bundle, and threading two props through four call sites to say
  // the same thing everywhere would be noise. lib/turnstile.ts reads the same two
  // on the server, plus the secret, which never crosses over.
  const enabled = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  const holder = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const id = useId();

  useEffect(() => {
    if (!enabled || !siteKey) return;

    let cancelled = false;

    const render = () => {
      if (cancelled || !holder.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(holder.current, { sitekey: siteKey, theme: "auto" });
    };

    // The script may already be there from a previous page in the same session.
    render();
    const timer = window.setInterval(render, 200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [enabled, siteKey]);

  if (!enabled || !siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="lazyOnload"
      />
      <div ref={holder} id={`turnstile-${id}`} className="min-h-[65px]" />
    </>
  );
}
