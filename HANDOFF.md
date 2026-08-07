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
20260805001200_history_and_soft_...  slide_backgrounds (last 5 per slide) +
                                     content_batches.deleted_at  (Phase 7)
20260805001300_products.sql          brand_products + slides.product_id
                                     (on delete set null)  (Phase 8)
20260805001400_scheduling.sql        posts.scheduled_on (date) +
                                     posts.scheduled_time (time)  (Phase 9)
20260805001500_search.sql            jsonb_values_text() + search_content()
                                     RPC, security invoker  (Phase 10)
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
app/(app)/marcas/[id]/productos     Upload products, optional cut-out  (Phase 8)
app/(app)/calendario                Month grid + unscheduled inbox  (Phase 9)
app/(app)/buscar                    Full-text search over every piece  (Phase 10)
app/api/generate/variants           N alternatives for one piece  (Phase 10)
app/api/analyze/website             Brand Kit draft from a client URL  (Phase 10)
lib/ai/slot-limits.ts     The zod max_length reflection, in ONE place  (Phase 10)
lib/render/legibility.ts  Contrast against the rendered pixels  (Phase 10)
lib/web/safe-fetch.ts     SSRF-guarded fetch of a user-typed URL  (Phase 10)
lib/schedule.ts           Calendar arithmetic, UTC-only, no local clock  (Phase 9)
components/batch/schedule-panel.tsx Spread a batch across days, with a preview  (Phase 9)
lib/products/prepare-image.ts       Browser resize + alpha detect + flat-bg cut-out  (Phase 8)
lib/render/use-product-assets.ts    Product images -> blob URLs for the export  (Phase 8)
scripts/verify-rls.mjs    `npm run verify:rls`
scripts/verify-products.ts          `npm run verify:products` — 31 assertions
scripts/verify-schedule.ts          `npm run verify:schedule` — 59, twice (see §7)
scripts/verify-legibility.ts        `npm run verify:legibility` — 26 assertions
scripts/verify-website.ts           `npm run verify:website` — 66 assertions
scripts/verify-search.ts            `npm run verify:search` — 22 assertions
scripts/probe-variants.ts           `npm run probe:variants` — LIVE, ~US$0.04
scripts/probe-website.ts            `npm run probe:website <url>` — LIVE, ~US$0.04
scripts/probe-gemini-reference.ts   `npm run probe:scene-ref` — needs Gemini credit
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
| Products, 31 asserts (`npm run verify:products`) | PASS — registry flags, both prompts, the form schema, and the cut-out guard rails against synthetic images (product eaten / nothing found / busy corners / product fills the frame) |
| Scheduling, 59 asserts × 2 zones (`npm run verify:schedule`) | PASS — under the machine's zone AND pinned to UTC. **Verified to be a real test:** reintroducing the `formatDay` bug passes locally and fails the UTC pass with `04-ago` / `31-dic` |
| Calendar PostgREST queries | PASS — both embeds answer `200 []` anonymously, so the shape is valid and RLS filters it |
| Variants, **live** (`npm run probe:variants`) | PASS — 16 assertions, US$0.04. Distinct angles, limits respected, no tuteo, hashtags normalised. Read by hand: "costo de no hacerlo" / "el cliente esperando" / "la pérdida invisible" — three real arguments, none reusing the original's |
| Legibility, 26 asserts (`npm run verify:legibility`) | PASS — including the crossing case that caught the original design |
| Website import, 66 asserts (`npm run verify:website`) | PASS — every address-filter bypass worth naming, plus extraction against a fixture |
| Website import, **live** against supabase.com | PASS with a caveat — voice draft is genuinely useful and honest about its gaps; the palette needed two fixes found by this run alone (see §7) |
| `search_content` RPC | PASS — valid shape, handles quoted phrases and `-exclusions` without raising, answers `200 []` anonymously |
| Search snippets, 22 asserts (`npm run verify:search`) | PASS — including the accent-offset trap |
| `brand_products` denies anonymous reads | PASS — 12/12 tenant relations now |
| Product scene reference accepted by Gemini | **UNANSWERED** — `npm run probe:scene-ref` still dies on billing, 2026-08-07 |

**The PNG export — CLOSED, 2026-08-06.**

> The SVG→canvas→PNG step was this project's one significant unverified gap from Phase 2
> onward. **The account owner confirmed the single-PNG export from `/editor` working
> against the production deployment on 2026-08-06.**
>
> That closes the part that mattered, because it is the part that could silently produce a
> WRONG file: fonts embedding into the `<foreignObject>` rather than falling back to a
> system typeface, the canvas not being tainted by cross-origin Storage images, and the
> output landing at exactly 1080×1350. All three are now proven end to end in production.
>
> It could never be verified from an agent session, and that limitation still holds for
> anyone working on this: `html-to-image` resolves its image load inside a
> `requestAnimationFrame` callback, and **rAF never fires in a hidden tab**. The Claude
> Browser pane does not composite, so `toPng` hangs there forever rather than failing.
> Confirmed directly at the time: with `document.hidden === true`, rAF never fires while
> `Image.onload` still does.
>
> **Consequence for future work:** any change to `lib/export/rasterize.ts`, to the font
> embedding in `lib/render/brand-tokens.ts`, or to a template's markup re-opens this. It
> cannot be regression-tested from a session — it needs a human with a visible tab. The
> checks that CAN run from here are the dimension assertion in the export path and the
> `readPngDimensions` verification, both of which already run on every export.
>
> **Still unconfirmed: the batch ZIP** from `/contenido/[id]`. It calls the same
> `rasterizeSlide`, so the risky mechanism above is settled — what it adds is orchestration
> that has never run for real: a loop over `slideRefs` into components mounted by
> `OffscreenSlide` (a different rendering context from the visible preview), the per-slide
> dimension assertion at scale, and the jszip assembly and download. Lower risk than the
> original gap, and a different kind: a failure there would be loud rather than silent.

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

**Prepending `https://` to a URL is not a scheme check, and it accepted
`file:///etc/passwd`.** `normalizeSiteUrl` tested for `^https?://` and prepended
`https://` when it did not match — so `file:///etc/passwd` became
`https://file:///etc/passwd`, which `new URL()` parses perfectly happily as an
https URL to a host called `file`, and it sailed past the protocol check that came
next. **Any named scheme must be validated BEFORE anything is prepended**; only a
bare `dominio.com.ar` gets a scheme put in front of it. Caught by
`npm run verify:website`, which is why those three cases are in it. Everything
else about that fetch path — resolved-address filtering, per-hop redirect
revalidation, size and time caps — is in `lib/web/safe-fetch.ts`, along with the
DNS-rebinding gap `fetch` cannot close.

**Classifying pixels as "glyph or background" by colour distance fails in the
dangerous direction.** The legibility check first rendered the slide normally and
excluded pixels close to the text colour, assuming those were the letters. A
bright sky is within tolerance of white type, so the sky was discarded AS type —
the check then measured only the dark part of the frame and reported 19.5:1 on a
headline that had vanished. **The slide is now rendered with `color: transparent`
on its text runs**, so every measured pixel is genuinely background and nothing is
guessed. Use `transparent`, never `visibility: hidden`: a CTA pill carries its own
background colour on the very element that holds its text, and hiding it would
measure the photograph behind the pill.

**Contrast is judged on the WORST slice, not the mean.** A headline crossing from
a scrim onto a bright sky averages to "fine" while being unreadable across half
its length. A percentile also ignores the handful of blown-out pixels a strict
maximum would trip over. And WCAG's size thresholds apply to **the size a phone
shows**, not the slide's own pixels: an 88px headline lands near 33px on a 400px
screen (large text, 3:1), a 25px detail near 9px (4.5:1). Backwards, this waves
through exactly the small print that is hardest to read.

**Dropping white and black as "colours every site has" loses the background and
the body text.** The website importer excluded them as noise, and supabase.com
came back as a dark-green background with green body text and a neutral grey as
the accent — every token misassigned, from a site whose palette is unmistakable.
Count everything; decide ROLES afterwards, by luminance band and by chroma. The
bands must be narrow: a 0.15 "dark" cutoff swallowed a brand green sitting at
luminance 0.09 and made it the background.

**A `font-family` capture class that excludes quotes matches nothing.**
`/font-family\s*:\s*([^;}"']+)/` cannot match the opening quote of
`font-family: "Inter", Arial` — so every quoted family, which is most of them,
was silently invisible. Capture to the delimiter and strip the quotes from the
result.

**Accented named entities have to be decoded before text reaches a model.**
A page writing `Maip&uacute;` reached the prompt as `Maip&uacute;`, and a model
reading mangled Spanish writes a tone of voice based on mangled Spanish. The
numeric forms alone are not enough; `&aacute;` and friends are what Spanish
pages actually emit. Note the named table must be case-SENSITIVE — `&Aacute;`
and `&aacute;` are different characters.

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

**Gemini answers 429 for BOTH a rate limit and an empty account.** The messages are
"quota exceeded…" and "Your prepayment credits are depleted." — same status, opposite
correct responses. Treating them alike made the queue back off 31s and retry five times
per slide before failing (twenty minutes on a batch of eight) while telling the user to
"esperá unos segundos", for a condition waiting never clears. Both providers now raise
`CodedError("billing", …)` for it, which is not retryable. **In `guessClass` the billing
patterns are tested BEFORE the rate-limit ones on purpose**: Google's depleted-credits
message also contains the word "quota", so whichever runs first wins.

**Supabase IGNORES a redirect URL that is not allow-listed — it does not reject it.** It
falls back to the Site URL instead, silently. `login-form.tsx` passes a correct
`emailRedirectTo` built from `window.location.origin`, and signup confirmation emails
still arrived pointing at `localhost:3000`, because the production hostname was missing
from Authentication → URL Configuration → Redirect URLs. Nothing in the app or the email
says the value was discarded. **When an auth link lands somewhere unexpected, what you are
looking at is the Site URL, and the cause is the allow-list.**

**A green Vercel deploy proves nothing about the env vars.** The project was deployed with
**zero** environment variables set and the build passed — because nothing calls
`supabaseEnv()` at build time. Every page under `(app)` is dynamic, so the first thing to
touch it is the middleware, at request time, where it throws and Vercel answers
`MIDDLEWARE_INVOCATION_FAILED`: a blank 500 on every route including `/login`, with the
real reason only in the runtime logs. Look there for the literal string
`Missing Supabase environment variable(s)` — it is unmistakable.

Two things that make this worse than it sounds. `NEXT_PUBLIC_*` values are **inlined at
build time**, so saving the variable does not fix an existing deployment — it needs a
redeploy, without the build cache. And variables scoped to Production only leave every
preview deployment broken in exactly the same way, which reads as "it works on prod but
the branch is broken".

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
npm run verify:products  # 31 product assertions, no provider needed
npm run verify:schedule  # 59 calendar assertions, run twice (local zone + UTC)
npm run verify:legibility  # 26 contrast assertions against known bitmaps
npm run verify:website     # 66 SSRF + extraction assertions, no network
npm run verify:search      # 22 snippet assertions
npm run probe:variants     # LIVE Claude call, ~US$0.04
npm run probe:website <url># LIVE fetch + Claude call, ~US$0.04
npm run probe:scene-ref  # costs ONE image if the Gemini account has credit
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

### Nielsen heuristics — level 3 (Phase 7)

- **Regenerating a background no longer destroys the old one.** `slide_backgrounds` keeps
  the last five attempts per slide with a gallery to restore any of them. This mattered
  more than it looks: image generation is non-deterministic, so "just generate it again"
  never recovered what the second click replaced.
- **Deleting a batch is reversible.** `content_batches.deleted_at` plus a Deshacer in the
  toast. **Nothing purges these rows** — an automatic purge needs a scheduled job this
  deployment does not have, and a hidden row is much cheaper than a lost one. Every read
  of the table filters `deleted_at is null`; a new one that forgets will resurrect deleted
  batches.
- **Duplicar marca / lote / pieza**, copying everything including background references
  (the same Storage object, already paid for). Two deliberate exceptions, both documented
  at the call site: a duplicated brand does NOT inherit the published history or its angle
  analysis (those describe what *that* client posted), and duplicated `brand_fonts` rows
  point at the original brand's storage paths — safe within a workspace, but deleting the
  original takes the copy's fonts with it until the copy is re-saved.
- **Keyboard shortcuts** (`lib/shortcuts.tsx`) with a `?` overlay built from the same
  array the screen registers, so the cheat sheet cannot drift from what works. Shortcuts
  never fire while typing, except Ctrl+S and Ctrl+Enter — the two whose whole point is to
  fire while you are in a field.
- **`/ayuda`**, the advanced per-slide disclosure, and a zero-data state for
  `/configuracion`.

**Deferred with justification: undo/redo of text edits.** Ctrl+Z inside the editor was in
the spec and is not built. With 2 s autosave, per-field flush on blur and a restorable
background history, the data-loss case it was there to cover is largely closed, and doing
it properly means an edit stack per field that survives re-renders — meaningful work for
what is now a convenience. The browser's native undo still works inside each field.

**Deferred with justification: token-by-token streaming.** The generator uses structured
outputs, which is what makes typed template slots work and what lets a new template teach
the prompt its own limits. Partial JSON cannot be rendered as copy. Streaming *state*
("escribiendo la pieza 2 de 5") is possible; streaming the text is not, without giving up
the schema.

### Design quality: why the output looked generated (Phase 8, in progress)

The complaint was that the slides look like "AI slop". Three separate causes, in three
different files:

1. **Four of the six background templates had no composition guidance at all.**
   `COMPOSITION_BY_TEMPLATE` in `prompts/image-prompt.ts` covered only `bold-headline` and
   `quote-card`. For the rest the model composed freely and the type landed over whatever
   detail happened to be there. Every background template now has an entry, and a probe
   asserts that — `templates that use a background but produce no "Composition:"` must be
   an empty list.
2. **All six templates were the same idea** — full-bleed photo, gradient scrim, type
   bottom-left. Six variations of one composition read as one template. Added
   `editorial-split` (the photo is a cropped band, type on a solid brand field, no scrim)
   and `statement` (no photograph at all).
3. **Fixed type sizes regardless of copy length.** 88px whether the headline was 20 or 90
   characters, which is what produces the "text poured into a box" look.
   `lib/render/fit-text.ts` interpolates by length, with line height tightening as size
   grows. A lookup, not a measurement — measuring would mean a layout round trip inside
   html-to-image's `<foreignObject>`, which is the one place this project cannot afford
   extra moving parts.

**A calendar date is a WALL CLOCK, not an instant, and `formatDay` got this
wrong in production.** It formatted `new Date(year, month-1, date)` — midnight in
whatever zone the runtime is in — through a formatter pinned to Buenos Aires. On
Vercel, which runs in UTC, midnight UTC is 21:00 the previous day, so every day
label on `/configuracion` was one day early on the server and a *different* day
after hydration in the browser: a wrong number and a hydration mismatch at once.
Fixed by building at `Date.UTC` and formatting in UTC. **The rule for anything
new: a `date` column is a calendar date, so both ends of the round trip are UTC
and no `TIME_ZONE` goes anywhere near it.** `posts.scheduled_on` / `scheduled_time`
follow it by construction — that is why they are not a `timestamptz`.

**`npm run verify:schedule` runs the suite TWICE and both passes matter.** The
second is spawned with `TZ=UTC`, and it is the one that catches local-time
*construction* — `new Date(y, m, d)` calls no prototype getter, so the poisoned-
getter section cannot see it. The poisoning catches local-time *reads*
(`getDate`, `getDay`, `getTimezoneOffset`). Confirmed to be a real test rather
than a decorative one: reintroducing the `formatDay` bug passes on a Buenos Aires
machine and fails the UTC pass with `04-ago` and `31-dic`. Note also that
**Node on Windows honours only `TZ=UTC` and silently ignores named IANA zones** —
`TZ=Asia/Tokyo` still resolves to the machine's own zone, so "I tested five
timezones" from a shell loop here is false.

**A product scene must be asked for as an EMPTY SET, or the piece ships with two
products.** Handed "a marble counter, morning light", the model's instinct is to put
something photogenic on it — and then the template composites the client's real product on
top. The result looks perfectly good until you notice the client's bottle is standing next
to a stranger's. Two places enforce it: `PRODUCT_SCENE_DIRECTIVE` in `prompts/image-prompt.ts`
(appended whenever `hasProduct`, which is **derived from the template** so a caller cannot
forget it), and the `PRODUCTO` block in the batch system prompt, which stops the *copy*
model writing "a bottle on a wooden table" into the scene brief in the first place. The
probe asserts both. Neither has met the provider.

**`canvas.toBlob` falls back to PNG silently when it cannot encode the type you asked
for** — the callback still fires, with a valid blob of a different format. Naming the file
from the type you *requested* would then put `.webp` on PNG bytes, and `withDeclaredType()`
in `lib/storage.ts` derives the Content-Type from the extension, so Storage would record
them as `image/webp`. `encode()` in `lib/products/prepare-image.ts` reads `blob.type` back
and derives the extension from what actually came out.

**`usesProduct: true` is load-bearing in the same way `usesBackground: false` is.** It
gates the product picker, the export (a product template with no product rasterizes into a
PNG with a dashed empty box — valid file, obvious hole), and whether the scene prompt asks
for an empty staging area. A new product template that omits it renders nothing and blocks
nothing.

**`usesBackground: false` on a template is load-bearing**, not decorative. Without it the
queue spends a paid image and 10-20s on a slide that renders none, the export gate blocks
forever waiting for a background that will never arrive, and the progress bar never
reaches 100%. All three read the flag through `templateUsesBackground()`; a new
type-only template must set it.

**Not yet verified:** the new image prompt has never run against the provider — the Gemini
account ran out of credit first. The before/after comparison is still owed, and the two
new templates have not been looked at by anyone.

### Product photos (Phase 8) — built, except the scene reference

A client uploads a photo of their product and it appears in the generated piece.

**The design rule, settled — do not re-litigate it.** The image model never draws the
product. It draws the **scene**; the client's real pixels are composited by the template.
A model asked to reproduce a bottle from a reference *redraws* it: invented letterforms on
the label, the silhouette slightly off, the logo garbled. That is the same rule the whole
product runs on — AI never renders typography, code does — applied to a second kind of
asset. A product is a brand asset like the logo.

**What is built**

- **`brand_products`** per brand (migration 0013): name, description, image path, and
  `has_transparency`. Plus `slides.product_id`, `on delete set null` — deleting a product
  must never delete the pieces that used it.
- **Upload** through the existing signed-URL path, with a new `product` kind. A fresh UUID
  per upload, never an overwrite, so replacing a photo cannot invalidate an
  already-exported piece.
- **`lib/products/prepare-image.ts`**, in the browser: resize to 1600px (a phone photo is
  4-8 MB against a 2 MiB bucket cap, and the bytes never pass through a function where
  they could be resized), **measure** alpha rather than guessing it from the extension,
  and optionally flood-fill a flat studio backdrop away.
- **Two templates.** `product-hero` stands the product in a generated scene;
  `product-showcase` puts it on flat brand colour with **no generated image at all** —
  free, instant, and structurally incapable of looking AI-made.
- **The batch generator** takes a product: the copy is about it, standalone pieces use the
  product templates, and `product_id` is written only on slides whose template composites
  one.
- **31 assertions**, `npm run verify:products`.

**Everything about the cut-out is a refusal-first design.** `removeFlatBackground` flood
fills inward from the four corners, and it **refuses** when the corners disagree with each
other, when it would remove less than 3% (found nothing) or more than 97% (ate the
product). On refusal the original is kept and the user is told. A silently mangled product
photo is far worse than one that was never cut out, and it is the failure here that would
reach a client looking finished.

**There is deliberately NO dependency for background removal.** A real matting model
(U²-Net / RMBG and friends) would cut a product out of any background, and every
browser-side package shipping one today carries either an **AGPL licence or model weights
licensed for non-commercial use only**. For an agency tool doing client work that is an
account-owner decision, not one to make inside a helper. Until it is made, the flood fill
handles the plain-backdrop case that covers most e-commerce photography, and both
templates present an un-cut photo as a deliberately framed image rather than pasting a
white rectangle onto a photograph.

**Still owed, both blocked on Gemini credit — re-confirmed 2026-08-07, the account is
still empty** ("Your prepayment credits are depleted"):

1. **The scene reference**, the one designed piece that is not built. Sending the product
   photo as an input image so the scene's light and perspective match it. Not written
   blind on purpose: the request shape is unverified, and code that cannot be run is worse
   than a probe that is ready. `npm run probe:scene-ref` answers it in one call and
   distinguishes three outcomes — accepted / rejected on shape / still billing-blocked —
   because the first attempt died on billing before anything looked at the field.
2. **A before/after of the image prompt** (now `IMAGE_PROMPT_VERSION 2026-08-07.2`), which
   has still never run against the provider. The product half of it is the riskiest
   wording in the file: see the trap below.

---

## 11. Phase 9 — the publishing calendar

Built while the Gemini account had no credit, deliberately: none of it touches
the image provider, so it moves without waiting on billing.

Until now nothing carried a date. A batch was "a week of content" and the week
existed only in whoever generated it — which piece went out when lived in a head
or a spreadsheet.

- **`posts.scheduled_on` (date) + `scheduled_time` (time)**, never a
  `timestamptz`. See the trap in §7: a plan is a wall clock in the agency's
  timezone, and storing an instant is what makes a piece scheduled for Monday
  render as Sunday for whoever converts it in a different zone.
- **`/calendario`** — a fixed six-row month grid (never five, so paging does not
  make the page jump), a chip per piece marked with the client's own accent
  colour, a client-side brand filter, and an inbox of **unscheduled** pieces with
  the two inputs that put each on the calendar. The grid queries the VISIBLE
  range, not the month, or the leading and trailing cells would be wrongly empty.
- **Spread a whole batch in one action** — start date, cadence, hour, and
  "saltear fines de semana". The panel **previews the actual days live** before
  writing anything, which is what makes an option that silently moves dates
  safe to offer. Per-piece date and time override it.
- **The ZIP sorts in publishing order.** Folders are `2026-08-05-01-feed`;
  unscheduled pieces get `sin-fecha`, which sorts after every date and groups
  them at the end. `caption.md` carries a `Publicar:` line, and says "sin fecha
  asignada" rather than omitting it — a missing line reads as "any time".
- **A duplicated batch arrives unscheduled**, deliberately: copying the dates
  would double-book every day the original occupies.

`scheduleBatch` writes one statement per piece rather than one upsert, because
an upsert would need every not-null column in the payload — including the
caption — so a stale tab would silently revert copy edited since it loaded.

**Not verified by eye**, same structural limitation as everything else visual
here. The month grid, the chips and the inbox are covered by 59 assertions, a
production build and a live check that both PostgREST queries are valid; nobody
has looked at them.

---

## 12. Phase 10 — four features, none of them blocked on image credit

Built in one run while the Gemini account was empty. Each is committed
separately with its own probe.

### Variants — three real alternatives for one piece

Until now there were two ways to change a piece you disliked: retype it, or
regenerate the whole batch and lose the four pieces that were fine.

The prompt's whole job is avoiding the obvious failure: asked for "three other
options" a model returns the same idea three times, which is worse than nothing
because it looks like a choice. Same fix as the published-history work — name
the axis of difference instead of asking for difference. Each option must change
what it ARGUES, the current piece's angle is out of bounds, and every option
comes back labelled with its angle.

Two constraints keep the options usable rather than merely different: the scene
brief is passed as a CONSTRAINT (the background exists and is not regenerated
for a copy change), and the brand's published angles are forbidden here too.
Slots move together — a new headline against the old subline reads as two people
writing.

### Legibility — contrast against the rendered pixels

The palette editor checks foreground token against background token, which says
nothing about a headline on a photograph. This measures the composited slide.
**It warns, never blocks:** the export gate refuses things that are MISSING;
contrast is a judgement, and a tool that refuses a deliberate choice gets worked
around. See §7 for the design that had to be thrown away and why.

### Brand Kit from the client's website

Paste a URL, get the form pre-filled. Colours and fonts by CODE, voice by Claude
— counting CSS declarations is arithmetic and can be asserted; a model asked to
find brand colours occasionally invents one. It never saves: it fills the form
and stops, and the model's own confidence is shown next to its output.

SSRF is the real risk and §7 carries the trap. **Known limit:** only hex and
`rgb()` are read, so a site written in `oklch()` or `hsl()` yields fewer
colours — measured against supabase.com, where the green and the neutrals came
through and the true near-black background did not.

### Search over everything written

`search_content` is a `security invoker` Postgres function, so every RLS
policy applies inside it. It covers caption, CTA, hashtags, the on-image slot
copy and the batch title and brief, with Spanish stemming and
`websearch_to_tsquery` (quoted phrases, `-exclusions`, and it never raises on
malformed input — which is what makes it safe to hand raw user text).

**Performance, honestly:** it computes a tsvector per candidate row on every
search — a sequential scan with no index. Deliberate for an archive of thousands
of rows. When it stops being fast the fix is mechanical and written down in the
migration: stored generated tsvector columns plus GIN indexes.

---

## 13. Where published content comes from

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

## 14. What is left

**Done since Phase 6:** the app is **deployed on Vercel** at
`content-nine-neon.vercel.app`, **Google OAuth is configured**, and — the big one —
**the PNG export is confirmed working** (2026-08-06, see §6). That was the project's one
significant unverified gap and it is now closed. `DEPLOY.md` §4 was expanded along the way
with the two OAuth problems that actually bit, and §2 with the env-var trap that took the
first deployment down; both are in §7.

Still open:

1. **Look at the Phase 6 and 7 screens once** (see §6) — `/configuracion`, the loading
   skeletons, the mobile tab strip, the recipe builder and the queue progress strip have
   all been verified by typecheck, lint, build and probes, but none has been seen by a
   human or a screenshot.
2. **Run one real batch end to end** — which covers the two remaining unknowns at once,
   and is the likeliest source of a surprise:
   - The **queue's rate-limit path**. The recipe half is verified against the live API;
     the backoff, the countdown and resume-after-reload need a run that actually trips a
     429, which a full week of content will.
   - The **ZIP export** (see §6). Same rasterizer as the confirmed single PNG, but the
     loop over offscreen-mounted slides and the jszip assembly have never run for real.
3. **Carousel background cohesion** (see §10) — needs a prompt-level solution, since
   Gemini ignores seeds.
4. **Put credit on the Gemini account.** Three separate things are waiting on it and none
   can move without it: the scene reference (`npm run probe:scene-ref`), the before/after
   of `IMAGE_PROMPT_VERSION 2026-08-07.2`, and any real look at whether the product scenes
   come back with an empty staging area. The product feature is otherwise complete and
   `product-showcase` works today without a single image call — that is the template to
   demo with while the account is empty.
5. **Look at a product piece once.** Same limitation as everything else visual here: no
   authenticated screenshot exists. The two product templates, the checkerboard preview
   and the cut-out have been verified by typecheck, lint, a production build and 31
   assertions, **not by eye**.
6. **Nothing publishes anything.** The calendar (§11) is a PLAN, not a scheduler: no job,
   no queue and no integration acts on a date. A piece due Thursday changes what the
   screens say and nothing else. The Instagram Graph API route in §12 is what would close
   it, along with the per-tenant-secrets problem described there — this app currently
   stores no third-party secrets at all, and `SUPABASE_SERVICE_ROLE_KEY` is deliberately
   empty.

**Vercel limits that shaped the design — keep them in mind**
- **Request *and* response body cap 4.5 MB.** Hence: uploads go browser → signed URL →
  Storage; generated images are copied fal/Gemini → Storage server-to-server; the ZIP is
  assembled entirely in the browser. **Never route image or ZIP bytes through a function.**
- Duration: Hobby 300s max; Pro 300s default / 800s max. Current routes: 60 / 120 / 180.
