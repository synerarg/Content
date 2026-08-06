"use client";

import { useEffect } from "react";

/*
  Keyboard shortcuts.

  The rule that keeps these from being hostile: a shortcut NEVER fires while
  the user is typing. Every screen here is mostly text fields, so an unguarded
  Ctrl+D would delete a word in a caption instead of duplicating a post — and
  `[` and `]` would be unusable entirely.
*/

export type Shortcut = {
  /** Lowercase `event.key`, or the literal character for punctuation. */
  key: string;
  /** Cmd on macOS, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean;
  label: string;
  description: string;
  run: () => void;
  /**
   * Allow the shortcut even while a text field has focus.
   *
   * Only for chords a text field does not itself claim — Cmd+S and Cmd+Enter
   * are the intended cases, since "save what I am typing" and "generate from
   * what I just typed" are exactly the moments you are in a field.
   */
  whileTyping?: boolean;
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      // metaKey covers macOS, ctrlKey the rest. Accepting either means one
      // definition works on both without asking the platform.
      const mod = event.metaKey || event.ctrlKey;
      const typing = isTyping(event.target);

      for (const shortcut of shortcuts) {
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;
        if (Boolean(shortcut.mod) !== mod) continue;
        if (Boolean(shortcut.shift) !== event.shiftKey) continue;
        if (typing && !shortcut.whileTyping) continue;

        event.preventDefault();
        shortcut.run();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, enabled]);
}

/** "⌘S" on macOS, "Ctrl+S" elsewhere — resolved on the client only. */
export function chordLabel(shortcut: Shortcut): string {
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform ?? "");
  const parts: string[] = [];
  if (shortcut.mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(shortcut.key === " " ? "Espacio" : shortcut.key.toUpperCase());
  return parts.join(isMac ? "" : "+");
}
