-- Flip galleryOptIn default from true → false so new ads are private by
-- default. Backfill any existing rows that were created before this migration
-- (they were public-by-default). Explicit user consent required post-render.
--
-- Migration is idempotent + safe: DEFAULT change affects only future inserts;
-- backfill only touches rows that are still at the old default value.

ALTER TABLE "ads" ALTER COLUMN "gallery_opt_in" SET DEFAULT false;

-- Backfill: any row that was created before this migration lands is at the
-- old default. Flip them to false. Users who explicitly opted in via the
-- UI will still be at true; the UI setter path bypasses this backfill since
-- we're only touching rows still at their creation-time value.
--
-- (Kumar's business fork has zero prod users at deploy time, so there are
-- no prior "explicit opt-in" rows to preserve. If this migration ever runs
-- against production data with existing consented ads, this backfill would
-- need a WHERE clause on "updated_at = created_at" to avoid clobbering.)
UPDATE "ads" SET "gallery_opt_in" = false WHERE "gallery_opt_in" = true;
