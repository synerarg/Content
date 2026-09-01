"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/*
  The ONE confirmation component.

  It replaces `window.confirm`, which was in use in two places and is wrong for
  three reasons: it cannot be styled, so it breaks out of the app's language
  entirely; it blocks the main thread; and it gave two screens visibly different
  confirmation behaviour for the same kind of decision.

  Built on Radix AlertDialog rather than the plain Dialog because the semantics
  differ: an alert dialog traps focus, is announced as `alertdialog`, and — the
  part that matters for a destructive action — does NOT close on an outside
  click. Escape and Cancelar still work, so there is always an obvious exit.
*/

function ConfirmDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        // Same overlay language as Dialog — a destructive confirm is a
        // heavier decision, not a heavier layer of chrome.
        "fixed inset-0 z-50 bg-black/10 duration-200 supports-backdrop-filter:backdrop-blur-xs",
        "data-open:animate-in data-closed:animate-out",
        "data-open:fade-in-0 data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  pending = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  /** Extra content between the description and the actions, e.g. a type-to-confirm field. */
  children?: React.ReactNode;
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <ConfirmDialogOverlay />
        <AlertDialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            // ring, not shadow — same rule card.tsx and Dialog already follow.
            "rounded-2xl bg-popover glass-modal p-5 text-sm duration-200",
            "data-open:animate-in data-closed:animate-out",
            "data-open:fade-in-0 data-closed:fade-out-0",
            "data-open:zoom-in-95 data-closed:zoom-out-95",
          )}
        >
          <AlertDialogPrimitive.Title className="text-base font-medium text-balance">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </AlertDialogPrimitive.Description>

          {children ? <div className="mt-4">{children}</div> : null}

          {/*
            Primary action bottom-right, per the app-wide button hierarchy.
            A destructive confirm is never the cyan CTA — cyan means "the thing
            you probably want", and deleting a client's work is not that.
          */}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="ghost" disabled={pending}>
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                variant={destructive ? "destructive" : "default"}
                disabled={pending}
                onClick={(event) => {
                  // Radix closes on Action by default. Kept open while the
                  // work runs so the pending state is visible and a second
                  // click is impossible.
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
