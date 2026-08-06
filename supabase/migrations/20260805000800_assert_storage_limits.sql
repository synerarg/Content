-- 20260805000800_assert_storage_limits  (migration 0008)
--
-- Proves migration 0007 actually landed.
--
-- 0007 sets bucket limits with `update ... where id = ...`. An UPDATE that
-- matches no row succeeds silently, so "the migration applied" is NOT evidence
-- that the limits exist — and nothing on the dev machine can read them back:
-- storage.buckets is behind RLS (invisible to the publishable key) and
-- `db dump` / `db diff` both require Docker, which is not installed here.
--
-- This migration closes that gap by asserting the values in the database. It
-- writes nothing. If it applies cleanly, the limits are live; if a bucket is
-- missing or unbounded, `db push` fails with the reason. That makes a security
-- control which was otherwise unverifiable from here machine-checkable, and it
-- re-checks itself on any fresh environment built from these migrations.

do $$
declare
  expected constant jsonb := jsonb_build_object(
    'brand-assets', 2097152,
    'generated',   10485760
  );
  bucket_id text;
  actual_limit bigint;
  actual_types text[];
begin
  for bucket_id in select jsonb_object_keys(expected) loop
    select file_size_limit, allowed_mime_types
      into actual_limit, actual_types
      from storage.buckets
     where id = bucket_id;

    if not found then
      raise exception 'storage bucket "%" does not exist', bucket_id;
    end if;

    if actual_limit is distinct from (expected ->> bucket_id)::bigint then
      raise exception
        'storage bucket "%" has file_size_limit %, expected %',
        bucket_id, coalesce(actual_limit::text, 'null'), expected ->> bucket_id;
    end if;

    -- Only that a list exists. The contents are asserted in 0007 and change
    -- with the provider mix; an empty or null list, however, means every MIME
    -- type is accepted, which is the failure this is here to catch.
    if actual_types is null or cardinality(actual_types) = 0 then
      raise exception
        'storage bucket "%" accepts any MIME type; allowed_mime_types is unset',
        bucket_id;
    end if;
  end loop;
end
$$;
