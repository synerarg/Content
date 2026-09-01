"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyPlus, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBrand, duplicateBrand } from "@/app/(app)/marcas/actions";
import { notifyError } from "@/lib/notify";
import { publicAssetUrl } from "@/lib/storage";
import { recordToPalette } from "@/lib/schemas/brand";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type BrandCardData = {
  id: string;
  name: string;
  tagline: string | null;
  logo_path: string | null;
  palette: unknown;
};

export function BrandCard({ brand }: { brand: BrandCardData }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");

  /*
    Deleting a brand cascades to its fonts, its published history and every
    batch made with it — the most destructive action in the app, and the only
    one that asks you to type the name. A batch gets the softer confirm because
    a batch is an afternoon's work; a brand is the client.
  */
  const canDelete = typed.trim().toLowerCase() === brand.name.trim().toLowerCase();

  const logoUrl = publicAssetUrl(brand.logo_path);
  const tokens = recordToPalette(brand.palette).slice(0, 6);

  /*
    The `finally` is the point.

    A server action returns a result object for the failures it anticipates, but
    it can still THROW — the tab going offline mid-call is the ordinary case.
    With the reset written inline after the await, that throw skipped it and
    left the dialog open with a permanently disabled, permanently spinning
    "Eliminando…" button and no way back except a reload.
  */
  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deleteBrand(brand.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setConfirmOpen(false);
      toast.success("Marca eliminada.");
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "No se pudo eliminar la marca.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group relative rounded-2xl border border-border bg-card glass-card p-5 transition-colors hover:border-[color-mix(in_oklch,var(--synera-accent)_30%,transparent)]">
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setTyped("");
        }}
        title={`Eliminar "${brand.name}"`}
        description={
          <>
            Se eliminan también sus tipografías, su historial publicado y todo
            el contenido generado con esta marca. No se puede deshacer.
          </>
        }
        confirmLabel={deleting ? "Eliminando…" : "Eliminar la marca"}
        destructive
        pending={deleting || !canDelete}
        onConfirm={handleDelete}
      >
        <div className="space-y-2">
          <Label htmlFor={`confirm-${brand.id}`} className="text-xs">
            Escribí <span className="text-foreground">{brand.name}</span> para
            confirmar
          </Label>
          <Input
            id={`confirm-${brand.id}`}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
            placeholder={brand.name}
          />
        </div>
      </ConfirmDialog>

      <div className="absolute right-3 top-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              disabled={deleting}
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Acciones</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={async () => {
                const result = await duplicateBrand(brand.id);
                if (!result.ok) {
                  notifyError(new Error(result.error));
                  return;
                }
                toast.success("Marca duplicada.");
                router.push(`/marcas/${result.id}`);
                router.refresh();
              }}
            >
              <CopyPlus className="size-4" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link href={`/marcas/${brand.id}`} className="block space-y-4">
        <div className="flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="size-full object-contain p-1.5"
            />
          ) : (
            <span className="eyebrow">
              {brand.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <h3 className="truncate font-medium leading-none">{brand.name}</h3>
          {brand.tagline ? (
            <p className="line-clamp-1 text-sm text-muted-foreground">
              {brand.tagline}
            </p>
          ) : null}
        </div>

        <div className="flex gap-1.5">
          {tokens.map((token) => (
            <span
              key={token.key}
              title={`${token.key} ${token.value}`}
              className="size-5 rounded-full border border-border"
              style={{ background: token.value }}
            />
          ))}
        </div>
      </Link>
    </div>
  );
}
