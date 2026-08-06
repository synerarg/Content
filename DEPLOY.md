# Deploy — Synera Content Studio

Everything needed to put this on Vercel, in the order it has to happen. Steps
marked **(solo vos)** need credentials or a console this project cannot reach.

---

## 1. Before you push

```bash
npm run verify:rls     # must end "All 9 tenant tables deny anonymous reads"
npx tsc --noEmit
npm run lint
npm run build          # STOP the dev server first — see the note below
```

> **Never run `npm run build` with `next dev` running.** The production build
> deletes and rewrites `.next` underneath the running server; every chunk
> reference goes stale and the app 500s with `Cannot find module './331.js'`.
> Recovery: stop the server, `Remove-Item .next -Recurse -Force`, restart.

Migrations are applied separately from the deploy — Vercel never touches the
database:

```bash
npm run db:push
```

---

## 2. Environment variables (Vercel → Settings → Environment Variables)

Set these for **Production** *and* **Preview**. Values come from `.env.local`;
`.env.local.example` documents each one.

| Variable | Scope | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | yes | Public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | yes | Publishable key (`sb_publishable_…`), public by design |
| `ANTHROPIC_API_KEY` | server | yes | Secret. Copy, template choice, batch assembly |
| `IMAGE_PROVIDER` | server | no | `google` (default here) or `fal` |
| `GEMINI_API_KEY` | server | if `google` | Secret |
| `GEMINI_IMAGE_MODEL` | server | no | Override; defaults to `gemini-2.5-flash-image` |
| `FAL_KEY` | server | if `fal` | Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **no** | **Do not set.** Nothing reads it, and it bypasses RLS |

Only the two `NEXT_PUBLIC_` variables are inlined into the browser bundle.
Everything else is read exclusively from route handlers and `server-only`
modules, so it never leaves the function.

`/configuracion` reports which of these are present once deployed — booleans
only, never any part of a value.

---

## 3. Function duration and region

`maxDuration` is declared per route, in the route file:

| Route | `maxDuration` | Why |
|---|---|---|
| `app/api/generate/text` | 60 s | One Claude call |
| `app/api/generate/image` | 120 s | Provider queue + a server-to-server copy into Storage |
| `app/api/generate/batch` | 180 s | Several posts in one structured-output call |

Hobby allows up to 300 s, Pro 300 s by default and 800 s max — all three fit
either plan.

**Set the function region to São Paulo (`gru1`).** The Supabase project lives in
`sa-east-1`; Vercel defaults to `iad1` (Washington), which puts an intercontinental
round trip on *every* query — and pages here make several. Vercel → Settings →
Functions → Function Region.

### What must never cross a function

Vercel caps request **and** response bodies at 4.5 MB. The architecture already
routes around it, and this is worth preserving:

- Logo and font uploads go browser → signed URL → Storage.
- Generated backgrounds are copied provider → Storage server-to-server; the
  client only ever receives a signed URL.
- The ZIP is assembled entirely in the browser.

---

## 4. Google OAuth **(solo vos)**

Email + password works without this. The "Continuar con Google" button will
error until it is configured.

**The detail that costs an hour if you get it backwards:** the redirect URI
Google needs is **Supabase's**, not the app's. It does **not** change between
localhost, preview and production — so this is a one-time setup, not a
per-environment one. What *does* change per environment is Supabase's redirect
allow-list, in step 4.3.

### 4.1 Google Cloud Console

1. APIs & Services → Credentials → Create credentials → **OAuth client ID**.
2. Application type: **Web application**.
3. Authorized redirect URI — exactly one, and this is the Supabase project's
   callback:

   ```
   https://dzxkxwuzfmoyktevfdfn.supabase.co/auth/v1/callback
   ```

4. Copy the client ID and client secret.

### 4.2 Supabase → Authentication → Providers → Google

Enable it and paste the client ID and secret. Nothing else on that page needs
changing.

### 4.3 Supabase → Authentication → URL Configuration

- **Site URL**: the production URL, e.g. `https://synera-content-studio.vercel.app`
- **Redirect URLs** — one line each:

  ```
  http://localhost:3000/**
  https://synera-content-studio.vercel.app/**
  https://*-<your-vercel-scope>.vercel.app/**
  ```

The third line is what makes preview deployments work; without it every preview
sign-in bounces with `redirect_to not allowed`. Supabase matches these as
patterns, so the `/**` suffix matters.

The app builds its own `redirectTo` from the hostname the browser is actually on
(`components/auth/login-form.tsx`), and the callback rebuilds it from
`x-forwarded-host` behind Vercel's proxy (`app/auth/callback/route.ts`) — which
is why no environment variable holds the site URL.

---

## 5. Storage

Both buckets carry server-side limits, applied by migration `0007` and asserted
by `0008`:

| Bucket | Public | Size limit | MIME types |
|---|---|---|---|
| `brand-assets` | yes | 2 MiB | png, jpeg, webp, svg, woff2 |
| `generated` | no | 10 MiB | png, jpeg, webp |

`brand-assets` is public on purpose: the browser fetches logos and fonts during
both rendering and rasterization, and signed URLs would add an expiry failure
mode to the export path. Writes stay locked to workspace members.

---

## 6. After the first deploy

1. Sign in with email + password (and with Google, once step 4 is done).
2. Open `/configuracion` — every integration should read as configured.
3. Create a brand, confirm the logo and fonts upload.
4. **Export one PNG from `/editor` with the tab visible and in the foreground.**

Step 4 is the one that matters. `html-to-image` resolves its image load inside a
`requestAnimationFrame` callback, and **rAF does not fire in a hidden or
background tab** — so the export hangs there rather than failing. It has never
been verified end to end; every step upstream of it has. See `HANDOFF.md` §6.
