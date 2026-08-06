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
20260805001000_background_queue.sql  background_status/error/attempts/started_at on
                                     slides — the background queue's state  (Phase 7)
20260805001100_brand_history.sql     brand_published_posts + brands.content_analysis
                                     — what the brand already published  (Phase 7)
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
lib/batch/recipe.ts       Batch composition: presets, schema, expansion  (Phase 7)
lib/batch/use-background-queue.ts   The queue driver  (Phase 7)
lib/ai/analyze-history.ts Extracts already-used angles from published posts  (Phase 7)
app/api/analyze/history   Runs that extraction, stores it on the brand  (Phase 7)
app/(app)/marcas/[id]/historial     Import published posts, run the analysis  (Phase 7)
scripts/verify-rls.mjs    `npm run verify:rls`
scripts/_stub-server-only.cjs       Lets probes import `server-only` modules
```

### Batch recipes and the background queue (Phase 7)

**A batch is requested as a COMPOSITION, not a count.** `postCount: 3` became a recipe —
`1 carrusel de 4 placas · 1 feed · 3 historias` — with presets in `lib/batch/recipe.ts`.
The prompt enumerates the pieces one per line, and `reconcileWithRecipe()` then checks
what came back against what was asked for. It matches **by type, greedily, not by
position**: a model that returns the right pieces in the wrong order gets reordered, where
positional matching would relabel a feed post as a carousel and mangle its copy. Short
carousels are padded, long ones truncated, extras dropped, shortfalls reported — all as
warnings. Before this, asking for 5 and getting 4 was silent.

**Backgrounds run as a queue driven by the browser, with its state in Postgres.** The
provider rate limit is the binding constraint: the Gemini free tier does ~2 images/minute,
so eight backgrounds is ~4 minutes of mostly waiting — which cannot be a Vercel function
(300s ceiling, and billing function time to sleep). So the browser walks the list one
request at a time while `slides.background_*` holds the state, which is what makes a
reload resume instead of restart and lets a failure keep its reason.

The queue **has no configured delay**. It runs flat out and slows only when the API
answers 429, honouring the delay the provider asked for. Free tier throttles itself to
~2/min; a paid tier never 429s and runs at full speed. Neither needs a setting.

### Not repeating published content (Phase 7)

**The generator repeats itself, and this was measured, not suspected.** Three consecutive
batches on the same brief each produced a story titled *"Tu competencia ya tiene web"* —
against a brand that had already published exactly that argument. One produced *"Un
catálogo de fotos no cobra"* against a published caption reading *"no es un catálogo de
fotos"*. It was copying content it had never been shown.

**The obvious fix does not work.** Pasting the last N captions into the prompt with "do
not repeat these" was tested first and **failed**: lexical overlap with the history went
*up* (17% → 18.6%), and the batch reused an angle that was sitting in the list it had been
handed. Asking a model to abstract an angle out of each caption AND then avoid that
abstraction is two jobs, and the brief pulls hard against both.

**What works is two steps.** `analyzePublishedHistory()` extracts NAMED angles, hooks and
phrases (`presion-competencia: tu competencia ya avanzó y vos te quedás atrás`), and the
batch prompt forbids them by name. Same brief, same brand: the run without prohibitions
produced "Tu competencia ya tiene web" for the third time; the run with them did not, and
found two angles absent from the history entirely (platform risk, pricing power).

The extraction runs **once per history change, not per batch** — US$0.027, stored on the
brand — so batches carry a few hundred tokens of prohibitions and nothing else changes.

**The measurement caveat, so nobody repeats the mistake:** the automated keyword-collision
metric reported 0/7 for both runs and was useless — it required literal matches of long
phrases that would never reappear verbatim. The evidence that counted was a targeted check
for the specific angle that had leaked, plus reading the headlines. **A real check needs
semantic similarity, not keywords.**

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
| Recipe module, 17 assertions | PASS — presets, expansion order, and every invalid composition rejected |
| `reconcileWithRecipe`, 20 assertions | PASS — incl. out-of-order input reordered rather than relabelled, padding, truncation, shortfall and extras |
| Batch generation against the recipe, **live** | PASS — asked for 1 carousel of 4 + 1 feed + 3 stories, got exactly that; correct cover/body roles; formats derived from type; 0 warnings; no text/logo leakage into any scene; 53.8s, US$0.0575 |
| Two-step angle prohibition, **live A/B** | PASS — without prohibitions the batch produced "Tu competencia ya tiene web" (3rd consecutive run); with them it did not, and found two angles absent from the history |
| Raw-captions-in-prompt approach, **live A/B** | **FAIL, and it is why the two-step exists** — overlap rose 17%→18.6% and it reused an angle from the list it was given |
| `content_analysis` round-trip and degradation | PASS — unanalysed `{}`, null, and an older shape all degrade to "no prohibitions" instead of throwing; extra fields still parse |
| Slot labels / required-slot reflection, 9 asserts | PASS — every template has a required slot and a Spanish label for every field; export gating rejects blank and whitespace-only |
| Brand readiness, 11 asserts | PASS — each gap detected individually, a freshly created brand correctly blocks on art direction, null input does not throw |
| Error taxonomy, 17 asserts | PASS — explicit codes beat heuristics; real Gemini/fal/Anthropic messages classify correctly; aborts never report as failures; no English in any user-facing string |

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

**`revalidatePath` in a server action refreshes the page you are standing on.** The
background queue calls `setSlideBackground` once per completed slide. With the default
revalidate, each call handed `BatchDetail` a new `initialPosts` identity, which re-ran the
effect that owns the blob URLs — and its cleanup revoked every background on screen. One
flicker per slide, worsening as the batch got bigger. Two fixes: the queue passes
`revalidate: false` and revalidates once at the end, and the effect now revokes only on
unmount and skips slides it has already converted. **Any new per-item server action called
in a loop needs the same treatment.**

**`.next-build` was never in eslint's ignore list.** `NEXT_DIST_DIR` (added in Phase 6 to
build without clobbering a running dev server) writes there, and `eslint.config.mjs`
ignored only `.next/**` — so `npm run lint` reported ~1,000 errors from generated code the
first time the directory was left on disk. Fixed. The lesson generalises: `.gitignore` and
eslint's `ignores` are separate lists and both need the entry.

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

**A new External Google OAuth app only lets *listed test users* in.** It starts in
*Testing*, where anyone not on the test-user list is refused with "Access blocked: … has
not completed the Google verification process" — which reads like the app is broken rather
than unconfigured. Either add every person who will sign in under Audience → Test users,
or press **Publish app**, which is fine without verification while only `email`, `profile`
and `openid` are requested. `DEPLOY.md` §4.1.

**Signing in with Google can silently create a SECOND account — and an empty workspace.**
Supabase links a Google identity onto an existing user only when the addresses match and
both are verified. Otherwise it inserts a new `auth.users` row, and `handle_new_user()`
dutifully gives it a fresh workspace. Nothing is lost, but it presents exactly as data
loss: you sign in with Google and every brand is gone. The fix is the "link identities
with the same email" setting plus confirming the original account's address — **not**
recreating the brands. `DEPLOY.md` §4.5.

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

---

## 10. Phase 7 — automating content creation

Built on request after the Vercel deploy, to cut the click count. A week of content
(1 carousel of 4 + 1 feed + 3 stories = 5 pieces, 8 slides) used to be **1 click to write
the copy, then 8 separate clicks to generate backgrounds one at a time, waiting ~15s at
each**. It is now 1 click for the copy, 1 to start the queue, and 1 for the ZIP.

- **Recipe** — presets (Semana completa / Un carrusel / Solo historias) plus a custom
  builder. See §5.
- **Queue** — one button generates every missing background, paced by the provider's own
  429s, with pause, per-slide retry, and persisted state. See §5.
- **Visibility** — a progress strip with a live estimate and a rate-limit countdown on the
  batch page, a status chip and its error under each preview, and `n/m fondos` on every
  row of the batch list.

Auto-starting the queue on batch creation was considered and **deliberately rejected** by
the account owner: reviewing the copy before spending four minutes of generation avoids
regenerating backgrounds for text that is about to change.

### Nielsen heuristics — level 1 (Phase 7)

A separate spec (`nielsen-heuristics-prompt.md`) turns Nielsen's 10 heuristics into ~60
acceptance criteria for this app. The full audit is in that document's checklist format;
level 1 — the cheap, high-impact half — is built:

- **Slot fields are named in Spanish.** The editor used to render the raw JSON keys as
  labels, so account managers saw `headline`, `swipe_hint` and `item_1`. The registry now
  carries `slotLabels` beside the existing `slotHints`, and both are shown.
- **Required vs optional is read off the zod schema** (`isSlotRequired`), the same
  reflection trick already used for `max_length`. One source of truth, so a template that
  changes its mandatory slots needs no second edit.
- **The ZIP export is gated.** Rasterizing a slide with no background or an empty required
  slot does not fail — it produces a valid PNG with a hole in it. The button now names
  what is missing. This audit is also what surfaced that `list-tips` required only its
  heading, so a tips card with no tips passed every check; `item_1` and `item_2` are now
  required in the schema, which fixes the generation too.
- **One confirmation component.** `components/ui/confirm-dialog.tsx` on Radix AlertDialog
  replaces the two `window.confirm` calls. Deleting a brand needs its name typed;
  deleting a batch does not — a batch is an afternoon, a brand is the client.
- **Brand readiness is checked before any AI call** (`lib/brand-readiness.ts`): palette,
  fonts and art direction. A brand missing them blocks the spend with a link to the gap
  instead of returning a generic background.
- Determinate ZIP progress bar; `RefreshCw` means regenerate app-wide; formats read "Post
  de feed (4:5)"; relative dates ("hace 2 horas") in the lists.

### Nielsen heuristics — level 2 (Phase 7)

- **One error surface.** `lib/errors.ts` classifies a failure into eight classes and
  `lib/notify.ts` renders it as title + why + one action. Routes put an explicit `code` on
  the wire (`CodedError` → `codeOf`); **string matching is only the fallback**, since
  provider messages change with versions and are not a contract. A safety refusal
  deliberately gets NO retry button — pressing it would fail identically and cost another
  call.
- **Cancel actually aborts.** `AbortController` in the queue and in all three generation
  panels. An aborted slide returns to `pending`, never `failed` — nothing is wrong with
  it. Honest limit, worth knowing: aborting stops the browser waiting and stops the result
  being written, but does **not** cancel a generation the provider already started, so a
  cancelled slide may still have cost money.
- **Autosave, 2 s debounce, with a visible indicator.** Saves were on blur only, so
  closing the tab mid-field discarded it silently. Saves are keyed per field so editing a
  caption does not delay the headline typed five seconds earlier; blur still flushes
  immediately.
- **Unparseable structured output retries twice, silently** (`lib/ai/parse-with-retry.ts`).
  Deliberately NOT retried: `refusal` and `max_tokens`, which are deterministic and would
  just burn calls.
- Elapsed-time readout after 5 s with the expected range on image generation; help
  tooltips on tone of voice, photographic style and lighting; the editor's template
  dropdown replaced by live thumbnails rendered in the brand's real tokens.

**Deferred with justification: token-by-token streaming.** The generator uses structured
outputs, which is what makes typed template slots work and what lets a new template teach
the prompt its own limits. Partial JSON cannot be rendered as copy. Streaming *state*
("escribiendo la pieza 2 de 5") is possible; streaming the text is not, without giving up
the schema.

### Where published content comes from

Today: **pasted in by hand** at `/marcas/[id]/historial`. The table carries `source` and
`external_id` with a partial unique index precisely so a future sync updates in place
instead of duplicating the whole history.

**The Meta MCP is not a path for the app.** MCP authenticates in the Claude session, not
in a Next.js deployment — there is no MCP client on Vercel and no credentials to give it.
Separately, the Instagram tools in Meta's Ads MCP (`ads_get_ig_accounts`,
`ads_get_ig_media`) return *"This tool is new and is being gradually rolled out"* for every
ad account tried, so they are unavailable even from a session.

What DOES work from a session, and produced the eight real captions the experiments ran
on: `ads_get_creatives` with `creative_ids` returns the full `body` of each ad creative
plus its `effective_instagram_media_id`. **Boosted posts only** — organic posts that were
never promoted do not appear.

For the app itself the route is the **Instagram Graph API**. Business/Creator account
linked to a Facebook Page, `instagram_basic` + `instagram_manage_insights`, long-lived
tokens that expire every 60 days. App Review is only needed for third parties to
self-connect; for accounts already in the agency's Business Manager a **System User token**
avoids it entirely. Note this would put per-tenant secrets in the database for the first
time — currently the app stores none, and `SUPABASE_SERVICE_ROLE_KEY` is deliberately
empty.

**Known limitation, worth not rediscovering:** carousel slides do not share a seed, so a
carousel's four backgrounds are four unrelated photos. The `slides.generation_params`
comment claims they do and the image route accepts a `seed` — but nothing sends one, and
**Gemini ignores seeds entirely** (`gemini-provider.ts` passes it through to the result
without ever putting it in the request). Cohesion currently comes only from the shared
`background_brief`. With fal/FLUX the seed would work; with Gemini this needs to be solved
in the prompt.

---

## 11. What is left

**Done since Phase 6:** the app is **deployed on Vercel** and **Google OAuth is
configured**. `DEPLOY.md` §4 was expanded in the process with the two things that actually
bit — see the OAuth traps in §7.

Still open:

1. **Confirm the PNG export** (see §6). Unchanged, and still the most important open item:
   it is the foundation of Phases 2–5 and has never run end to end.
2. **Look at the Phase 6 and 7 screens once** (see §6) — `/configuracion`, the loading
   skeletons, the mobile tab strip, the recipe builder and the queue progress strip have
   all been verified by typecheck, lint, build and probes, but none has been seen by a
   human or a screenshot.
3. **Run one real batch queue end to end.** The recipe half is verified against the live
   API; the queue's rate-limit path is not — it needs a run that actually trips a 429 to
   confirm the backoff, the countdown and the resume-after-reload behave as intended.
4. **Carousel background cohesion** (see §10) — needs a prompt-level solution, since
   Gemini ignores seeds.

**Vercel limits that shaped the design — keep them in mind**
- **Request *and* response body cap 4.5 MB.** Hence: uploads go browser → signed URL →
  Storage; generated images are copied fal/Gemini → Storage server-to-server; the ZIP is
  assembled entirely in the browser. **Never route image or ZIP bytes through a function.**
- Duration: Hobby 300s max; Pro 300s default / 800s max. Current routes: 60 / 120 / 180.
