/**
 * Fail loudly and specifically when Supabase config is missing.
 *
 * Without this, an unset env var surfaces as `supabaseUrl is required` from deep
 * inside the SDK, which tells you nothing about what to actually do.
 */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `Missing Supabase environment variable(s): ${missing}. ` +
        "Copy .env.local.example to .env.local and fill them in.",
    );
  }

  return { url, anonKey };
}
