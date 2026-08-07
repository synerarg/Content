import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CodedError } from "@/lib/errors";

/*
  Fetching a URL that a USER typed.

  This is the first place in the project where the server makes a request to an
  address someone else chose, and that is a different kind of code from calling
  a provider API. Left unguarded it is an SSRF hole: a Vercel function sits
  inside a network, and "https://169.254.169.254/latest/meta-data/" or
  "http://localhost:54321" are perfectly valid URLs to type into a form.

  Four guards, in order:

    1. Scheme. http and https only — no file:, no data:, no gopher:.
    2. Address. The hostname is RESOLVED and every address it answers with must
       be public. A name that resolves to 127.0.0.1 is rejected, which is what
       stops the obvious bypass of pointing a domain you control at localhost.
    3. Redirects. Followed MANUALLY, revalidating every hop, because a public
       URL is free to 302 to a private one and `redirect: "follow"` would take
       it without asking.
    4. Size and time. A response is read as a stream and abandoned past a cap,
       so a URL that streams forever cannot hold a function open.

  HONEST LIMIT — DNS rebinding. Between the lookup in guard 2 and the socket
  the fetch actually opens, the name can resolve again to a different address.
  Closing that needs connecting to the checked IP directly and carrying the
  Host header, which means dropping below `fetch`. For this app's threat model —
  an authenticated agency user pasting a client's website — the gap is
  acceptable, and it is written down here rather than left for someone to
  discover.
*/

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 12_000;

/*
  A real browser UA, and it has to be a real one.

  The string here used to be "Mozilla/5.0 (compatible; SyneraContentStudio/1.0;
  +https://synera.com.ar)" under a comment claiming it was a browser's. It is
  not one — the `compatible; <name>/<version>` shape is what crawlers send, and
  WAFs read it as exactly that. Measured 2026-08-07: patagonia.com answers 404
  to it and 301 to the string below. Same request otherwise.

  Also measured, and NOT added: Sec-Fetch-*, Upgrade-Insecure-Requests and a
  full browser Accept changed nothing on any of six sites. Headers that buy
  nothing do not go in.

  A site that blocks this too (despegar.com.ar answers 403 either way) is
  reported as such rather than worked around.
*/
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * What a failing status means for the person who pasted the URL.
 *
 * Every branch names the status AND one thing to try, because they are not the
 * same thing to try: a 403 wants a different page, a 404 wants a corrected
 * address, a 503 wants waiting.
 */
export function describeStatus(status: number): string {
  if (status === 401 || status === 403) {
    return `El sitio bloquea a los lectores automáticos (respondió ${status}). Probá con otra página del sitio, o cargá la marca a mano.`;
  }
  if (status === 404 || status === 410) {
    return `Esa dirección no existe en el sitio (respondió ${status}). Revisá la URL o probá con la home del cliente.`;
  }
  if (status === 429) {
    return "El sitio nos frenó por exceso de pedidos (respondió 429). Esperá un minuto y reintentá.";
  }
  if (status >= 500) {
    return `El sitio está caído o con problemas (respondió ${status}). Reintentá más tarde.`;
  }
  return `El sitio respondió ${status}. Probá con la home del cliente.`;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** Ranges that are not the public internet. */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — the cloud metadata endpoint lives here
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, includes 255.255.255.255
];

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    const value = ipv4ToInt(address);
    if (value === null) return true;

    return BLOCKED_V4.some(([base, bits]) => {
      const baseValue = ipv4ToInt(base);
      if (baseValue === null) return false;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
    });
  }

  if (version === 6) {
    const normalized = address.toLowerCase();

    // An IPv4-mapped address (::ffff:127.0.0.1) is an IPv4 address wearing a
    // hat, and skipping this check would be the whole bypass.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (mapped) return isPrivateAddress(mapped[1]);

    if (normalized === "::" || normalized === "::1") return true;
    // fc00::/7 unique local, fe80::/10 link-local.
    if (/^f[cd]/.test(normalized)) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    return false;
  }

  // Not an IP at all: refuse rather than assume.
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  // A literal IP never reaches the resolver, so it is checked directly.
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new CodedError("validation", "Esa dirección no es pública.");
    }
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new CodedError("validation", `No se pudo resolver el dominio ${hostname}.`);
  }

  if (addresses.length === 0) {
    throw new CodedError("validation", `No se pudo resolver el dominio ${hostname}.`);
  }
  // EVERY address must be public: a name answering with both a public and a
  // private address would otherwise be a coin flip.
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new CodedError("validation", "Ese dominio apunta a una dirección privada.");
  }
}

/** Any RFC-3986 scheme prefix, not just the two we accept. */
const HAS_SCHEME = /^[a-z][a-z0-9+.\-]*:/i;

export function normalizeSiteUrl(input: string): URL {
  const trimmed = input.trim();

  /*
    The scheme is checked BEFORE anything is prepended.

    Testing only for `^https?://` and prepending `https://` otherwise looks
    equivalent and is not: "file:///etc/passwd" has no `https://` prefix, so it
    became "https://file:///etc/passwd" — which parses cleanly as an https URL
    to a host called "file" and sailed past the protocol check below. Caught by
    scripts/verify-website.ts, which is why those three cases are in it.

    So: if the input names a scheme at all, it must already be one we accept.
    Only a bare "olivaresdelsur.com.ar" gets https put in front of it.
  */
  if (HAS_SCHEME.test(trimmed) && !/^https?:/i.test(trimmed)) {
    throw new CodedError(
      "validation",
      "Sólo se puede leer una dirección http o https.",
    );
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new CodedError("validation", "Esa no es una URL válida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CodedError("validation", "Sólo se puede leer una dirección http o https.");
  }
  if (!url.hostname) {
    throw new CodedError("validation", "Esa URL no tiene un dominio.");
  }
  return url;
}

export type FetchedPage = {
  /** Where the redirects ended up. Relative URLs in the HTML resolve against it. */
  finalUrl: string;
  html: string;
  truncated: boolean;
};

/** Read at most MAX_BYTES, then stop pulling. */
async function readCapped(response: Response): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: await response.text(), truncated: false };

  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > MAX_BYTES) {
      chunks.push(value.slice(0, value.byteLength - (total - MAX_BYTES)));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total > MAX_BYTES ? MAX_BYTES : total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { text: new TextDecoder("utf-8").decode(merged), truncated };
}

/**
 * Fetch a page the user named, following redirects one guarded hop at a time.
 */
export async function fetchSitePage(input: string): Promise<FetchedPage> {
  let url = normalizeSiteUrl(input);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        },
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new CodedError("network", "El sitio tardó demasiado en responder.");
      }
      throw new CodedError(
        "network",
        `No se pudo abrir el sitio: ${cause instanceof Error ? cause.message : "error de red"}.`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new CodedError(
          "site",
          "El sitio redirigió a ninguna parte. Probá con la home del cliente.",
        );
      }
      // Resolved against the current URL, so a relative Location works — and
      // the next iteration re-checks the address before going anywhere.
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) {
      throw new CodedError("site", describeStatus(response.status));
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      throw new CodedError(
        "validation",
        "Esa dirección no devuelve una página web. Pegá la home del cliente.",
      );
    }

    const { text, truncated } = await readCapped(response);
    return { finalUrl: url.toString(), html: text, truncated };
  }

  throw new CodedError(
    "site",
    "El sitio redirige demasiadas veces. Probá con la home del cliente.",
  );
}
