"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { toObjectUrl } from "@/lib/export/rasterize";
import { formatCostUsd } from "@/lib/ai/pricing";
import type { FormatKey } from "@/templates/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ImageResponse = {
  path: string;
  signedUrl: string;
  seed: number | null;
  megapixels: number;
  prompt: string;
  costUsd: number | null;
  durationMs: number;
};

export function BackgroundPanel({
  brandId,
  format,
  templateSlug,
  suggestedScene,
  backgroundUrl,
  onBackgroundChange,
}: {
  brandId: string;
  format: FormatKey;
  templateSlug: string;
  suggestedScene: string;
  backgroundUrl: string | null;
  onBackgroundChange: (url: string | null) => void;
}) {
  const [scene, setScene] = useState("");
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<ImageResponse | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Revoke the previous blob when it is replaced or the panel unmounts.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const effectiveScene = scene.trim() || suggestedScene.trim();

  async function generate(reuseSeed: boolean) {
    if (effectiveScene.length < 4) {
      toast.error("Describí la escena o generá primero el texto.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          brief: effectiveScene,
          format,
          templateSlug,
          seed: reuseSeed ? (last?.seed ?? null) : null,
        }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Falló la generación.");

      const result = payload as ImageResponse;

      // The signed URL is a different origin. Rendering it directly would taint
      // the canvas and make the PNG export throw SecurityError, so it becomes a
      // same-origin blob before it ever reaches the template.
      const blobUrl = await toObjectUrl(result.signedUrl);

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = blobUrl;

      setLast(result);
      onBackgroundChange(blobUrl);
      toast.success("Fondo generado.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falló la generación.");
    } finally {
      setPending(false);
    }
  }

  function clear() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLast(null);
    onBackgroundChange(null);
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <ImageIcon className="size-4 text-[var(--synera-accent)]" />
        <h2 className="text-sm font-semibold">Fondo</h2>
      </div>

      <div className="space-y-2">
        <Label htmlFor="scene">Escena</Label>
        <Input
          id="scene"
          value={scene}
          onChange={(event) => setScene(event.target.value)}
          placeholder={suggestedScene || "un taller mecánico al atardecer"}
        />
        <p className="text-xs text-muted-foreground">
          Se combina con la dirección de arte de la marca. El modelo genera solo
          imagen: las directivas de &ldquo;sin texto, sin letras, sin
          logos&rdquo; van siempre, no hace falta escribirlas.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Secondary for the same reason as GeneratePanel: the export is the
            screen's single primary CTA. */}
        <Button
          variant="secondary"
          onClick={() => generate(false)}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImageIcon className="size-4" />
          )}
          {pending ? "Generando…" : backgroundUrl ? "Generar otro" : "Generar fondo"}
        </Button>

        {last ? (
          <Button
            variant="outline"
            onClick={() => generate(true)}
            disabled={pending}
            title="Mismo seed: mantiene el estilo y varía poco"
          >
            <RefreshCw className="size-4" />
            Misma línea
          </Button>
        ) : null}

        {backgroundUrl ? (
          <Button variant="ghost" onClick={clear} disabled={pending}>
            <X className="size-4" />
            Quitar
          </Button>
        ) : null}
      </div>

      {last ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
          <span>{formatCostUsd(last.costUsd)}</span>
          <span>{(last.durationMs / 1000).toFixed(1)}s</span>
          <span>{last.megapixels} MP</span>
          {last.seed !== null ? <span>seed {last.seed}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
