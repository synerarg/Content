"use client";

import { useState } from "react";
import { chordLabel, useShortcuts, type Shortcut } from "@/lib/shortcuts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * The "?" cheat sheet.
 *
 * Takes the SAME array the screen registers, so the list can never drift from
 * what actually works — a documented shortcut that does nothing is worse than
 * an undocumented one.
 */
export function ShortcutOverlay({ shortcuts }: { shortcuts: Shortcut[] }) {
  const [open, setOpen] = useState(false);

  useShortcuts([
    {
      key: "?",
      shift: true,
      label: "Atajos",
      description: "Muestra esta lista",
      run: () => setOpen((current) => !current),
    },
  ]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Atajos de teclado"
      description="Ninguno se dispara mientras estás escribiendo en un campo, salvo guardar y generar."
      confirmLabel="Entendido"
      cancelLabel="Cerrar"
      onConfirm={() => setOpen(false)}
    >
      <ul className="divide-y divide-border">
        {shortcuts.map((shortcut) => (
          <li
            key={`${shortcut.key}-${shortcut.mod}-${shortcut.shift}`}
            className="flex items-center justify-between gap-4 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm">{shortcut.label}</p>
              <p className="text-xs text-muted-foreground">
                {shortcut.description}
              </p>
            </div>
            <kbd className="shrink-0 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs">
              {chordLabel(shortcut)}
            </kbd>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
