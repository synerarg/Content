"use client";

import { GOOGLE_FONTS, weightsFor } from "@/lib/fonts/google-fonts";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TypographyRole = {
  family: string;
  weight: number;
  source: "google" | "upload";
};

const CATEGORY_LABELS: Record<string, string> = {
  sans: "Sans serif",
  serif: "Serif",
  display: "Display",
};

function RoleFields({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: TypographyRole;
  onChange: (role: TypographyRole) => void;
}) {
  const weights = weightsFor(value.family);

  const grouped = Object.entries(
    GOOGLE_FONTS.reduce<Record<string, typeof GOOGLE_FONTS>>((acc, font) => {
      (acc[font.category] ??= []).push(font);
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <Label className="text-sm">{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Select
          value={value.family}
          onValueChange={(family) => {
            const available = weightsFor(family);
            // Carry the weight over when the new family supports it; otherwise
            // fall back to the closest one so the field is never invalid.
            const weight = available.includes(value.weight)
              ? value.weight
              : available.reduce((best, w) =>
                  Math.abs(w - value.weight) < Math.abs(best - value.weight) ? w : best,
                );
            onChange({ ...value, family, weight, source: "google" });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Elegí una tipografía" />
          </SelectTrigger>
          <SelectContent>
            {grouped.map(([category, fonts]) => (
              <div key={category}>
                <div className="px-2 py-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABELS[category] ?? category}
                </div>
                {fonts.map((font) => (
                  <SelectItem key={font.family} value={font.family}>
                    {font.family}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(value.weight)}
          onValueChange={(weight) => onChange({ ...value, weight: Number(weight) })}
        >
          <SelectTrigger className="sm:w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {weights.map((weight) => (
              <SelectItem key={weight} value={String(weight)}>
                {weight}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function TypographyPicker({
  value,
  onChange,
}: {
  value: { display: TypographyRole; body: TypographyRole };
  onChange: (next: { display: TypographyRole; body: TypographyRole }) => void;
}) {
  return (
    <div className="space-y-3">
      <RoleFields
        label="Display"
        hint="Titulares sobre la imagen. Tiene que aguantar tamaños grandes."
        value={value.display}
        onChange={(display) => onChange({ ...value, display })}
      />
      <RoleFields
        label="Body"
        hint="Bajadas, listas y CTA. Priorizá legibilidad."
        value={value.body}
        onChange={(body) => onChange({ ...value, body })}
      />
      <p className="text-xs text-muted-foreground">
        Al guardar, los archivos .woff2 se descargan y quedan alojados en tu
        Storage. Es lo que garantiza que el PNG exportado use la tipografía real
        y no una de sistema.
      </p>
    </div>
  );
}
