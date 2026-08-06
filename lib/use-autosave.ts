"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  Debounced autosave with a visible status.

  Replaces saving on blur, which loses the field you are still typing in if you
  navigate away or close the tab — and gives no indication either way. The
  heuristics spec asks for both halves: a 2 s debounce and a persistent
  "Guardado" / "Guardando…" near the title.

  Saves are keyed, so several fields can be in flight at once and each one's
  latest value wins. Keying by slide+slot rather than one global timer means
  editing a caption does not delay the headline you typed five seconds ago.
*/

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 2000;

/** How long "Guardado" stays up before fading back to idle. */
const SAVED_LINGER_MS = 2500;

export function useAutosave() {
  const [status, setStatus] = useState<SaveStatus>("idle");

  /*
    The save function is stored beside its timer, not just the timer.

    `flushAll` (Ctrl+S) has to be able to run work it was never handed — it
    knows only that something is pending, not what. Keeping the thunk here is
    what lets "guardar ahora" mean all of it rather than one field.
  */
  const timers = useRef(
    new Map<
      string,
      { timer: ReturnType<typeof setTimeout>; save: () => Promise<boolean> }
    >(),
  );
  const inFlight = useRef(0);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing on unmount is what stops a save firing into a component that is
  // gone, and stops the "Guardado" timer leaking.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const run = useCallback(async (key: string, save: () => Promise<boolean>) => {
    timers.current.delete(key);
    inFlight.current++;
    setStatus("saving");

    let ok = false;
    try {
      ok = await save();
    } catch {
      ok = false;
    } finally {
      inFlight.current--;
    }

    // Only the last save standing gets to declare the whole form settled.
    if (inFlight.current > 0) return;

    if (!ok) {
      setStatus("error");
      return;
    }

    setStatus("saved");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => {
      setStatus((current) => (current === "saved" ? "idle" : current));
    }, SAVED_LINGER_MS);
  }, []);

  /** Queue a save for `key`, replacing any save already waiting for it. */
  const schedule = useCallback(
    (key: string, save: () => Promise<boolean>) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing.timer);

      setStatus("pending");
      timers.current.set(key, {
        timer: setTimeout(() => void run(key, save), DEBOUNCE_MS),
        save,
      });
    },
    [run],
  );

  /**
   * Run everything waiting, right now.
   *
   * Called on blur so leaving a field commits it immediately rather than
   * waiting out the debounce — the debounce is there to avoid a write per
   * keystroke, not to delay a decision the user has already made.
   */
  const flush = useCallback(
    (key: string, save: () => Promise<boolean>) => {
      const existing = timers.current.get(key);
      if (!existing) return;
      clearTimeout(existing.timer);
      void run(key, save);
    },
    [run],
  );

  /** Commit everything waiting. Bound to Ctrl+S. */
  const flushAll = useCallback(() => {
    // Snapshotted before iterating: `run` deletes from this map as it goes.
    const entries = [...timers.current.entries()];
    for (const [key, entry] of entries) {
      clearTimeout(entry.timer);
      void run(key, entry.save);
    }
  }, [run]);

  return { status, schedule, flush, flushAll };
}
