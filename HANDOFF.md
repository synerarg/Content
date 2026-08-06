# Synera Content Studio — Handoff

**Read this before touching anything.** It captures decisions, live credentials state,
and a list of traps that cost real time to find. Phases 0–6 are built. What is left is
listed in §9 and is almost entirely work only the account owner can do.

Original plan: `C:\Users\Admin\.claude\plans\claude-code-plan-mode-federated-balloon.md`

---

## 1. What this is

An agency tool that produces social posts for client brands. The architectural rule
everything follows:

> **AI never renders typography. Code does.**

The image model produces *backgrounds only* — text is explicitly excluded from the
prompt. Claude writes the copy and picks the template. Parameterized React components
render the text with each brand's real design tokens. Export is a client-side
rasterization of that same component, so preview and PNG cannot diverge.

Working directory: `C:\Users\Admin\Downloads\Content` (Windows, PowerShell).
Not a git repo beyond the create-next-app initial commit.

---

## 2. Environment and credentials — current state

`.env.local` exists and is gitignored (`.env*`). Masked status as of handoff:

| Variable | State | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | set | `https://dzxkxwuzfmoyktevfdfn.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | set | 46-char **publishable** key (`sb_publishable_…`), not the legacy JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | **empty** | Not needed so far. User must paste it themselves if ever required |
| `ANTHROPIC_API_KEY` | set | Working, verified with live calls |
| `GEMINI_API_KEY` | set | Working, verified with live image generation |
| `GEMINI_IMAGE_MODEL` | empty | Optional override; defaults to `gemini-2.5-flash-image` |
| `IMAGE_PROVIDER` | `google` | Set to `fal` to switch back |
| `FAL_KEY` | set but **account has no balance** | Code works; fal returns "Exhausted balance" |

**Never ask the user to paste secrets into chat.** The Supabase publishable key is
public by design and safe; everything else is not.

---

## 3. Supabase — important account subtlety

- Project: **`synera-content-studio`**, ref **`dzxkxwuzfmoyktevfdfn`**, region `sa-east-1`.
- It lives in org **`ContentStdui`**, under the user's **personal** Supabase account
  (**BrunoMendiburu**) — *not* the `synera` account.
- **The Supabase MCP connector is scoped to the `synera` account and cannot see this
  project.** Do not try to use `mcp__…supabase…` tools on it; they will only ever list
  the 5 unrelated `synera` client projects. Those are production client databases —
  **never touch them.**
- All database work goes through the **Supabase CLI**, already installed as a
  devDependency and already linked. `supabase db push` against a *remote* project does
  **not** need Docker.
- **Docker is NOT installed** on this machine. That rules out `supabase start`,
  `supabase db dump`, and `supabase db diff`. `db push` and `gen types` work fine.
  Expect a harmless `failed to cache migrations catalog … Docker` warning on every push.

---

## 4. Stack — exact, with reasons

| Concern | Choice | Why it matters |
|---|---|---|
| Framework | **Next.js 15.5.22** (pinned) | `create-next-app` installs **16.x**. The house stack is 15. Pinning back broke the scaffold's `LayoutProps<"/">` type and its flat ESLint config — both already fixed |
| Security | `overrides` on `postcss ^8.5.25`, `sharp ^0.35.3` | Next 15 pulls 3 **high-severity** transitive advisories with no in-15 fix. The overrides clear them while keeping Next 15. `npm audit` = 0 |
| Styling | Tailwind **v4**, CSS-first | No `tailwind.config.js`. Tokens live in `@theme` in `app/globals.css` |
| Components | shadcn/ui on **Radix** (`--base radix`) | The CLI now defaults to Base UI. `form` is **not available** in the registry — react-hook-form is wired manually |
| Validation | **zod v4** | See traps §7 |
| Text AI | **`claude-sonnet-5`** | **Not `claude-sonnet-4-6`** — 4.6 does *not* support `output_config.format` (structured outputs), which the whole generation design depends on |
| Image AI | **Gemini `gemini-2.5-flash-image`** | fal/FLUX.2 is fully coded and working but the account has no balance |
| Rasterize | `html-to-image` | Client-side only. Not Satori |
| ZIP | `jszip` | Client-side only |

---

## 5. What's built (phases 0–6)

### Database — 9 migrations, all applied to remote

```
20260805000100_workspaces.sql        workspaces, workspace_members,
                                     current_workspace_ids(), signup trigger,
                                     set_updated_at() shared trigger fn
20260805000200_brands.sql            brands, brand_fonts, brand-assets bucket (public)
20260805000300_fix_storage_policies  current_workspace_ids_text() + rebuilt storage
                                     policies  ← READ THIS ONE, see §7
20260805000400_generations.sql       generations audit log (append-only)
20260805000500_generated_bucket.sql  `generated` bucket (private, signed URLs)
20260805000600_batches.sql           content_batches, posts, slides
20260805000700_storage_limits.sql    file_size_limit + allowed_mime_types on both
                                     buckets  (Phase 6)
20260805000800_assert_storage_...    asserts 0007 actually landed; writes nothing,
                                     raises if not  (Phase 6)
20260805000900_generation_usage_...  generation_usage_daily view, security_invoker
                                     ← the one line that matters, see §7  (Phase 6)
```

### RLS design (applies to every table)

1. `workspace_id` denormalized onto **every** tenant table — policies never walk FK chains.
2. Membership resolved via `SECURITY DEFINER` helpers so `workspace_members`' own policy can't recurse.
3. Table policies: `workspace_id in (select public.current_workspace_ids())`.
4. **Storage policies: `(storage.foldername(name))[1] = any (public.current_workspace_ids_text())`** — different form, see §7.
5. `auth.uid()` always wrapped as `(select auth.uid())`.

### Application

```
app/(app)/marcas          Brand Kit CRUD, palette editor w/ live WCAG contrast
app/(app)/editor          Single-piece editor: generate text, generate background, export PNG
app/(app)/contenido       Batch list + create; /[id] = batch detail, per-slide edit, ZIP
app/(app)/plantillas      Template gallery
app/(app)/configuracion   Generation spend + integration status  (Phase 6)
app/(app)/error.tsx       Group-wide error boundary, inside the shell  (Phase 6)
app/(app)/not-found.tsx   For notFound() under the shell  (Phase 6)
app/(app)/*/loading.tsx   Per-route skeletons  (Phase 6)
app/global-error.tsx      Root-layout failures; self-contained, no globals.css  (Phase 6)
app/api/generate/text     Single post   (claude-sonnet-5, maxDuration 60)
app/api/generate/batch    Whole batch   (claude-sonnet-5, maxDuration 180)
app/api/generate/image    Background    (Gemini, maxDuration 120)
app/api/uploads/sign      Signed direct-to-Storage upload URLs
templates/                6 templates + typed registry (registry is source of truth)
prompts/                  Versioned prompt files — never inline strings
lib/render, lib/export    Brand tokens, font embedding, rasterizer, ZIP
lib/format.ts             Locale/timezone-pinned display formatting  (Phase 6)
scripts/verify-rls.mjs    `npm run verify:rls`
```

**`/configuracion`** reads `generation_usage_daily` (pre-aggregated in SQL, not in JS —
`generations` grows forever) plus the last 20 raw rows. It reports integration status as
booleans only: no key value, prefix or length is ever rendered. Costs are the estimates
written at call time with that day's rate, so historical rows stay right after the
Sonnet 5 intro pricing lapses on 2026-09-01.

**Templates (6):** `bold-headline`, `quote-card`, `list-tips`, `story-cta` (role `single`);
`carousel-cover` (role `cover`); `carousel-body` (role `body`). Each declares a zod slot
schema that drives *both* the editor inputs and Claude's structured output. Adding a
template automatically teaches the prompts its slot names and character limits.

---

## 6. Verification status — read honestly

| Verified by machine | Status |
|---|---|
| RLS: 9/9 tenant relations deny anonymous reads | PASS (`npm run verify:rls`) |
| Claude text generation, live | PASS — Rioplatense voseo, no tuteo leakage |
| Prompt caching | PASS — 2,035 tokens read back on 2nd call |
| Gemini image generation, live | PASS — both aspect ratios, no text in output |
| No-text directive enforcement | PASS — 3 cases incl. empty art direction |
| SVG serialization at both formats | PASS — exact 1080×1350 / 1080×1920 |
| typecheck / lint / production build | PASS — 16 routes, Phase 6 included |
| Storage limits are live on both buckets | PASS — migration 0008 asserts them in-database |
| `generation_usage_daily` denies anonymous reads | PASS — 200 `[]`, so RLS filters it rather than the grant being absent |
| Phase 6 CSS reached the browser | PASS — `::selection`, `:focus-visible`, `prefers-reduced-motion` all present in the live stylesheet |

**NOT verified — the important gap:**

> **The SVG→canvas→PNG step has never been verified end-to-end.**
> `html-to-image` resolves its image load inside a `requestAnimationFrame` callback, and
> **rAF never fires in a hidden tab**. The Claude Browser pane doesn't composite, so
> `toPng` hangs there forever. Confirmed directly: with `document.hidden === true`, rAF
> never fires while `Image.onload` still does.
>
> Everything *upstream* of that step is verified. The final rasterization can only be
> confirmed by a human with a visible browser tab.

**Checkpoints confirmed by the user:** Phase 0 (auth/shell), Phase 1 (brands, logo +
fonts saved after the storage-policy fix). **Phases 2, 3, 4, 5, 6 were never confirmed** —
the user said "dale con la fase N" each time without reporting results.

**Phase 6 was not verified visually.** No authenticated screenshot exists of any Phase 6
work. Two reasons, both structural: the agent has no session in its browser (and must not
enter a password), and the Claude Browser pane does not composite, so screenshots time
out — the same non-compositing limitation that breaks `toPng` there. `/configuracion`,
the loading skeletons, the mobile tab strip and the error boundary are verified by
typecheck, lint, a production build and a live CSS probe, **not by eye**. Someone should
look at them once.

**`npm run verify:rls` is a leak detector, not a health check.** It only tests the
*anonymous* path. It passed green the whole time uploads were broken for authenticated
users. Do not present it as full RLS verification.

---

## 7. Traps — every one of these cost real time

**Storage RLS policy form.** Table policies use `x in (select public.current_workspace_ids())`
and work. Storage policies **must** use
`(storage.foldername(name))[1] = any (public.current_workspace_ids_text())`.
The original storage policy used a correlated `EXISTS` over a set-returning function with
a column alias — it silently evaluated **false**, so every upload failed with
*"new row violates row-level security policy"* while table inserts succeeded. Migration
0003 replaced it and added the missing `SELECT` policy (`upsert: true` needs it).
**Use the `= any(...)` form for any new bucket.**

**A Postgres view over an RLS table bypasses RLS by default.** Views execute as their
OWNER, which here is `postgres` — a role RLS does not apply to. `generation_usage_daily`
would have served every workspace's spend to any caller while `generations` itself stayed
correctly locked down, and no test against the base table would ever have caught it. The
fix is one clause: `create view ... with (security_invoker = on)`. **Any future view over
a tenant table needs it**, and needs adding to `TENANT_TABLES` in `verify-rls.mjs` — that
list is the only thing that proves it.

**Never run `npm run build` while the dev server is running.** The production build
deletes and rewrites `.next` under the running server; every chunk reference goes stale
and the app 500s with `Cannot find module './331.js'`. Recovery: stop server →
`Remove-Item .next -Recurse -Force` → restart. This happened once and looked like an app bug.
`next.config.ts` now reads `NEXT_DIST_DIR`, so a verification build can sidestep this
entirely: `NEXT_DIST_DIR=.next-build npm run build`. Note it rewrites `tsconfig.json`'s
`include` to add the alternate types path — revert that hunk, it should not be committed.

**`update ... where` in a migration succeeds when it matches nothing.** Migration 0007
sets the bucket limits; "the migration applied" is therefore not evidence they exist. And
nothing on this machine can read `storage.buckets` back: it is behind RLS (invisible to
the publishable key), and `db dump`/`db diff` both need Docker. Migration 0008 exists
solely to assert the values in-database. Same pattern is worth reaching for whenever a
migration's effect cannot be read back from here.

**Supabase Storage ignores the `contentType` you pass for a File.** `uploadToSignedUrl`
takes two paths: a `Blob`/`File` body goes out as multipart and the server records the
type from the **file's own** `type` field, so `fileOptions.contentType` is silently
discarded. That value comes from the OS registry and is `""` more often than expected —
Windows has no registered type for `.woff2`, and `.svg` is missing on many machines. Empty
arrives as `application/octet-stream`, which the `allowed_mime_types` added in 0007 now
rejects. `withDeclaredType()` in `lib/storage.ts` re-wraps the File with a type derived
from its extension. Adding a bucket MIME allowlist without this makes uploads fail on some
machines and not others.

**Vercel's proxy makes `new URL(request.url).origin` the wrong host.** The function sees
an internal hostname, so an OAuth callback built from `origin` redirects users somewhere
that does not resolve — in production only. `app/auth/callback/route.ts` prefers
`x-forwarded-host`, which Vercel overwrites on every inbound request so a client cannot
forge it.

**Cross-origin images taint the canvas.** Anything from Supabase Storage (logos,
backgrounds) must be fetched and converted to a **blob URL** before rendering, or
`toPng` throws `SecurityError`. `toObjectUrl()` in `lib/export/rasterize.ts`.

**Fonts must be self-hosted AND data-URI embedded.** `html-to-image` serializes into an
SVG `<foreignObject>` — a separate document. A cross-origin Google stylesheet can't be
read, so the embed silently produces nothing and the PNG falls back to a system font
*while the preview still looks correct*. Google Fonts are downloaded server-side into
Storage at brand-save time, then inlined as base64 in `@font-face`.

**Structured outputs can't express string length.** The SDK strips `minLength`/`maxLength`
before sending and validates client-side — so the model never sees the limit but the parse
still fails over it. Pattern used everywhere: **lenient AI-facing schema, limits stated in
the prompt, overflow trimmed at a word boundary afterwards with a warning.**

**zod v4 specifics.** Don't use `.default()` or `z.coerce.number()` in schemas consumed by
react-hook-form — both make the zod *input* type diverge from the *output* type, and
`zodResolver` then needs casts to compile. Character limits are read from zod internals
(`field._zod.def.checks[].._zod.def.check === "max_length"`); this was verified against
zod 4.4.3, and would need re-checking on a zod upgrade.

**Gemini image API.** Endpoint is `/v1beta/interactions`, auth via `x-goog-api-key`.
It **rejects `image/png`** in `response_format.mime_type` (only `image/jpeg` accepted)
but then **returns PNG anyway** — hence format detection by magic bytes, never by the
declared mime type. The image is at **`steps[].content[]` with `type: "image"`**, *not*
`output_image.data` as the docs summary claims. It **approximates** aspect ratios
(4:5 → 896×1152, 9:16 → 768×1344) and returns ~1 MP regardless of `image_size: "2K"`;
the 2–3% crop under `object-fit: cover` is negligible. **Free tier is 2 images/minute** —
this bites on carousels.

**FLUX.2 has no `negative_prompt` parameter.** The no-text directive lives in the
*positive* prompt, appended by the engine so a caller can't forget it.

**fal errors.** fal puts the useful text in `body.detail` and leaves `message` as the bare
HTTP reason ("Forbidden"). Same pattern for Gemini (`error.message`). Both are unwrapped.

**Probing server modules from plain Node.** `lib/**` files with `import "server-only"`
throw outside a bundler. To run a probe script:
create `scripts/_empty.cjs` (`module.exports = {}`) and a stub that redirects
`server-only` to it via `Module._resolveFilename`, then
`npx tsx --require ./scripts/_stub-server-only.cjs scripts/yourprobe.ts`.
Also: package.json has no `"type": "module"`, so **tsx treats `.ts` as CJS and top-level
`await` fails** — wrap probe bodies in an `async function main()`.

**PowerShell mangles JSON.** `ConvertFrom-Json` piped from a native command collapsed a
4-element array such that `[string]` of it joined all four values — this silently wrote a
**concatenated key containing `service_role` into a `NEXT_PUBLIC_` variable**. Use **Node**
for any JSON parsing that matters. Also: PowerShell pipes prepend a UTF-8 BOM that
`JSON.parse` rejects.

---

## 8. Commands

```bash
npm run dev            # dev server (NOT while building)
npm run build          # stop dev server first
npm run lint
npx tsc --noEmit
npm run db:push        # apply migrations to remote
npm run db:types       # regenerate lib/supabase/database.types.ts
npm run verify:rls     # anonymous-access leak check
```

---

## 9. Phase 6 — done, and what remains

**Built in Phase 6**

1. **Storage bucket limits** — closed. Migrations 0007 (set) and 0008 (assert). Both
   buckets now carry a server-side size cap and a MIME allowlist; the 2 MB logo check in
   the browser is a fast-fail courtesy, not the boundary. Required a matching client fix,
   see the `contentType` trap in §7.
2. **Loading, error and not-found states** — per-route skeletons sized to the real
   layouts, a group error boundary that keeps the sidebar navigable, a `not-found` whose
   copy never confirms whether a row exists, and a self-contained `global-error`.
3. **Cost display** — `/configuracion`, over the new `generation_usage_daily` view.
   Totals, last 30 days, per kind, per brand, last 20 calls with their error text, and
   integration status.
4. **Mobile review screens** — the nav was a `flex-col` list inside a horizontal
   scroller, which stacked into a block that pushed the page below the fold; it is now a
   real tab strip. The phone header gained the account menu (there was previously no way
   to sign out on mobile). Slot fields collapse behind a toggle on small screens so the
   preview and caption lead; desktop is unchanged.
5. **Design polish** — `/editor` was rendering three cyan-filled buttons at once, which
   is exactly the large-fill use the design language rules out; generation actions are
   now `secondary` and the export is the screen's one primary CTA. Every screen is down
   to one. Plus accent `::selection`, an explicit `:focus-visible` ring (plain `<a>`
   elements had none), and a `prefers-reduced-motion` block.
6. **Deploy prep** — `DEPLOY.md`, a real `README.md`, corrected `.env.local.example`,
   the `x-forwarded-host` fix in the OAuth callback, and `NEXT_DIST_DIR` in
   `next.config.ts`.

**What is left — all of it needs the account owner**

1. **Google OAuth.** Code is written and working; it needs a Google Cloud OAuth client.
   `DEPLOY.md` §4 has the exact steps. One correction to what this file used to say: the
   redirect URI Google needs is **Supabase's** (`https://dzxkxwuzfmoyktevfdfn.supabase.co/auth/v1/callback`)
   and it does **not** change between localhost, preview and production. What changes per
   environment is Supabase's **Redirect URLs allow-list**, which needs a wildcard entry
   for preview deployments.
2. **Vercel project** — create it, set the env vars from `DEPLOY.md` §2, and set the
   function region to **`gru1` (São Paulo)**. Supabase is in `sa-east-1`; Vercel defaults
   to `iad1`, which puts an intercontinental round trip on every query.
3. **Confirm the PNG export**, still (see §6). Unchanged and still the most important
   open item: it is the foundation of Phases 2–5 and has never run end to end.
4. **Look at the Phase 6 screens once** (see §6) — none of them has been seen by a human
   or a screenshot.

**Vercel limits that shaped the design — keep them in mind**
- **Request *and* response body cap 4.5 MB.** Hence: uploads go browser → signed URL →
  Storage; generated images are copied fal/Gemini → Storage server-to-server; the ZIP is
  assembled entirely in the browser. **Never route image or ZIP bytes through a function.**
- Duration: Hobby 300s max; Pro 300s default / 800s max. Current routes: 60 / 120 / 180.
