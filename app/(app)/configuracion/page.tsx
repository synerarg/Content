import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { StatTile } from "@/components/config/stat-tile";
import {
  EnvironmentStatus,
  type Integration,
} from "@/components/config/environment-status";
import {
  UsageBreakdown,
  type BreakdownRow,
} from "@/components/config/usage-breakdown";
import {
  RecentCalls,
  type RecentCall,
} from "@/components/config/recent-calls";
import { formatCostUsd } from "@/lib/ai/pricing";
import { formatCount, formatDay } from "@/lib/format";
import { GENERATION_MODEL } from "@/lib/ai/generate-post";

const RECENT_LIMIT = 20;
const RECENT_WINDOW_DAYS = 30;

/**
 * Which image provider a generation request would actually use right now.
 *
 * Mirrors getImageProvider()'s resolution order exactly. Duplicated rather than
 * imported because that module is `server-only` AND constructs a provider,
 * which throws when its key is missing — precisely the state this panel exists
 * to report. Reading the same env vars is the cheaper coupling.
 */
function resolveImageProvider(): "google" | "fal" {
  const requested = process.env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (requested === "fal") return "fal";
  if (requested === "google" || requested === "gemini") return "google";
  if (process.env.GEMINI_API_KEY) return "google";
  if (process.env.FAL_KEY) return "fal";
  return "google";
}

function buildIntegrations(): Integration[] {
  const imageProvider = resolveImageProvider();
  const geminiModel =
    process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";

  return [
    {
      name: "Supabase",
      detail: "Base de datos, autenticación y Storage.",
      state: process.env.NEXT_PUBLIC_SUPABASE_URL ? "ok" : "missing",
      value: process.env.NEXT_PUBLIC_SUPABASE_URL
        ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]
        : undefined,
    },
    {
      name: "Anthropic",
      detail: "Copy, elección de plantilla y armado de lotes.",
      state: process.env.ANTHROPIC_API_KEY ? "ok" : "missing",
      value: GENERATION_MODEL,
    },
    {
      name: "Google Gemini",
      detail:
        imageProvider === "google"
          ? "Proveedor de fondos activo."
          : "Configurado, pero no es el proveedor activo.",
      state: process.env.GEMINI_API_KEY
        ? "ok"
        : imageProvider === "google"
          ? "missing"
          : "optional",
      value: geminiModel,
    },
    {
      name: "fal / FLUX.2",
      detail:
        imageProvider === "fal"
          ? "Proveedor de fondos activo."
          : "Alternativa. Se activa con IMAGE_PROVIDER=fal.",
      state: process.env.FAL_KEY
        ? "ok"
        : imageProvider === "fal"
          ? "missing"
          : "optional",
    },
  ];
}

export const metadata: Metadata = {
  title: "Configuración",
  description:
    "Consumo de las APIs de generación, integraciones y espacio de trabajo.",
};

export default async function ConfiguracionPage() {
  const supabase = await createClient();

  const [{ data: workspace }, { data: usage }, { data: recent }] =
    await Promise.all([
      supabase.from("workspaces").select("name, created_at").limit(1).maybeSingle(),
      // Pre-aggregated by the database. RLS reaches this through the view's
      // security_invoker flag, so no workspace filter is needed here.
      supabase
        .from("generation_usage_daily")
        .select("*, brands(name)")
        .order("day", { ascending: false }),
      supabase
        .from("generations")
        .select(
          "id, kind, provider, model, cost_estimate_usd, duration_ms, ok, error, created_at, brands(name)",
        )
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

  const rows = usage ?? [];

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - RECENT_WINDOW_DAYS);
  const windowStartDay = windowStart.toISOString().slice(0, 10);

  const totals = rows.reduce(
    (acc, row) => {
      const calls = row.calls ?? 0;
      const cost = Number(row.cost_usd ?? 0);

      acc.calls += calls;
      acc.failed += row.failed_calls ?? 0;
      acc.cost += cost;
      acc.priced += row.priced_calls ?? 0;

      if ((row.day ?? "") >= windowStartDay) {
        acc.windowCalls += calls;
        acc.windowCost += cost;
      }
      return acc;
    },
    { calls: 0, failed: 0, cost: 0, priced: 0, windowCalls: 0, windowCost: 0 },
  );

  // Per kind: adds tokens and average duration, which differ enough between
  // copy and backgrounds to be worth separating.
  const byKind = new Map<string, BreakdownRow & { durationWeight: number }>();
  for (const row of rows) {
    const kind = row.kind ?? "text";
    const entry = byKind.get(kind) ?? {
      key: kind,
      label: kind === "image" ? "Fondos (imagen)" : "Copy (texto)",
      sublabel:
        kind === "image"
          ? "Generación de fondos, sin tipografía."
          : "Captions, slots de plantilla y armado de lotes.",
      calls: 0,
      failedCalls: 0,
      costUsd: 0,
      pricedCalls: 0,
      tokens: 0,
      avgDurationMs: 0,
      durationWeight: 0,
    };

    const calls = row.calls ?? 0;
    entry.calls += calls;
    entry.failedCalls += row.failed_calls ?? 0;
    entry.costUsd += Number(row.cost_usd ?? 0);
    entry.pricedCalls += row.priced_calls ?? 0;
    entry.tokens =
      (entry.tokens ?? 0) +
      Number(row.input_tokens ?? 0) +
      Number(row.output_tokens ?? 0) +
      Number(row.cache_read_tokens ?? 0);
    // The view averages per bucket; re-averaging those means weighting each
    // bucket by its call count, not treating every bucket as one sample.
    entry.durationWeight += (row.avg_duration_ms ?? 0) * calls;

    byKind.set(kind, entry);
  }

  const kindRows: BreakdownRow[] = [...byKind.values()].map((entry) => ({
    ...entry,
    avgDurationMs: entry.calls > 0 ? entry.durationWeight / entry.calls : 0,
  }));

  const byBrand = new Map<string, BreakdownRow & { lastDay: string }>();
  for (const row of rows) {
    const key = row.brand_id ?? "—";
    const name = row.brands?.name ?? "Marca eliminada";
    const entry = byBrand.get(key) ?? {
      key,
      label: name,
      sublabel: undefined,
      calls: 0,
      failedCalls: 0,
      costUsd: 0,
      pricedCalls: 0,
      lastDay: "",
    };

    entry.calls += row.calls ?? 0;
    entry.failedCalls += row.failed_calls ?? 0;
    entry.costUsd += Number(row.cost_usd ?? 0);
    entry.pricedCalls += row.priced_calls ?? 0;
    if ((row.day ?? "") > entry.lastDay) entry.lastDay = row.day ?? "";

    byBrand.set(key, entry);
  }

  const brandRows: BreakdownRow[] = [...byBrand.values()]
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls)
    .map((entry) => ({
      ...entry,
      sublabel: entry.lastDay ? `Última: ${formatDay(entry.lastDay)}` : undefined,
    }));

  const recentCalls: RecentCall[] = (recent ?? []).map((call) => ({
    id: call.id,
    kind: call.kind,
    provider: call.provider,
    model: call.model,
    brandName: call.brands?.name ?? null,
    costUsd: call.cost_estimate_usd === null ? null : Number(call.cost_estimate_usd),
    durationMs: call.duration_ms,
    ok: call.ok,
    error: call.error,
    createdAt: call.created_at,
  }));

  const avgCost = totals.calls > 0 ? totals.cost / totals.calls : 0;

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Espacio de trabajo, integraciones y consumo de las APIs de generación."
      />

      <div className="space-y-10 px-6 py-8 md:px-8">
        {/*
          The zero-data state teaches instead of showing US$0 four times. A
          workspace that has never generated has nothing to audit yet, and
          saying what will appear here is more use than an empty table.
        */}
        {totals.calls === 0 ? (
          <section className="space-y-2 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm">Todavía no se registró ningún consumo</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Cada llamada de IA queda registrada acá desde la primera: qué se
              pidió, cuánto tardó, cuánto costó y si falló. Generá un lote desde{" "}
              <Link
                href="/contenido"
                className="text-[var(--synera-accent)] underline-offset-4 hover:underline"
              >
                Contenido
              </Link>{" "}
              y volvé.
            </p>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="eyebrow">
            Consumo
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Costo total"
              value={formatCostUsd(totals.cost)}
              hint={
                totals.priced < totals.calls
                  ? `${totals.calls - totals.priced} llamada(s) sin tarifa conocida`
                  : "Todas las llamadas tienen tarifa conocida"
              }
              accent
            />
            <StatTile
              label={`Últimos ${RECENT_WINDOW_DAYS} días`}
              value={formatCostUsd(totals.windowCost)}
              hint={`${formatCount(totals.windowCalls)} llamadas`}
            />
            <StatTile
              label="Llamadas"
              value={formatCount(totals.calls)}
              hint={`Promedio ${formatCostUsd(avgCost)} por llamada`}
            />
            <StatTile
              label="Fallidas"
              value={formatCount(totals.failed)}
              hint={
                totals.failed > 0
                  ? "Se cobran igual si el proveedor respondió"
                  : "Sin errores registrados"
              }
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Estimaciones calculadas al momento de cada llamada con la tarifa
            vigente ese día, no una tarifa actual aplicada al pasado. No
            reemplazan la factura del proveedor.
          </p>
        </section>

        <UsageBreakdown
          title="Por tipo"
          rows={kindRows}
          emptyLabel="Sin llamadas registradas todavía."
        />

        <UsageBreakdown
          title="Por marca"
          rows={brandRows}
          emptyLabel="Cuando generes contenido, acá vas a ver el gasto por cliente."
        />

        <section className="space-y-3">
          <h2 className="eyebrow">
            Últimas {RECENT_LIMIT} llamadas
          </h2>
          <RecentCalls calls={recentCalls} />
        </section>

        <section className="space-y-3">
          <h2 className="eyebrow">
            Integraciones
          </h2>
          <EnvironmentStatus integrations={buildIntegrations()} />
          <p className="text-xs text-muted-foreground">
            Sólo se informa si cada clave está configurada. Ningún valor, ni
            parcial, se muestra en esta pantalla.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="eyebrow">
            Espacio de trabajo
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile label="Nombre" value={workspace?.name ?? "—"} />
            <StatTile
              label="Zona horaria de los reportes"
              value="Buenos Aires"
              hint="El corte diario de consumo usa esta zona, no UTC."
            />
          </div>
        </section>
      </div>
    </>
  );
}
