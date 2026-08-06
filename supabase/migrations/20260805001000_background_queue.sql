-- 20260805001000_background_queue  (migration 0010)
--
-- Per-slide background generation state, so a batch's backgrounds can be
-- produced as a queue instead of one manual click per slide.
--
-- WHY THE STATE LIVES HERE AND NOT IN THE BROWSER
--
-- The queue is DRIVEN by the browser — one request per slide, paced by the
-- provider's rate limit — because it cannot live in a Vercel function: the
-- Gemini free tier does ~2 images/minute, so eight backgrounds is roughly four
-- minutes of mostly waiting, well past the 300s ceiling and a waste of function
-- time either way.
--
-- But driving it from the browser does not mean STORING it there. React state
-- dies on reload, is invisible from a second device, and turns a failed slide
-- into a toast that disappears. Keeping the state on the row it describes means
-- a refresh resumes where it left off, progress is readable from a phone, and a
-- failure keeps its reason until someone deals with it.
--
-- It is also the seam for a real worker later: a server-side queue would read
-- and write these same columns, with no change to anything above.
--
-- Columns rather than a jobs table: this is a property of a slide, one row per
-- slide, with the same lifetime. A separate table would buy a join and nothing
-- else. Same reasoning as palette/typography living on `brands`.

create type public.background_status as enum (
  'pending',   -- no background yet, not queued
  'queued',    -- claimed by a run, waiting its turn
  'running',   -- request in flight
  'ready',     -- background_path is set and usable
  'failed'     -- attempt failed; background_error says why
);

alter table public.slides
  add column background_status public.background_status not null default 'pending',
  add column background_error text,
  add column background_attempts int not null default 0,
  -- When the in-flight request started. The only way to tell a slide that is
  -- genuinely generating from one whose driver closed the tab mid-request:
  -- nothing else would ever move it off 'running'.
  add column background_started_at timestamptz;

-- Existing slides predate this column. Anything already carrying a path is
-- ready by definition; everything else stays 'pending', which is the default.
update public.slides
set background_status = 'ready'
where background_path is not null;

-- 'ready' must mean there is something to show. Without this the UI would have
-- to defensively re-check background_path everywhere it trusts the status.
alter table public.slides
  add constraint slides_ready_has_path
  check (background_status <> 'ready' or background_path is not null);

-- The queue's own lookup: "which slides in this batch still need work". Partial
-- because 'ready' rows are the overwhelming majority in an established
-- workspace and never appear in that query.
create index slides_background_pending_idx
  on public.slides (post_id)
  where background_status <> 'ready';

comment on column public.slides.background_status is
  'Queue state for this slide''s background. Driven by the browser, stored here so it survives a reload.';
comment on column public.slides.background_started_at is
  'When the in-flight request began. Used to reclaim slides whose driver died mid-request.';
