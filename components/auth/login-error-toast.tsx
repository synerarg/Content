"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Surfaces an `?error=` query param (set by the OAuth callback route) as a
 * toast. Split into its own client component so the login page itself can stay
 * a Server Component.
 */
export function LoginErrorToast({ message }: { message?: string }) {
  const shown = useRef(false);

  useEffect(() => {
    if (!message || shown.current) return;
    shown.current = true;
    toast.error(message);
  }, [message]);

  return null;
}
