# Synera Content Studio

An agency tool that produces social posts for client brands. One rule shapes the
whole architecture:

> **AI never renders typography. Code does.**

The image model produces *backgrounds only* — text is explicitly excluded from
the prompt. Claude writes the copy and picks the template. Parameterized React
components render the text using each brand's real design tokens. Export is a
client-side rasterization of that same component, so the preview and the PNG
cannot diverge.

## Getting started

```bash
cp .env.local.example .env.local   # then fill it in
npm install
npm run dev
```

`.env.local.example` documents every variable. Nothing here runs against a local
database: the Supabase project is remote and already linked, and Docker is not
required for `db push` or `gen types`.

## Commands

```bash
npm run dev            # dev server (NOT while building)
npm run build          # stop the dev server first — see below
npm run lint
npx tsc --noEmit

npm run db:push        # apply migrations to the remote project
npm run db:types       # regenerate lib/supabase/database.types.ts
npm run verify:rls     # anonymous-access leak check
```

> **Never run `npm run build` while `next dev` is running.** The build deletes
> and rewrites `.next` under the running server and the app starts 500ing with
> `Cannot find module './331.js'`. Stop the server, delete `.next`, restart.

`npm run verify:rls` is a **leak detector, not a health check** — it only
exercises the anonymous path. It passed green throughout a period when uploads
were completely broken for authenticated users.

## Layout

```
app/(app)/marcas          Brand Kit CRUD, palette editor with live WCAG contrast
app/(app)/editor          Single piece: generate copy, generate background, export PNG
app/(app)/contenido       Batch list and detail, per-slide editing, ZIP export
app/(app)/plantillas      Template gallery
app/(app)/configuracion   Generation spend, integration status
app/api/generate/text     Single post   (claude-sonnet-5)
app/api/generate/batch    Whole batch   (claude-sonnet-5)
app/api/generate/image    Background    (Gemini by default)
app/api/uploads/sign      Signed direct-to-Storage upload URLs
templates/                6 templates + a typed registry (the registry is the source of truth)
prompts/                  Versioned prompt files — never inline strings
lib/render, lib/export    Brand tokens, font embedding, rasterizer, ZIP
supabase/migrations       9 migrations, all applied remotely
```

A template declares a zod slot schema that drives *both* the editor inputs and
Claude's structured output, so adding one automatically teaches the prompts its
slot names and character limits.

## Further reading

- **`HANDOFF.md`** — architecture, stack decisions and the reasons behind them,
  honest verification status, and a list of traps that each cost real debugging
  time. Read it before changing anything.
- **`DEPLOY.md`** — Vercel setup, environment variables, Google OAuth, and the
  post-deploy checks.
