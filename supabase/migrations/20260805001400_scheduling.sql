-- 20260805001400_scheduling  (migration 0014)
--
-- When each piece goes out.
--
-- ---------------------------------------------------------------------------
-- Why this is a `date` + a `time`, and NOT a `timestamptz`
-- ---------------------------------------------------------------------------
--
-- A publishing plan is a WALL CLOCK in the agency's timezone, not an instant.
-- "Martes 10:00" means ten in the morning in Buenos Aires whether the account
-- manager opens the laptop in Buenos Aires, in Madrid, or on a Vercel function
-- running in UTC. A `timestamptz` would store an instant, and every screen would
-- then have to convert it back to a calendar day — which is exactly where
-- calendars break: an instant near midnight lands on a different day depending
-- on the zone doing the conversion, so a piece scheduled for Monday shows up on
-- Sunday for one reader and Monday for another.
--
-- Storing the wall clock removes the conversion entirely. `lib/format.ts`
-- already documents the same trap for `generation_usage_daily`: a `date` column
-- must be parsed as a calendar date, never as an instant, or every label shifts
-- back by one.
--
-- The conversion to a real instant belongs at the one boundary that needs one —
-- a future Instagram publish call — where the agency timezone (`TIME_ZONE` in
-- lib/format.ts) is applied once, deliberately, instead of implicitly on every
-- read.
--
-- Scheduling lives on `posts`, not on `slides`: a carousel's four slides are one
-- publishable unit and go out together.

alter table public.posts
  add column scheduled_on date,
  add column scheduled_time time;

comment on column public.posts.scheduled_on is
  'Calendar day this piece is planned for, in the agency timezone. Null = unscheduled.';

comment on column public.posts.scheduled_time is
  'Wall-clock time of day, agency timezone. Null = a day was chosen but no hour.';

-- A time with no day is meaningless, and would render as a piece that is both
-- scheduled and unscheduled depending on which column a screen happened to read.
alter table public.posts
  add constraint posts_time_needs_a_day
  check (scheduled_time is null or scheduled_on is not null);

-- The calendar's only query shape: one workspace, one month. Partial, because
-- unscheduled pieces are the majority early in a batch's life and they are
-- found by their absence rather than looked up by date.
create index posts_schedule_idx
  on public.posts (workspace_id, scheduled_on)
  where scheduled_on is not null;
