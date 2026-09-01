import { Check, Minus, X } from "lucide-react";

/*
  Integration status.

  Reports ONLY whether a variable is set, never any part of its value — no
  prefix, no length, no masked tail. A key fingerprint on a page is still a key
  fingerprint, and this page is one screenshot away from a group chat. The
  booleans are resolved on the server; the component receives conclusions, not
  environment access.
*/

export type IntegrationState = "ok" | "missing" | "optional";

export type Integration = {
  name: string;
  detail: string;
  state: IntegrationState;
  /** Non-secret configuration worth showing, e.g. the resolved model id. */
  value?: string;
};

const ICON: Record<IntegrationState, typeof Check> = {
  ok: Check,
  missing: X,
  optional: Minus,
};

const TONE: Record<IntegrationState, string> = {
  ok: "text-[var(--synera-accent)] border-[color-mix(in_oklch,var(--synera-accent)_28%,transparent)]",
  missing: "text-destructive border-destructive/30",
  optional: "text-muted-foreground border-border",
};

export function EnvironmentStatus({
  integrations,
}: {
  integrations: Integration[];
}) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card glass-card">
      {integrations.map((integration) => {
        const Icon = ICON[integration.state];

        return (
          <div
            key={integration.name}
            className="flex flex-wrap items-center gap-3 p-4"
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-lg border bg-background ${TONE[integration.state]}`}
            >
              <Icon className="size-3.5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{integration.name}</p>
              <p className="text-xs text-muted-foreground">
                {integration.detail}
              </p>
            </div>

            {integration.value ? (
              <span className="shrink-0 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                {integration.value}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
