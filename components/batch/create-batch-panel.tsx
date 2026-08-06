"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
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

export type BrandOption = { id: string; name: string };

export function CreateBatchPanel({ brands }: { brands: BrandOption[] }) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [postCount, setPostCount] = useState("3");
  const [pending, setPending] = useState(false);

  async function handleGenerate() {
    if (brief.trim().length < 8) {
      toast.error("Contame un poco más sobre el lote.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/generate/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          brief,
          postCount: Number(postCount),
        }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Falló la generación.");

      for (const warning of payload.warnings ?? []) {
        toast.warning(warning);
      }
      toast.success(
        `Lote creado: ${payload.posts} piezas, ${payload.slides} placas.`,
      );
      router.push(`/contenido/${payload.batchId}`);
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falló la generación.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--synera-accent)]" />
        <h2 className="text-sm font-semibold">Nuevo lote</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <Label>Marca</Label>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Piezas</Label>
          <Select value={postCount} onValueChange={setPostCount}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="batch-brief">Brief</Label>
        <Textarea
          id="batch-brief"
          rows={3}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="una semana de contenido sobre por qué una pyme necesita ordenar sus clientes"
        />
        <p className="text-xs text-muted-foreground">
          Claude arma las piezas con ángulos distintos del mismo tema, elige
          plantilla y formato, y escribe caption y hashtags para cada una.
        </p>
      </div>

      <Button onClick={handleGenerate} disabled={pending || !brandId}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
        {pending ? "Generando lote…" : "Generar lote"}
      </Button>
    </div>
  );
}
