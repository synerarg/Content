import "server-only";

import { CodedError } from "@/lib/errors";

/*
  Retry a structured-output call whose result did not parse.

  Structured outputs occasionally come back in a shape the schema rejects, and
  that failure is NOT the user's problem: nothing they typed caused it and
  nothing they can type fixes it. Surfacing "el modelo no devolvió el formato
  esperado" asks them to react to an implementation detail. Retrying silently is
  the correct behaviour, and it is what the heuristics spec asks for.

  Deliberately NOT retried:

    - `refusal` — the model declined on content grounds. The same prompt gets
      the same refusal, so a retry is a guaranteed waste of a call.
    - `max_tokens` — the answer was too big. It will be too big again.

  Both are real, actionable conditions with their own error class. Only an
  unparseable result is transient enough to be worth paying for twice.
*/

/** One initial attempt plus two retries, per the spec. */
const MAX_ATTEMPTS = 3;

type StructuredResponse = {
  stop_reason?: string | null;
  parsed_output?: unknown;
};

export async function parseWithRetry<R extends StructuredResponse>(
  call: (attempt: number) => Promise<R>,
): Promise<R> {
  let last: R | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await call(attempt);
    last = response;

    // Terminal conditions: hand back untouched so the caller can classify them.
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return response;
    }
    if (response.parsed_output) return response;

    if (attempt < MAX_ATTEMPTS) {
      console.warn(
        `[ai] structured output no parseó (intento ${attempt}/${MAX_ATTEMPTS}); reintentando`,
      );
    }
  }

  // Every attempt produced an unusable shape. Now it IS worth telling someone,
  // because at this point it means the schema and the model genuinely disagree.
  console.error(
    `[ai] structured output falló ${MAX_ATTEMPTS} veces; último stop_reason: ${last?.stop_reason ?? "desconocido"}`,
  );
  throw new CodedError(
    "provider",
    `El modelo no devolvió el formato esperado después de ${MAX_ATTEMPTS} intentos.`,
  );
}
