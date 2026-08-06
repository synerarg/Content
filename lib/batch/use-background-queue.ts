"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  bumpSlideAttempts,
  markSlideFailed,
  markSlideQueued,
  markSlideRunning,
  resetStaleBackgrounds,
  setBatchStatus,
  setSlideBackground,
} from "@/app/(app)/contenido/actions";
import type { FormatKey } from "@/templates/types";

/*
  The background queue's driver.

  WHY THE BROWSER DRIVES IT

  Backgrounds are rate-limited by the provider — the Gemini free tier does
  roughly two images per minute — so eight of them is about four minutes of
  wall clock that is mostly waiting. That cannot be a Vercel function: it blows
  the 300s ceiling on a large batch and bills function time for sleeping on the
  small ones. So the browser walks the list, one request at a time, and the
  server does one image per call exactly as before.

  Closing the tab therefore PAUSES a run rather than losing it: every completed
  slide is already persisted, and the state on each row says where to resume.

  WHY IT PACES ITSELF INSTEAD OF SLEEPING ON A CONSTANT

  There is no configured delay anywhere here. The loop runs flat out and only
  slows down when the API answers 429, at which point it honours the delay the
  provider asked for. A free tier throttles itself down to ~2/min; a paid tier
  never 429s and runs at full speed. Neither needs a setting, and a change to
  Google's limits needs no code change.
*/

export type BackgroundStatus =
  | "pending"
  | "queued"
  | "running"
  | "ready"
  | "failed";

export type QueueItem = {
  slideId: string;
  brandId: string;
  backgroundBrief: string;
  format: FormatKey;
  templateSlug: string;
};

export type SlideQueueState = {
  status: BackgroundStatus;
  error: string | null;
  attempts: number;
};

export type GeneratedBackground = {
  path: string;
  signedUrl: string;
  seed: number | null;
  prompt: string;
};

/** Real failures — a filtered prompt, a dead provider — before giving up. */
const MAX_ATTEMPTS = 2;

/**
 * Rate-limit waits tolerated per slide before it is called failed.
 *
 * Five waits of ~31s is about two and a half minutes on one slide, which only
 * happens if something else is also consuming the quota. Past that, saying so
 * beats waiting silently forever.
 */
const MAX_RATE_LIMIT_WAITS = 5;

const POLL_MS = 250;

export function useBackgroundQueue({
  batchId,
  initialStates,
  onSlideReady,
}: {
  batchId: string;
  initialStates: Record<string, SlideQueueState>;
  onSlideReady: (slideId: string, background: GeneratedBackground) => void;
}) {
  const [states, setStates] = useState<Record<string, SlideQueueState>>(initialStates);
  const [running, setRunning] = useState(false);
  const [waitingUntil, setWaitingUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  // Refs, not state: the loop reads these on every iteration and must see the
  // current value, not the one captured when its closure was created.
  const cancelRef = useRef(false);
  const nextAllowedAtRef = useRef(0);
  const runningRef = useRef(false);
  /** Observed wall time per completed slide, used for the estimate. */
  const timingsRef = useRef<number[]>([]);

  const patch = useCallback(
    (slideId: string, next: Partial<SlideQueueState>) => {
      setStates((current) => ({
        ...current,
        [slideId]: {
          status: current[slideId]?.status ?? "pending",
          error: current[slideId]?.error ?? null,
          attempts: current[slideId]?.attempts ?? 0,
          ...next,
        },
      }));
    },
    [],
  );

  /** Interruptible sleep: a pause must not have to wait out a 31s backoff. */
  const sleepUntil = useCallback(async (timestamp: number) => {
    if (timestamp <= Date.now()) return;
    setWaitingUntil(timestamp);
    while (Date.now() < timestamp && !cancelRef.current) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    setWaitingUntil(null);
  }, []);

  const generateOne = useCallback(
    async (item: QueueItem): Promise<"ready" | "failed" | "cancelled"> => {
      let rateLimitWaits = 0;

      /*
        Attempts are counted PER RUN for the retry budget, but stored
        cumulatively.

        Sharing one counter breaks retrying: a slide that already failed twice
        would come back at the budget ceiling and get exactly one more try
        before being marked failed again — pressing "Reintentar" would do
        almost nothing. Meanwhile the cumulative number is the useful
        diagnostic ("this slide has now failed seven times"), so the row keeps
        it and only the loop resets.
      */
      const persisted = states[item.slideId]?.attempts ?? 0;
      let attempts = 0;

      while (true) {
        if (cancelRef.current) return "cancelled";

        await sleepUntil(nextAllowedAtRef.current);
        if (cancelRef.current) return "cancelled";

        patch(item.slideId, { status: "running", error: null });
        await markSlideRunning(item.slideId);

        let response: Response;
        try {
          response = await fetch("/api/generate/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brandId: item.brandId,
              brief: item.backgroundBrief,
              format: item.format,
              templateSlug: item.templateSlug,
            }),
          });
        } catch {
          // Network-level failure: no response at all. Almost always the tab
          // going offline, so it is worth one more go rather than a hard fail.
          attempts++;
          await bumpSlideAttempts(item.slideId, persisted + attempts);
          if (attempts >= MAX_ATTEMPTS) {
            const message = "No se pudo contactar al servidor.";
            patch(item.slideId, {
              status: "failed",
              error: message,
              attempts: persisted + attempts,
            });
            await markSlideFailed(item.slideId, message);
            return "failed";
          }
          continue;
        }

        const payload = await response.json().catch(() => ({}));

        // 429 is a wait, not an attempt. Counting it would burn the retry
        // budget on a queue that is simply doing what the free tier allows.
        if (response.status === 429) {
          rateLimitWaits++;
          const retryAfterMs = Number(payload.retryAfterMs) || 31_000;

          if (rateLimitWaits > MAX_RATE_LIMIT_WAITS) {
            const message = `Límite de la API alcanzado ${rateLimitWaits} veces seguidas. Probá de nuevo más tarde.`;
            patch(item.slideId, {
              status: "failed",
              error: message,
              attempts: persisted + attempts,
            });
            await markSlideFailed(item.slideId, message);
            return "failed";
          }

          nextAllowedAtRef.current = Date.now() + retryAfterMs;
          patch(item.slideId, {
            status: "queued",
            error: "Esperando por el límite de la API…",
          });
          await markSlideQueued(item.slideId);
          continue;
        }

        attempts++;
        await bumpSlideAttempts(item.slideId, persisted + attempts);

        if (!response.ok) {
          const message = payload.error ?? "Falló la generación.";
          if (attempts < MAX_ATTEMPTS) {
            patch(item.slideId, {
              status: "queued",
              error: message,
              attempts: persisted + attempts,
            });
            continue;
          }
          patch(item.slideId, {
            status: "failed",
            error: message,
            attempts: persisted + attempts,
          });
          await markSlideFailed(item.slideId, message);
          return "failed";
        }

        await setSlideBackground(
          item.slideId,
          payload.path,
          {
            backgroundBrief: item.backgroundBrief,
            seed: payload.seed,
            prompt: payload.prompt,
          },
          // See the action: revalidating here would refresh the page and
          // revoke every blob URL on screen, once per completed slide.
          false,
        );

        patch(item.slideId, {
          status: "ready",
          error: null,
          attempts: persisted + attempts,
        });
        onSlideReady(item.slideId, {
          path: payload.path,
          signedUrl: payload.signedUrl,
          seed: payload.seed ?? null,
          prompt: payload.prompt ?? "",
        });
        return "ready";
      }
    },
    [states, patch, sleepUntil, onSlideReady],
  );

  const start = useCallback(
    async (items: QueueItem[]) => {
      if (runningRef.current || items.length === 0) return;

      runningRef.current = true;
      cancelRef.current = false;
      timingsRef.current = [];
      setRunning(true);
      setRemaining(items.length);

      // Anything left `running` by a driver that died, or `queued` by a run
      // that was paused, has to come back to pending before this run claims it.
      await resetStaleBackgrounds(batchId);
      await setBatchStatus(batchId, "generating");

      for (const item of items) {
        patch(item.slideId, { status: "queued", error: null });
        await markSlideQueued(item.slideId);
      }

      let failed = 0;
      for (const [index, item] of items.entries()) {
        if (cancelRef.current) break;

        const startedAt = Date.now();
        const outcome = await generateOne(item);
        if (outcome === "cancelled") break;
        if (outcome === "failed") failed++;
        // Includes any rate-limit wait, which is the point: the estimate has to
        // reflect the pace the queue actually achieves, not the model's speed.
        timingsRef.current.push(Date.now() - startedAt);
        setRemaining(items.length - index - 1);
      }

      const cancelled = cancelRef.current;
      await setBatchStatus(batchId, failed > 0 && !cancelled ? "failed" : "ready");

      runningRef.current = false;
      setRunning(false);
      setWaitingUntil(null);
      setRemaining(0);

      return { failed, cancelled };
    },
    [batchId, generateOne, patch],
  );

  const pause = useCallback(() => {
    cancelRef.current = true;
  }, []);

  /**
   * Mean time per completed slide in THIS run, times what is left.
   *
   * Deliberately measured rather than calculated from a nominal rate: the real
   * pace depends on the tier, on the prompt, and on whatever else is consuming
   * the same quota. Null until a slide has actually finished — a made-up first
   * estimate is worse than none.
   */
  const etaMs = useMemo(() => {
    const timings = timingsRef.current;
    if (!running || timings.length === 0 || remaining === 0) return null;
    const mean = timings.reduce((sum, value) => sum + value, 0) / timings.length;
    return Math.round(mean * remaining);
  }, [running, remaining]);

  return { states, setStates, running, waitingUntil, etaMs, start, pause };
}
