"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CircleQuestionMark,
  LayoutGrid,
  LayoutTemplate,
  Palette,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/marcas", label: "Marcas", icon: Palette },
  { href: "/contenido", label: "Contenido", icon: LayoutGrid },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/plantillas", label: "Plantillas", icon: LayoutTemplate },
  { href: "/configuracion", label: "Configuración", icon: Settings },
  { href: "/ayuda", label: "Ayuda", icon: CircleQuestionMark },
] as const;

/**
 * @param orientation
 *   `vertical` is the desktop sidebar. `horizontal` is the phone tab strip —
 *   which needs a genuinely different layout, not a narrower one: the same
 *   flex-col list inside a horizontal scroller stacks into a tall block that
 *   pushes the actual page below the fold, and the active-state lit edge on the
 *   left has to become an underline to read as a tab.
 */
export function SidebarNav({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal";
}) {
  const pathname = usePathname();
  const isHorizontal = orientation === "horizontal";

  return (
    <nav
      className={cn(
        "flex",
        isHorizontal
          ? // No wrapping: the items scroll rather than reflow into two rows,
            // which keeps the strip a fixed height as the label lengths change.
            "gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "flex-col gap-1 px-3",
      )}
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-md text-sm transition-colors",
              isHorizontal
                ? "shrink-0 gap-2 px-3 py-2.5"
                : "px-3 py-2",
              isActive
                ? "bg-accent/60 text-foreground"
                : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
            )}
          >
            {/* Active state reads as a lit edge, never a filled block. */}
            <span
              aria-hidden
              className={cn(
                "absolute rounded-full transition-all",
                isHorizontal
                  ? "inset-x-3 bottom-0 h-px"
                  : "left-0 top-1/2 h-4 w-px -translate-y-1/2",
                isActive
                  ? "bg-[var(--synera-accent)] shadow-[0_0_8px_var(--synera-accent)]"
                  : "bg-transparent",
              )}
            />
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                isActive
                  ? "text-[var(--synera-accent)]"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
