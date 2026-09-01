"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/*
  Error boundary for every route under the app shell.

  Placed at the group root rather than per route: each page here fails the same
  handful of ways — Supabase unreachable, a policy denying a read, a provider
  timing out — and none of them warrant different copy. The boundary sits INSIDE
  (app)/layout.tsx, so the sidebar survives the error and the user can navigate
  away instead of hitting a dead end.

  Next.js strips the real message in production and leaves only `digest`, which
  correlates with the server log. Both are shown: the message is genuinely useful
  in development, and the digest is the only thing worth quoting in a bug report.
*/
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <span className="mb-5 flex size-11 items-center justify-center rounded-full border border-destructive/30 bg-accent">
        <TriangleAlert className="size-5 text-destructive" />
      </span>

      <h2 className="text-base font-medium">Algo se rompió acá</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        No se pudo cargar esta pantalla. Puede ser una caída momentánea de la
        base o de un proveedor de generación.
      </p>

      {error.message ? (
        <p className="mt-4 max-w-lg break-words rounded-md border border-border bg-muted px-3 py-2 text-left font-mono text-xs text-muted-foreground">
          {error.message}
        </p>
      ) : null}

      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          digest {error.digest}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCw className="size-4" />
          Reintentar
        </Button>
        <Button asChild variant="ghost">
          <Link href="/contenido">Ir a Contenido</Link>
        </Button>
      </div>
    </div>
  );
}
