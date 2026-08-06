"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * @param compact
 *   Avatar-only trigger for the mobile top bar, where there is no room for the
 *   workspace name and email. Without this the phone layout had no sign-out at
 *   all — the full trigger only ever rendered inside the desktop sidebar.
 */
export function UserMenu({
  email,
  workspaceName,
  compact = false,
}: {
  email: string;
  workspaceName: string;
  compact?: boolean;
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast.error(error.message);
      return;
    }

    router.push("/login");
    router.refresh();
  }

  const initial = email.charAt(0).toUpperCase();

  const avatar = (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_oklch,var(--synera-accent)_35%,transparent)] text-xs font-medium">
      {initial}
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="icon" aria-label="Cuenta">
            {avatar}
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="h-auto w-full justify-start gap-3 px-3 py-2 text-left"
          >
            {avatar}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{workspaceName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {email}
              </span>
            </span>
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side={compact ? "bottom" : "top"}
        className="w-56"
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm">{workspaceName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
