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

> **A successful build does NOT mean these are set.** Nothing reads them at
> build time, so a project with zero variables deploys green and then answers
> `MIDDLEWARE_INVOCATION_FAILED` — a blank 500 on every route, `/login`
> included — on the first request. This has already happened once. If you see
> that error, check the runtime logs for `Missing Supabase environment
> variable(s)` before looking anywhere else.
>
> Two follow-ons: `NEXT_PUBLIC_*` values are baked into the build, so **saving a
> variable does not fix an existing deployment** — redeploy with the build cache
> disabled. And tick **Preview** as well as Production, or every branch
> deployment fails this way while production looks fine.

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

### 4.1 Google Cloud Console — consent screen first

Google will not let you create a Web application client until the consent screen
exists, so this comes first even though it feels like paperwork.

1. **Google Auth Platform → Branding** (older consoles: APIs & Services → OAuth
   consent screen). App name, user support email, developer contact email.
2. **Audience**: *External* unless the account is on Google Workspace and only
   staff will ever sign in — in which case *Internal* skips the next warning
   entirely.
3. Scopes: the defaults (`email`, `profile`, `openid`) are all this app asks
   for. Do not add more; anything beyond these triggers Google verification.

> **External + Testing only lets listed test users in.** A new External app
> starts in *Testing*, where sign-in fails with "Access blocked: … has not
> completed the Google verification process" for anyone not on the test-user
> list. Either add every person who will sign in under **Audience → Test
> users**, or press **Publish app** to move it to *Production* — which is fine
> without verification while the app requests only the three basic scopes above.

### 4.2 Google Cloud Console — the client

1. APIs & Services → Credentials → Create credentials → **OAuth client ID**.
2. Application type: **Web application**.
3. Authorized redirect URI — exactly one, and this is the Supabase project's
   callback, *not* the app's:

   ```
   https://dzxkxwuzfmoyktevfdfn.supabase.co/auth/v1/callback
   ```

   Leave "Authorized JavaScript origins" empty; the browser never talks to
   Google directly here.
4. Copy the client ID and client secret.

### 4.3 Supabase → Authentication → Providers → Google

Enable it and paste the client ID and secret. Nothing else on that page needs
changing.

### 4.4 Supabase → Authentication → URL Configuration

This section governs **every** link Supabase emails, not just OAuth — signup
confirmations and password resets come from here too.

- **Site URL**: `https://content-nine-neon.vercel.app`
- **Redirect URLs** — one line each:

  ```
  https://content-nine-neon.vercel.app/**
  http://localhost:3000/**
  https://*-<your-vercel-scope>.vercel.app/**
  ```

The third line is what makes preview deployments work; without it every preview
sign-in bounces with `redirect_to not allowed`. Supabase matches these as
patterns, so the `/**` suffix matters.

> **A URL that is not on the allow-list is IGNORED, not rejected.** Supabase
> silently falls back to the Site URL instead — which is why a signup
> confirmation email can arrive pointing at `localhost:3000` even though the
> code passes a correct `emailRedirectTo` built from the live hostname. This
> already happened once. If a confirmation link goes somewhere unexpected, the
> allow-list is the first thing to check, and the Site URL is what you are
> actually seeing.

The app builds its own `redirectTo` from the hostname the browser is actually on
(`components/auth/login-form.tsx`), and the callback rebuilds it from
`x-forwarded-host` behind Vercel's proxy (`app/auth/callback/route.ts`) — which
is why no environment variable holds the site URL.

### 4.5 Check that Google did not create a *second* account

Sign in with Google using an address that **already has an email + password
account**, then confirm you land in the workspace that has your brands rather
than an empty one.

Supabase links a Google identity onto an existing user when the addresses match
and both are verified. When they are not linked, a second `auth.users` row is
created — and because `handle_new_user()` gives every new user its own
workspace, that means a second, empty workspace. Nothing is lost, but it looks
exactly like data loss: you sign in with Google and every brand is gone.

If it happens, the fix is the "link identities with the same email" setting in
Supabase Auth plus confirming the original account's email address — not
recreating the brands.

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
