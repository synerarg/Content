import { LoginForm } from "@/components/auth/login-form";
import { LoginErrorToast } from "@/components/auth/login-error-toast";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      {/* A single soft cyan glow behind the card — accent as light, not paint. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] opacity-[0.07] blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, var(--synera-accent), transparent 65%)",
        }}
      />
      <LoginErrorToast message={error} />
      <LoginForm next={next} />
    </main>
  );
}
