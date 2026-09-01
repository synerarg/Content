"use client";

import { useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { notifyError, readErrorPayload } from "@/lib/notify";
import { formatCostUsd } from "@/lib/ai/pricing";
import { FORMATS, FORMAT_KEYS, type FormatKey } from "@/templates/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type GenerationResponse = {
  templateSlug: string;
  format: FormatKey;
  slots: Record<string, string>;
  caption: string;
  hashtags: string[];
  rationale: string;
  warnings: string[];
  costUsd: number | null;
  durationMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

export function GeneratePanel({
  brandId,
  brief,
  onBriefChange,
  onGenerated,
}: {
  brandId: string;
  /** Lifted so the background panel can reuse it as the default scene. */
  brief: string;
  onBriefChange: (value: string) => void;
  onGenerated: (result: GenerationResponse) => void;
}) {
  const [format, setFormat] = useState<FormatKey | "auto">("auto");
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<GenerationResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleGenerate() {
    if (brief.trim().length < 8) {
      toast.error("Contame un poco más sobre el posteo.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);

    try {
      const res = await fetch("/api/generate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          brandId,
          brief,
          format: format === "auto" ? null : format,
        }),
      });

      if (!res.ok) {
        notifyError(null, {
          payload: await readErrorPayload(res),
          retry: handleGenerate,
        });
        return;
      }

      const result = (await res.json()) as GenerationResponse;
      setLast(result);
      onGenerated(result);

      for (const warning of result.warnings) {
        toast.warning(warning);
      }
      toast.success("Contenido generado.");
    } catch (cause) {
      notifyError(cause, { retry: handleGenerate });
    } finally {
      abortRef.current = null;
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card glass-card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--synera-accent)]" />
        <h2 className="text-sm font-semibold">Generar con IA</h2>
      </div>

      <div className="space-y-2">
        <Label htmlFor="brief">Brief</Label>
        <Textarea
          id="brief"
          rows={3}
          value={brief}
          onChange={(event) => onBriefChange(event.target.value)}
          placeholder="post sobre por qué un CRM le sirve a una pyme"
        />
        <p className="text-xs text-muted-foreground">
          Claude escribe el copy, elige la plantilla y arma el caption con el tono
          de la marca. Después podés editar todo.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="w-44 space-y-2">
          <Label>Formato</Label>
          <Select
            value={format}
            onValueChange={(value) => setFormat(value as FormatKey | "auto")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Que elija Claude</SelectItem>
              {FORMAT_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {FORMATS[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/*
          Secondary, not primary. /editor's one cyan CTA is "Exportar PNG" —
          the screen's terminal action. Generating copy and generating a
          background are steps toward it, and three filled cyan buttons stacked
          down one column is precisely the large-fill use the design language
          rules out.
        */}
        <Button
          variant="secondary"
          onClick={handleGenerate}
          disabled={pending}
          className="flex-1"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {pending ? "Escribiendo el copy…" : "Generar"}
        </Button>

        {pending ? (
          <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
            <X className="size-4" />
            Cancelar
          </Button>
        ) : null}
      </div>

      {last ? (
        <div className="space-y-2 border-t border-border pt-3">
          {last.rationale ? (
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground">Por qué esa plantilla: </span>
              {last.rationale}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>{formatCostUsd(last.costUsd)}</span>
            <span>{(last.durationMs / 1000).toFixed(1)}s</span>
            <span>
              {last.usage.inputTokens}in / {last.usage.outputTokens}out
            </span>
            {last.usage.cacheReadTokens > 0 ? (
              <span className="text-[var(--synera-accent)]">
                {last.usage.cacheReadTokens} cacheados
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
