import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

/** Routes reachable without a session. Everything else requires auth. */
const PUBLIC_PREFIXES = ["/login", "/auth"];

/*
  `/preview` is public ONLY outside production.

  It renders the app's real screens with fixture data so design work does not
  require a session — see app/preview/layout.tsx for why that is needed at all.
  It is also, by construction, an unauthenticated route that draws application
  chrome, which is the kind of thing that is fine for months and then is not.

  Two independent guards, and this is the outer one: a Vercel build — preview
  deployments included — sets NODE_ENV to production, so there the route is
  never treated as public and this middleware redirects it to /login. The inner
  guard is a `notFound()` in the layout under the identical condition. Neither
  relies on the other, and both fail locked.

  Read at module scope on purpose: NODE_ENV is inlined at build time, so in a
  production bundle this constant is `false` and the branch is gone rather than
  merely unreachable.
*/
const PREVIEW_ENABLED = process.env.NODE_ENV !== "production";

function isPublicPath(pathname: string) {
  if (
    PREVIEW_ENABLED &&
    (pathname === "/preview" || pathname.startsWith("/preview/"))
  ) {
    return true;
  }

  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey } = supabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not remove or reorder this call.
  //
  // getUser() revalidates the token against the Auth server and, as a side
  // effect, writes refreshed cookies through setAll above. Using getSession()
  // here instead would read the cookie without verifying it — that is trivially
  // spoofable and must never gate a protected route.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/contenido";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Must return this exact response object. Constructing a fresh
  // NextResponse here would drop the refreshed auth cookies set above and
  // silently log the user out on the next request.
  return supabaseResponse;
}
