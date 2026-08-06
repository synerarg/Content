"use client";

import { Plus, X } from "lucide-react";
import { contrastGrade, contrastRatio, normalizeHex } from "@/lib/color";
import { REQUIRED_TOKENS, type ColorToken } from "@/lib/schemas/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Pairs worth grading. Keys that are absent are simply skipped. */
const CONTRAST_PAIRS: Array<{ fg: string; bg: string; label: string }> = [
  { fg: "fg", bg: "bg", label: "Texto sobre fondo" },
  { fg: "on-primary", bg: "primary", label: "Texto sobre primario" },
  { fg: "fg", bg: "surface", label: "Texto sobre superficie" },
];

function ContrastRow({
  label,
  fgValue,
  bgValue,
}: {
  label: string;
  fgValue: string;
  bgValue: string;
}) {
  const ratio = contrastRatio(fgValue, bgValue);
  if (ratio === null) return null;

  const grade = contrastGrade(ratio);
  const failing = grade === "Insuficiente";

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded border border-border text-[10px] font-semibold"
          style={{ background: bgValue, color: fgValue }}
        >
          Aa
        </span>
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-xs tabular-nums">
          {ratio.toFixed(2)}:1
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            failing
              ? "bg-destructive/15 text-destructive"
              : "bg-[color-mix(in_oklch,var(--synera-accent)_15%,transparent)] text-[var(--synera-accent)]",
          )}
        >
          {grade}
        </span>
      </div>
    </div>
  );
}

export function PaletteEditor({
  value,
  onChange,
  error,
}: {
  value: ColorToken[];
  onChange: (tokens: ColorToken[]) => void;
  error?: string;
}) {
  const byKey = new Map(value.map((token) => [token.key.toLowerCase(), token.value]));

  function update(index: number, patch: Partial<ColorToken>) {
    onChange(value.map((token, i) => (i === index ? { ...token, ...patch } : token)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...value, { key: "", value: "#000000" }]);
  }

  const activePairs = CONTRAST_PAIRS.filter(
    (pair) => byKey.has(pair.fg) && byKey.has(pair.bg),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {value.map((token, index) => {
          const isRequired = (REQUIRED_TOKENS as readonly string[]).includes(
            token.key.toLowerCase(),
          );
          const swatch = normalizeHex(token.value) ?? "#000000";

          return (
            <div key={index} className="flex items-center gap-2">
              <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border">
                <span
                  className="block size-full"
                  style={{ background: swatch }}
                  aria-hidden
                />
                <input
                  type="color"
                  aria-label={`Color de ${token.key || "token"}`}
                  value={swatch}
                  onChange={(event) => update(index, { value: event.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>

              <Input
                aria-label="Nombre del token"
                value={token.key}
                onChange={(event) => update(index, { key: event.target.value })}
                placeholder="primary"
                className="flex-1 font-mono text-sm"
                readOnly={isRequired}
              />

              <Input
                aria-label="Valor hex"
                value={token.value}
                onChange={(event) => update(index, { value: event.target.value })}
                placeholder="#84E9FF"
                className="w-32 font-mono text-sm uppercase"
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                disabled={isRequired}
                title={
                  isRequired
                    ? "Token obligatorio: las plantillas lo necesitan para renderizar"
                    : "Quitar token"
                }
              >
                <X className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" />
        Agregar token
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {activePairs.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <Label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
            Contraste
          </Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Se mide con WCAG 2.1. Un titular grande pasa con 3:1; el texto chico
            necesita 4.5:1.
          </p>
          {activePairs.map((pair) => (
            <ContrastRow
              key={pair.label}
              label={pair.label}
              fgValue={byKey.get(pair.fg)!}
              bgValue={byKey.get(pair.bg)!}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
