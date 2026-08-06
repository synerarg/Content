import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / email-confirmation landing route.
 *
 * Supabase redirects here with a `code` that must be exchanged for a session
 * server-side. The exchange writes the auth cookies, after which middleware
 * takes over session refresh on subsequent requests.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/contenido";

  // Only ever redirect to a path on this origin. An attacker-supplied absolute
  // URL in `next` would otherwise turn this into an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/contenido";

  /*
    Behind Vercel's proxy the function sees an INTERNAL host, so
    `new URL(request.url).origin` is not the address the user is browsing. Left
    alone, that lands every OAuth sign-in on a hostname that does not resolve
    for them — and only in production, where it is most expensive to discover.

    x-forwarded-host is the public hostname, set by the platform. Trusting a
    header is normally how host-header attacks start; it is safe here because
    Vercel overwrites it on every inbound request (a client cannot forge it),
    and because it is only ever used to rebuild a same-host URL whose path
    already went through the `safeNext` check above. Locally the header is
    absent and `origin` is already correct.
  */
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    forwardedHost && process.env.NODE_ENV === "production"
      ? `https://${forwardedHost}`
      : origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${base}${safeNext}`);
    }

    return NextResponse.redirect(
      `${base}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  const errorDescription = searchParams.get("error_description");
  return NextResponse.redirect(
    `${base}/login?error=${encodeURIComponent(
      errorDescription ?? "No se pudo completar el inicio de sesión.",
    )}`,
  );
}
