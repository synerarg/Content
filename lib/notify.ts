"use client";

import { toast } from "sonner";
import { describeError, isAbort, type ErrorPayload } from "@/lib/errors";

/**
 * The single way this app reports a failure.
 *
 * Every surfaced error gets the same three parts the heuristics require: what
 * failed, why, and one action. Cancellations are swallowed — the user already
 * knows, and a red toast for their own click is noise.
 *
 * @param retry
 *   Wired to the toast's action button. Only offered for classes where
 *   retrying can actually help; a safety refusal gets no retry button because
 *   pressing it again would fail identically and cost another call.
 */
export function notifyError(
  cause: unknown,
  options?: { payload?: ErrorPayload; retry?: () => void },
): void {
  if (isAbort(cause)) return;

  const described = describeError(cause, options?.payload);
  const canRetry = described.retryable && options?.retry;

  toast.error(described.title, {
    description: described.description,
    ...(canRetry
      ? { action: { label: "Reintentar", onClick: options!.retry! } }
      : {}),
  });
}

/**
 * Read a failed `fetch` Response into the payload shape the classifier expects.
 *
 * Kept separate so callers do not each re-implement "parse the body, fall back
 * to the status text" — which is where inconsistent error copy came from.
 */
export async function readErrorPayload(
  response: Response,
): Promise<ErrorPayload> {
  const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
  if (payload.error) return payload;
  return { error: `El servidor respondió ${response.status}.`, code: payload.code };
}
