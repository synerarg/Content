-- 20260805000700_storage_limits  (migration 0007)
--
-- Server-side size and MIME limits on both buckets.
--
-- Until now the only cap on a logo was the 2 MB check inside LogoUpload — a
-- client-side check on an upload that, by design, does not pass through our
-- server. Uploads go browser -> signed URL -> Storage precisely so the bytes
-- never hit a Vercel function, which also means no handler of ours is in a
-- position to inspect them. The bucket is therefore the ONLY place this can be
-- enforced, and the browser check is now a fast-fail courtesy rather than the
-- boundary.
--
-- `update` rather than `insert ... on conflict`: both buckets already exist
-- (0002 and 0005) and this migration deliberately changes nothing else about
-- them. Re-running it is a no-op.

-- ---------------------------------------------------------------------------
-- brand-assets: logos and self-hosted .woff2 files
-- ---------------------------------------------------------------------------
--
-- 2 MB matches the limit the UI already advertises. It is generous for a
-- .woff2 — the Latin subset of a Google family lands around 15-40 KB — so one
-- number covers both asset kinds without a second bucket.
--
-- The MIME list mirrors the extension allowlist in app/api/uploads/sign. Two
-- independent checks on the same rule is intentional: the route rejects a bad
-- filename before a URL is ever minted, the bucket rejects bad bytes even if a
-- signed URL leaks. Keep the two in sync.
--
-- image/svg+xml is included because vector logos are the common case in agency
-- work. It carries the usual caveat that an SVG can contain script — but the
-- public URL is served from the Supabase storage origin, not the app origin, so
-- it cannot reach an app session. Fetched into a blob URL and rendered through
-- an <img> (which never executes script) on the export path.

update storage.buckets
set
  file_size_limit = 2097152, -- 2 MiB
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'font/woff2'
  ]
where id = 'brand-assets';

-- ---------------------------------------------------------------------------
-- generated: AI backgrounds, written server-to-server
-- ---------------------------------------------------------------------------
--
-- Nothing user-supplied reaches this bucket: the only writer is
-- /api/generate/image, copying provider bytes straight into Storage. The limit
-- is a blast radius, not a validation — it bounds what a misbehaving or
-- swapped-out provider can push into the project.
--
-- 10 MB against a real payload of ~1-3 MB (Gemini returns ~1 MP regardless of
-- the requested size). Wide enough that a future higher-resolution provider
-- does not silently start failing, tight enough to matter.
--
-- image/webp is listed although no current provider returns it; format is
-- detected from magic bytes, so a provider switch can change it without a code
-- change here.

update storage.buckets
set
  file_size_limit = 10485760, -- 10 MiB
  allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
where id = 'generated';
