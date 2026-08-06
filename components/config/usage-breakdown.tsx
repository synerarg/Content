import { formatCostUsd } from "@/lib/ai/pricing";
import { formatCount, formatDuration, formatTokens } from "@/lib/format";

/*
  Breakdown rows, deliberately not a <table>.

  Every one of these lists is read on a phone during review, and a four-column
  table there either overflows or shrinks to unreadable. A flex row that wraps
  keeps the label with its numbers at any width, and the numbers stay in a
  tabular-nums column so they align down the list the way a table's would.
*/

export type BreakdownRow = {
  key: string;
  label: string;
  sublabel?: string;
  calls: number;
  failedCalls: number;
  costUsd: number;
  pricedCalls: number;
  tokens?: number;
  avgDurationMs?: number;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-16">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm tabular-nums">{value}</p>
    </div>
  );
}

export function UsageBreakdown({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: BreakdownRow[];
  emptyLabel: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4"
            >
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium">{row.label}</p>
                {row.sublabel ? (
                  <p className="text-xs text-muted-foreground">
                    {row.sublabel}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Metric label="Llamadas" value={formatCount(row.calls)} />

                {row.tokens !== undefined ? (
                  <Metric label="Tokens" value={formatTokens(row.tokens)} />
                ) : null}

                {row.avgDurationMs !== undefined ? (
                  <Metric
                    label="Media"
                    value={formatDuration(row.avgDurationMs)}
                  />
                ) : null}

                <Metric
                  label="Fallidas"
                  value={row.failedCalls > 0 ? formatCount(row.failedCalls) : "—"}
                />

                <div className="min-w-20 text-right">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Costo
                  </p>
                  <p className="text-sm tabular-nums">
                    {formatCostUsd(row.costUsd)}
                    {/*
                      A model with no known rate logs a null cost. Saying so
                      beats letting the total read as complete when it is not.
                    */}
                    {row.pricedCalls < row.calls ? (
                      <span
                        title={`${row.calls - row.pricedCalls} llamada(s) sin tarifa conocida`}
                        className="ml-1 text-muted-foreground"
                      >
                        *
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
