import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { UserMenu } from "@/components/app-shell/user-menu";

// Every page under this layout is per-user and session-dependent. Saying so
// explicitly keeps a future page from being silently static-optimized and
// served with another user's workspace baked in.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already gates this, but a Server Component must not assume that:
  // it renders on requests middleware can skip, and defence in depth is cheap.
  if (!user) {
    redirect("/login");
  }

  // RLS scopes this to workspaces the caller actually belongs to, so this
  // doubles as a live check that the policy chain works.
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .limit(1)
    .maybeSingle();

  return (
    <div className="blueprint-grid flex min-h-svh">
      {/*
        Sticky, and the height is what makes it so.

        The aside is a flex child of a `min-h-svh` row, so it stretched to the
        height of the WHOLE document: nav pinned to the top of the page, account
        menu to the bottom, and everything in between an empty column. Scroll
        past the fold on a long form — which is every brand form — and the
        navigation was simply gone.

        `h-svh` gives it a definite height that beats the stretch, and `sticky`
        holds that box against the viewport while the document scrolls under it.
        Deliberately NOT a nested scroll container: `overflow` on the main
        column would break the form's own `sticky bottom-0` action bar and lose
        the browser's scroll restoration.
      */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <span
            aria-hidden
            className="size-2 rounded-full bg-[var(--synera-accent)] shadow-[0_0_10px_var(--synera-accent)]"
          />
          <span className="text-base font-medium">Synera</span>
        </div>

        {/* Scrolls on its own only if the nav ever outgrows a short viewport;
            the account menu below it must stay reachable either way. */}
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          <SidebarNav />
        </div>

        <div className="border-t border-border p-2">
          <UserMenu
            email={user.email ?? "—"}
            workspaceName={workspace?.name ?? "Mi espacio"}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Mobile chrome. The shell has to stay usable on a phone for review
          work — approving copy and checking a background does not need a
          desktop, even though editing does.

          The header sticks so the account menu and the tab strip stay reachable
          on the long batch pages, which is where phone review actually happens.
        */}
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full bg-[var(--synera-accent)] shadow-[0_0_10px_var(--synera-accent)]"
              />
              <span className="text-base font-medium">
                Synera
              </span>
            </div>
            <UserMenu
              compact
              email={user.email ?? "—"}
              workspaceName={workspace?.name ?? "Mi espacio"}
            />
          </div>
          <div className="border-t border-border py-1">
            <SidebarNav orientation="horizontal" />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
