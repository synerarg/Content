"use client";

import { useState } from "react";
import { ImageUp, X } from "lucide-react";
import { toast } from "sonner";
import { publicAssetUrl, uploadViaSignedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 2 * 1024 * 1024;

export function LogoUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const previewUrl = publicAssetUrl(value);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_BYTES) {
      toast.error("El logo no puede superar los 2 MB.");
      return;
    }

    setUploading(true);
    try {
      const path = await uploadViaSignedUrl(file, {
        kind: "logo",
        filename: file.name,
      });
      onChange(path);
      toast.success("Logo subido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falló la subida.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
        {previewUrl ? (
          // Deliberately a plain <img>: next/image would proxy this through the
          // optimizer, and brand assets are already sized and served from our
          // own bucket.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Logo de la marca"
            className="size-full object-contain p-2"
          />
        ) : (
          <ImageUp className="size-5 text-muted-foreground" />
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" disabled={uploading}>
            <label className="cursor-pointer">
              {uploading ? "Subiendo…" : "Subir logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={handleFile}
                disabled={uploading}
              />
            </label>
          </Button>

          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
            >
              <X className="size-4" />
              Quitar
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, WEBP o SVG. Máximo 2 MB.
        </p>
      </div>
    </div>
  );
}
