"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2, Package, Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/app/(app)/marcas/actions";
import {
  prepareProductImage,
  type CutoutOutcome,
  type PreparedProductImage,
} from "@/lib/products/prepare-image";
import { publicAssetUrl, uploadViaSignedUrl } from "@/lib/storage";
import type { BrandProduct } from "@/lib/schemas/product";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/*
  A transparent product on a white card looks identical to an opaque one on a
  white card. The checkerboard is the only way to see, before uploading, whether
  the cut-out actually worked — which is the whole point of showing a preview at
  all.
*/
const CHECKERBOARD =
  "repeating-conic-gradient(color-mix(in oklch, var(--muted) 60%, transparent) 0% 25%, transparent 0% 50%) 50% / 16px 16px";

function cutoutMessage(outcome: CutoutOutcome): string | null {
  switch (outcome.status) {
    case "done":
      return `Fondo recortado (${Math.round(outcome.removedRatio * 100)}% de la imagen). Miralo sobre el damero antes de guardar.`;
    case "already-transparent":
      return "La foto ya venía recortada, así que se dejó como estaba.";
    case "refused":
      return outcome.reason;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Shared: pick a file, prepare it, look at the result
// ---------------------------------------------------------------------------

function ImagePicker({
  prepared,
  onPrepared,
  currentUrl,
  idPrefix,
}: {
  prepared: PreparedProductImage | null;
  onPrepared: (value: PreparedProductImage | null) => void;
  /** Already-stored image, shown until a new file is picked. */
  currentUrl: string | null;
  idPrefix: string;
}) {
  const [working, setWorking] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(false);
  // Kept so toggling the cut-out re-runs against the ORIGINAL pixels. Re-running
  // it over an already-processed image would compound the erosion.
  const [source, setSource] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!prepared) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(prepared.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  async function run(file: File, cut: boolean) {
    setWorking(true);
    try {
      const result = await prepareProductImage(file, { removeBackground: cut });
      onPrepared(result);

      const message = cutoutMessage(result.cutout);
      if (result.cutout.status === "refused") {
        toast.warning(message ?? "No se pudo recortar el fondo.");
      } else if (message) {
        toast.success(message);
      }
    } catch (error) {
      onPrepared(null);
      toast.error(
        error instanceof Error ? error.message : "No se pudo procesar la imagen.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSource(file);
    await run(file, removeBackground);
  }

  async function handleToggle(next: boolean) {
    setRemoveBackground(next);
    if (source) await run(source, next);
  }

  const shown = previewUrl ?? currentUrl;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div
          className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border"
          style={{ background: CHECKERBOARD }}
        >
          {shown ? (
            // A plain <img>: next/image would proxy a bucket asset through the
            // optimizer for no benefit, and this one is a blob: URL half the time.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-contain p-1" />
          ) : (
            <ImageUp className="size-5 text-muted-foreground" />
          )}
        </div>

        <div className="space-y-2">
          <Button asChild variant="outline" size="sm" disabled={working}>
            <label className="cursor-pointer">
              {working ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImageUp className="size-4" />
              )}
              {working ? "Procesando…" : shown ? "Cambiar foto" : "Subir foto"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={handleFile}
                disabled={working}
              />
            </label>
          </Button>

          <p className="text-xs text-muted-foreground">
            JPG, PNG o WEBP. Se achica sola a 1600px: podés subir la foto del
            celular tal cual.
          </p>

          {prepared ? (
            <p className="text-xs text-muted-foreground">
              {prepared.width}×{prepared.height} ·{" "}
              {Math.round(prepared.file.size / 1024)} KB ·{" "}
              {prepared.hasTransparency ? "con fondo recortado" : "sin recortar"}
            </p>
          ) : null}
        </div>
      </div>

      <label
        className="flex items-center gap-2 text-sm"
        htmlFor={`${idPrefix}-cutout`}
      >
        <input
          id={`${idPrefix}-cutout`}
          type="checkbox"
          className="size-4 accent-[var(--synera-accent)]"
          checked={removeBackground}
          disabled={working || !source}
          onChange={(event) => handleToggle(event.target.checked)}
        />
        <Scissors className="size-3.5 text-muted-foreground" />
        Recortar el fondo
        <HelpTip label="Sobre el recorte de fondo">
          Sólo funciona con fotos sobre fondo liso: borra el color que rodea al
          producto hacia adentro. Si la foto es sobre un escritorio o una mano,
          va a avisarte que no puede y conviene subirla ya recortada en PNG.
        </HelpTip>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

function AddProduct({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prepared, setPrepared] = useState<PreparedProductImage | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!prepared) {
      toast.error("Subí una foto del producto.");
      return;
    }
    if (!name.trim()) {
      toast.error("El producto necesita un nombre.");
      return;
    }

    setSaving(true);
    try {
      // Uploaded at SAVE time, not when the file is picked. Toggling the cut-out
      // twice and then changing your mind would otherwise leave two orphaned
      // objects in the bucket for a product that never existed.
      const path = await uploadViaSignedUrl(prepared.file, {
        kind: "product",
        filename: prepared.file.name,
        brandId,
      });

      const result = await createProduct(brandId, {
        name: name.trim(),
        description: description.trim(),
        image_path: path,
        has_transparency: prepared.hasTransparency,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setName("");
      setDescription("");
      setPrepared(null);
      toast.success("Producto agregado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falló la subida.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Package className="size-4 text-[var(--synera-accent)]" />
        <h2 className="text-sm font-semibold">Agregar producto</h2>
      </div>

      <ImagePicker
        idPrefix="new-product"
        prepared={prepared}
        onPrepared={setPrepared}
        currentUrl={null}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="product-name">Nombre</Label>
          <Input
            id="product-name"
            value={name}
            maxLength={120}
            placeholder="Botella 500 ml"
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="product-description">
            Qué es
            <HelpTip label="Para qué se usa esta descripción">
              La lee el generador de textos, no el diseño. Contá qué hace el
              producto y para quién es: sin esto, las piezas sólo pueden hablar
              de la foto.
            </HelpTip>
          </Label>
          <Textarea
            id="product-description"
            rows={3}
            value={description}
            maxLength={2000}
            placeholder="Aceite de oliva extra virgen, primera prensada en frío, de Mendoza."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || !prepared}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Package className="size-4" />}
        {saving ? "Guardando…" : "Agregar producto"}
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ProductRow({
  brandId,
  product,
}: {
  brandId: string;
  product: BrandProduct;
}) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [prepared, setPrepared] = useState<PreparedProductImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const initial = useRef({ name: product.name, description: product.description });
  const dirty =
    name !== initial.current.name ||
    description !== initial.current.description ||
    prepared !== null;

  async function handleSave() {
    setSaving(true);
    try {
      let imagePath = product.imagePath;
      let hasTransparency = product.hasTransparency;

      if (prepared) {
        // A replacement lands on a new path and the old object is left alone —
        // pieces already exported against it keep resolving, and the public
        // bucket is CDN-cached besides.
        imagePath = await uploadViaSignedUrl(prepared.file, {
          kind: "product",
          filename: prepared.file.name,
          brandId,
        });
        hasTransparency = prepared.hasTransparency;
      }

      const result = await updateProduct(product.id, {
        name: name.trim(),
        description: description.trim(),
        image_path: imagePath,
        has_transparency: hasTransparency,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      initial.current = { name: name.trim(), description: description.trim() };
      setPrepared(null);
      toast.success("Producto actualizado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deleteProduct(product.id);
      setConfirming(false);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Producto eliminado.");
      router.refresh();
    } catch (cause) {
      // In `finally`, so a throw does not leave the confirm dialog stuck on a
      // disabled, spinning "Eliminando…" with no way out but a reload.
      toast.error(
        cause instanceof Error ? cause.message : "No se pudo eliminar el producto.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">{product.name}</h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Eliminar ${product.name}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <ImagePicker
        idPrefix={`product-${product.id}`}
        prepared={prepared}
        onPrepared={setPrepared}
        currentUrl={publicAssetUrl(product.imagePath)}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`name-${product.id}`}>Nombre</Label>
          <Input
            id={`name-${product.id}`}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`description-${product.id}`}>Qué es</Label>
          <Textarea
            id={`description-${product.id}`}
            rows={3}
            value={description}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      {dirty ? (
        <Button variant="secondary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Guardar cambios
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        pending={deleting}
        title={`¿Eliminar ${product.name}?`}
        description="Las piezas que ya lo usan mantienen su texto y su fondo, pero dejan de mostrar el producto."
        confirmLabel={deleting ? "Eliminando…" : "Eliminar"}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ProductPanel({
  brandId,
  products,
}: {
  brandId: string;
  products: BrandProduct[];
}) {
  return (
    <div className="space-y-8 px-6 py-8 md:px-8">
      <AddProduct brandId={brandId} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Productos cargados ({products.length})
        </h2>

        {products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no hay productos. Cargá uno y vas a poder generar piezas con
            la foto real del producto en vez de una imagen inventada.
          </p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {products.map((product) => (
              <ProductRow key={product.id} brandId={brandId} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
