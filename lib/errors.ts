/*
  One place that turns a failure into something a person can act on.

  Before this, 32 separate `toast.error` calls surfaced whatever string the
  provider or Postgres happened to return — in English, with no indication of
  whether waiting, editing the brief, or calling someone was the right response.
  A rate limit and a safety refusal need opposite reactions and read identically
  when both are just red text.

  The class comes from a `code` the route sends when it knows one. String
  matching is only ever the FALLBACK: messages change with provider versions and
  are not a contract, so anything load-bearing gets an explicit code.
*/

export type ErrorClass =
  | "rate_limit"
  | "billing"
  | "safety"
  | "network"
  | "provider"
  | "site"
  | "config"
  | "too_long"
  | "validation"
  | "unknown";

/** Wire format for a failed route response. */
export type ErrorPayload = {
  error?: string;
  code?: ErrorClass;
  retryAfterMs?: number;
};

/**
 * An error that already knows its class.
 *
 * Thrown by the generation modules so the route can put a `code` on the wire
 * instead of the browser re-deriving it from prose. Anything that reaches the
 * client without one falls back to `guessClass`, which is best-effort by
 * design — patterns are not a contract.
 */
export class CodedError extends Error {
  readonly code: ErrorClass;

  constructor(code: ErrorClass, message: string) {
    super(message);
    this.name = "CodedError";
    this.code = code;
  }
}

/** The class to put on the wire for any thrown value. */
export function codeOf(cause: unknown): ErrorClass {
  if (cause instanceof CodedError) return cause.code;
  return guessClass(cause instanceof Error ? cause.message : String(cause ?? ""));
}

export type DescribedError = {
  cls: ErrorClass;
  /** Headline: what failed, in plain Rioplatense Spanish. */
  title: string;
  /** Why, and what to do about it. */
  description: string;
  /** Whether offering a retry button makes sense for this class. */
  retryable: boolean;
};

const BY_CLASS: Record<ErrorClass, Omit<DescribedError, "cls">> = {
  rate_limit: {
    title: "El proveedor nos frenó por límite de uso",
    description:
      "Es la cuota por minuto, no un error. Esperá unos segundos y seguí; la cola lo hace sola.",
    retryable: true,
  },
  /*
    Separada de `rate_limit` aunque el proveedor devuelva 429 en los dos casos.

    Tratarlas igual fue un error real: la cola esperaba 31 s y reintentaba cinco
    veces por placa — veinte minutos para un lote de ocho — por algo que
    esperando no se resuelve nunca, y encima le decía al usuario "esperá unos
    segundos". Sin crédito hay que cargar crédito; es la única salida.
  */
  billing: {
    title: "El proveedor se quedó sin crédito",
    description:
      "No es un límite de uso: la cuenta no tiene saldo. Cargá crédito en el proveedor de imágenes y volvé a intentar. Reintentar ahora va a fallar igual.",
    retryable: false,
  },
  safety: {
    title: "El proveedor rechazó el pedido",
    description:
      "El contenido del brief o de la escena no pasó su filtro. Reformulalo con otras palabras y probá de nuevo.",
    retryable: false,
  },
  network: {
    title: "No pudimos contactar al servidor",
    description: "Revisá tu conexión y reintentá.",
    retryable: true,
  },
  provider: {
    title: "Hay un problema con el proveedor de IA",
    description:
      "No es algo que puedas arreglar desde acá. Si sigue pasando, avisale a Synera.",
    retryable: true,
  },
  /*
    El SITIO del cliente falló — no nosotros y no el proveedor de IA.

    Separada de `provider` después de ver el error real: un 403 de Cloudflare
    salía como "Hay un problema con el proveedor de IA / no es algo que puedas
    arreglar desde acá", que es falso dos veces. Claude nunca llegó a
    ejecutarse, y quien lo lee SÍ puede arreglarlo — pegando otra página,
    corrigiendo la URL, o cargando la marca a mano.

    A diferencia del resto de las clases, el mensaje puntual manda: "el sitio
    respondió 404" y "el sitio bloquea lectores automáticos" piden cosas
    distintas y no hay una frase genérica que sirva para las dos. Por eso
    `describeError` usa el texto tal cual viene, y por eso los mensajes de
    lib/web/safe-fetch.ts están escritos para que los lea un humano.
  */
  site: {
    title: "No pudimos leer ese sitio",
    description: "Probá con la home del cliente, o cargá la marca a mano.",
    retryable: true,
  },
  config: {
    title: "Falta configuración",
    description:
      "Una credencial o un dato de la marca no está cargado. Revisá Configuración.",
    retryable: false,
  },
  too_long: {
    title: "La respuesta no entró completa",
    description: "Probá con una composición más chica o un brief más corto.",
    retryable: true,
  },
  validation: {
    title: "Los datos no son válidos",
    description: "Revisá los campos marcados y volvé a intentar.",
    retryable: false,
  },
  unknown: {
    title: "Algo falló",
    description: "Reintentá. Si sigue pasando, avisale a Synera.",
    retryable: true,
  },
};

/*
  Fallback classification, for errors that arrive without a code.

  Every pattern here was taken from a message this app has actually produced —
  see the provider notes in HANDOFF.md §7. Deliberately conservative: an
  unmatched error is `unknown`, which offers a retry, rather than being guessed
  into a class that tells the user the wrong thing to do.
*/
function guessClass(message: string): ErrorClass {
  const m = message.toLowerCase();

  /*
    Billing is checked BEFORE rate limiting, and the order is load-bearing:
    Gemini answers 429 for both, and its depleted-credits message also contains
    the word "quota". Whichever is tested first wins, and getting it backwards
    tells the user to wait for something that will never clear.

    Both strings below are verbatim from real responses — Google's
    "prepayment credits are depleted" and fal's "Exhausted balance".
  */
  if (
    /prepayment credits|credits are depleted|exhausted balance|insufficient (funds|credit|balance)|billing/.test(
      m,
    )
  ) {
    return "billing";
  }
  if (/l[íi]mite de la capa gratuita|rate limit|429|quota|too many requests/.test(m)) {
    return "rate_limit";
  }
  if (/rechaz|refus|safety|blocked|filtr/.test(m)) return "safety";
  if (/failed to fetch|networkerror|network request|econnrefused|offline/.test(m)) {
    return "network";
  }
  if (/falta .*_api_key|falta .*_key|missing .*environment|no autorizado/.test(m)) {
    return "config";
  }
  if (/max_tokens|se cort[óo] por l[íi]mite de tokens|too long/.test(m)) {
    return "too_long";
  }
  if (/saturad|503|502|500/.test(m)) {
    return "provider";
  }
  return "unknown";
}

/**
 * Describe any failure — a thrown Error, an aborted fetch, or a route's JSON
 * payload — as a class plus copy the user can act on.
 */
export function describeError(
  cause: unknown,
  payload?: ErrorPayload,
): DescribedError {
  // An abort is the user's own doing and must never be reported as a failure.
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return {
      cls: "unknown",
      title: "Cancelado",
      description: "No se generó nada.",
      retryable: false,
    };
  }

  const raw =
    payload?.error ??
    (cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "");

  const cls = payload?.code ?? guessClass(raw);
  const base = BY_CLASS[cls] ?? BY_CLASS.unknown;

  /*
    The provider's own text is kept as the description when the class is not
    otherwise informative. "Exhausted balance" is genuinely more useful than a
    generic sentence — what it must never do is arrive with no framing at all.

    `site` goes further and REPLACES the description: those messages are written
    here, in Spanish, naming what the site did and what to try next. The generic
    line is only the fallback for a payload that arrived without one.
  */
  const description =
    cls === "site" && raw
      ? raw
      : cls === "unknown" && raw
        ? `${base.description} (${raw})`
        : base.description;

  return { cls, title: base.title, description, retryable: base.retryable };
}

/** True when the failure is the user cancelling, which needs no error surface. */
export function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "AbortError";
}
