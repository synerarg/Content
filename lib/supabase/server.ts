import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/** Supabase client for Server Components, Server Actions, and Route Handlers. */
export async function createClient() {
  // `cookies()` is awaited first, and deliberately so: touching a dynamic API
  // opts the caller out of static generation. If the env check ran first it
  // would throw during `next build` while prerendering, turning a missing env
  // var into a build failure instead of a clear runtime error.
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. This is expected and safe to
          // ignore: middleware.ts refreshes the session on every request, so the
          // cookies are already current by the time we get here.
        }
      },
    },
  });
}
