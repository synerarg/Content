import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <span className="mb-5 flex size-11 items-center justify-center rounded-xl border border-[color-mix(in_oklch,var(--synera-accent)_22%,transparent)] bg-card">
        <Icon className="size-5 text-[var(--synera-accent)]" />
      </span>
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
