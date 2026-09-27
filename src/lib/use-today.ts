import { useEffect, useMemo, useState } from "react";
import { localDateKey } from "@/lib/precog/dates";

/**
 * The owner's local calendar day, as a Date at local midnight. Re-read every
 * minute, so a screen left open overnight rolls over to the new day.
 */
export function useToday(): Date {
  const [key, setKey] = useState(() => localDateKey(new Date()));

  useEffect(() => {
    const update = () => {
      const next = localDateKey(new Date());
      setKey((current) => (current === next ? current : next));
    };
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return useMemo(() => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [key]);
}
