"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { buildSnippet, searchTerms } from "@/lib/search/snippet";
import { formatDay, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SearchHit = {
  postId: string;
  batchId: string;
  batchTitle: string;
  brandId: string;
  brandName: string;
  postType: string;
  caption: string;
  slideText: string;
  scheduledOn: string | null;
  createdAt: string;
};

const TYPE_LABEL: Record<string, string> = {
  feed: "Feed",
  story: "Historia",
  carousel: "Carrusel",
};

const ALL = "todas";

/** Segments, never markup: see lib/search/snippet.ts for why that matters. */
function Snippet({ text, terms }: { text: string; terms: string[] }) {
  const segments = buildSnippet(text, terms);
  if (segments.length === 0) return null;

  return (
    <p className="text-sm leading-snug">
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="rounded bg-[color-mix(in_oklch,var(--synera-accent)_28%,transparent)] px-0.5 text-foreground"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export function SearchPanel({
  query,
  brandId,
  brands,
  hits,
  error,
  limit,
}: {
  query: string;
  brandId: string;
  brands: Array<{ id: string; name: string }>;
  hits: SearchHit[];
  error: string | null;
  limit: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(query);
  const [brand, setBrand] = useState(brandId);
  const [pending, startTransition] = useTransition();

  /*
    The query lives in the URL.

    Not for cleverness: a search someone wants to send to a colleague, or come
    back to tomorrow, has to be a link. It also means the results are rendered
    on the server, so the first paint already has them.

    Wrapped in a transition so the search reports itself. Without one, pressing
    Buscar produced no visible change at all until the server answered — the
    route's own loading.tsx does not help here, because this is a searchParam
    change on the SAME segment and React deliberately keeps the current UI
    during a transition rather than falling back. So the button spins and the
    results it is about to replace go quiet.
  */
  function run(nextQuery: string, nextBrand: string) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextBrand && nextBrand !== ALL) params.set("marca", nextBrand);

    startTransition(() => {
      router.push(params.toString() ? `/buscar?${params}` : "/buscar");
    });
  }

  const terms = searchTerms(query);

  return (
    <div className="space-y-6 px-6 py-8 md:px-8">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(draft, brand);
        }}
      >
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="search-q" className="text-xs">
            Buscar
          </Label>
          <Input
            id="search-q"
            value={draft}
            autoFocus
            placeholder='planillas · "presupuesto perdido" · precios -descuento'
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>

        {brands.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="search-brand" className="text-xs">
              Marca
            </Label>
            <Select
              value={brand}
              onValueChange={(next) => {
                setBrand(next);
                // Changing the filter re-runs immediately: nobody expects to
                // press a button after picking from a dropdown.
                run(draft, next);
              }}
            >
              <SelectTrigger id="search-brand" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas las marcas</SelectItem>
                {brands.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          {pending ? "Buscando…" : "Buscar"}
        </Button>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {query.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Escribí lo que buscás. Entiende frases entre comillas y palabras a
          excluir con un guion adelante.
        </p>
      ) : hits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nada coincide con <span className="text-foreground">{query}</span>
          {brand !== ALL ? " en esta marca" : ""}. Probá con menos palabras.
        </p>
      ) : (
        // Dimmed rather than replaced: these are the results for the PREVIOUS
        // query and they stay readable until the new ones arrive, which is the
        // whole reason this is a transition.
        <div
          className={cn(
            "space-y-3 transition-opacity",
            pending && "pointer-events-none opacity-50",
          )}
        >
          <p className="text-xs text-muted-foreground">
            {hits.length} {hits.length === 1 ? "pieza" : "piezas"}
            {/*
              Said out loud rather than truncated in silence: a capped list that
              looks complete is how someone concludes "no lo escribimos nunca".
            */}
            {hits.length >= limit
              ? ` — se muestran las ${limit} más relevantes, puede haber más`
              : ""}
            .
          </p>

          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card glass-card">
            {hits.map((hit) => (
              <Link
                key={hit.postId}
                href={`/contenido/${hit.batchId}`}
                className="block space-y-2 p-4 transition-colors hover:bg-accent"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="text-foreground">{hit.brandName}</span>
                  <span>·</span>
                  <span>{TYPE_LABEL[hit.postType] ?? hit.postType}</span>
                  <span>·</span>
                  <span className="truncate">{hit.batchTitle}</span>
                  <span>·</span>
                  <span>
                    {hit.scheduledOn
                      ? `sale ${formatDay(hit.scheduledOn)}`
                      : formatRelative(hit.createdAt)}
                  </span>
                </div>

                <Snippet text={hit.caption} terms={terms} />

                {/*
                  The on-image copy is shown separately when the match is
                  there and not in the caption — otherwise a search for a
                  headline returns a caption that does not contain the word,
                  which reads like a bug.
                */}
                {hit.slideText ? (
                  <div className="text-muted-foreground">
                    <Snippet text={hit.slideText} terms={terms} />
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
