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
          heading-sm at weight 500, not 600+.

          The reference is explicit that display type's authority comes from
          size rather than volume, and forbids bold on it. 24px of Space
          Grotesk at 500 reads as more of a heading than 18px of semibold did,
          while sitting quieter on the page.
        */}
        <h1 className="truncate text-heading-sm font-medium">{title}</h1>
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
