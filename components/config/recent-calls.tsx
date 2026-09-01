import { CircleAlert, ImageIcon, Type } from "lucide-react";
import { formatCostUsd } from "@/lib/ai/pricing";
import { formatDuration, formatRelative } from "@/lib/format";

export type RecentCall = {
  id: string;
  kind: "text" | "image";
  provider: string;
  model: string;
  brandName: string | null;
  costUsd: number | null;
  durationMs: number | null;
  ok: boolean;
  error: string | null;
  createdAt: string;
};

export function RecentCalls({ calls }: { calls: RecentCall[] }) {
  if (calls.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Todavía no se registró ninguna llamada.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card glass-card">
      {calls.map((call) => {
        const Icon = call.kind === "image" ? ImageIcon : Type;

        return (
          <div key={call.id} className="flex items-start gap-3 p-4">
            <span
              className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border bg-background ${
                call.ok
                  ? "border-border text-muted-foreground"
                  : "border-destructive/30 text-destructive"
              }`}
            >
              {call.ok ? (
                <Icon className="size-3.5" />
              ) : (
                <CircleAlert className="size-3.5" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-mono text-xs">{call.model}</p>
                <p className="text-sm tabular-nums">
                  {formatCostUsd(call.costUsd)}
                </p>
              </div>

              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  call.brandName ?? "sin marca",
                  formatRelative(call.createdAt),
                  formatDuration(call.durationMs),
                ].join(" · ")}
              </p>

              {/*
                The error text is the whole reason a failed call is worth
                keeping in the log — "Exhausted balance" and a 429 rate limit
                need completely different responses from the operator.
              */}
              {!call.ok && call.error ? (
                <p className="mt-1.5 break-words rounded-md border border-destructive/20 bg-background px-2 py-1.5 font-mono text-[11px] text-destructive">
                  {call.error}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
