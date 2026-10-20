"use client";

import { useEffect, useState } from "react";
import { zonedNow, type ZonedNow } from "@/lib/time/zoned";

/** "Ahora" en la zona del comercio. Arranca con el valor del server y se refresca cada 30 s. */
export function useZonedNow(timeZone: string, initial: ZonedNow): ZonedNow {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const tick = () =>
      setNow((prev) => {
        const next = zonedNow(timeZone);
        return prev.date === next.date && prev.minutes === next.minutes ? prev : next;
      });
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [timeZone]);
  return now;
}
