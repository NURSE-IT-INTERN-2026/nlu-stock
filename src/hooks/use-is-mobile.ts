"use client";

import { useEffect, useState } from "react";

// ponytail: one breakpoint (md) drives every mobile-only UI branch (loadMore vs numbered,
// stacked vs table). Centralised so list pages don't each redeclare a matchMedia effect.
const MD = 768;

export function useIsMobile(maxWidth = MD - 1) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [maxWidth]);
  return isMobile;
}
