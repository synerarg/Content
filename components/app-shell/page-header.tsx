export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5 md:px-8">
      <div className="min-w-0 space-y-1">
        {/*
          `heading` (28px) in Ice Highlight, at weight 500.

          The colour is the half that was actually missing. The reference sets
          out a four-step progression — Ice Highlight, Frost Glow, Moon Mist,
          Fog Veil for heading, body, muted body, helper — and this h1 was
          inheriting --foreground, which is Frost Glow. The title was rendering
          in exactly the same colour as body copy, so it had one step of
          hierarchy (size) doing the work of two.

          Weight stays 500 on purpose: the reference forbids 600+ on display
          type, and with the size and colour steps both present it no longer
          needs the volume.
        */}
        <h1 className="truncate text-heading font-medium text-ice-highlight">
          {title}
        </h1>
        {description ? (
          <p className="truncate text-body-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
