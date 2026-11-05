import { useEffect, useState } from "react";

/** Keeps something mounted for `exitMs` after `open` drops, for its exit motion. */
export function usePresence(
  open: boolean,
  exitMs: number,
): { mounted: boolean; closing: boolean } {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open);
  }

  useEffect(() => {
    if (!closing) return undefined;
    const timer = window.setTimeout(() => setClosing(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [closing, exitMs]);

  return { mounted: open || closing, closing };
}
