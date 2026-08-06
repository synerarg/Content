"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBrand } from "@/app/(app)/marcas/actions";
import { publicAssetUrl } from "@/lib/storage";
import { recordToPalette } from "@/lib/schemas/brand";
import { Button } from "@/components/ui/button";
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

  const logoUrl = publicAssetUrl(brand.logo_path);
  const tokens = recordToPalette(brand.palette).slice(0, 6);

  async function handleDelete() {
    if (
      !window.confirm(
        `¿Eliminar "${brand.name}"? Se borran también sus tipografías y contenido asociado.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    const result = await deleteBrand(brand.id);
    setDeleting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("Marca eliminada.");
    router.refresh();
  }

  return (
    <div className="group relative rounded-xl border border-border bg-card p-5 transition-colors hover:border-[color-mix(in_oklch,var(--synera-accent)_30%,transparent)]">
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
            <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
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
            <span className="text-sm font-semibold text-muted-foreground">
              {brand.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <h3 className="font-medium leading-none">{brand.name}</h3>
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
