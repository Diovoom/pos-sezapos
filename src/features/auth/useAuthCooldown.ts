import { useEffect, useState } from "react";

/** Client-side UX cooldown. The server-side limiter remains authoritative. */
export function useAuthCooldown() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  return {
    seconds,
    active: seconds > 0,
    start: (value: number | null | undefined) =>
      setSeconds(Math.max(0, Math.min(24 * 60 * 60, Math.ceil(value ?? 0)))),
  };
}
