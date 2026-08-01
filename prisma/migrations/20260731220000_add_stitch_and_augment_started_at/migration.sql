-- Stale-processing recovery for two async endpoints:
--   1. Scrapbook stitch (fire-and-forget assembly) — if container SIGTERMs
--      mid-work, status stays "generating" forever; optimistic lock blocks
--      retry. New column records when the current "generating" state
--      started so the stitch route can treat rows older than N minutes
--      as stale and let the user re-kick.
--   2. Character augment (fire-and-forget 35-image Kontext loop) — same
--      class of bug; augmentStatus stuck at "processing" blocks retry.
--
-- Both columns nullable so existing rows are unaffected.

ALTER TABLE "scrapbook_projects" ADD COLUMN "stitch_started_at" TIMESTAMP(3);
ALTER TABLE "characters" ADD COLUMN "augment_started_at" TIMESTAMP(3);
