-- Phase 1 of the async-work refactor: adds standardized columns so every
-- long-running operation (character train, business render, scrapbook
-- page-generate) can persist the same shape of state — startedAt for
-- stale recovery, failureCode + failureMessage for user-safe error copy.
--
-- Existing columns (augment_started_at on characters, stitch_started_at
-- on scrapbook_projects, augment_status, lora_training_status, status,
-- generation_phase) are unchanged. This adds the missing timestamps and
-- failure metadata to the three tables that still need them.
--
-- All new columns nullable so existing rows are unaffected.

ALTER TABLE "characters"
  ADD COLUMN "train_started_at" TIMESTAMP(3),
  ADD COLUMN "augment_failure_code" TEXT,
  ADD COLUMN "augment_failure_message" TEXT,
  ADD COLUMN "train_failure_code" TEXT,
  ADD COLUMN "train_failure_message" TEXT;

ALTER TABLE "ads"
  ADD COLUMN "render_started_at" TIMESTAMP(3),
  ADD COLUMN "render_failure_code" TEXT,
  ADD COLUMN "render_failure_message" TEXT;

ALTER TABLE "scrapbook_pages"
  ADD COLUMN "generation_started_at" TIMESTAMP(3),
  ADD COLUMN "generation_failure_code" TEXT,
  ADD COLUMN "generation_failure_message" TEXT;

ALTER TABLE "scrapbook_projects"
  ADD COLUMN "stitch_failure_code" TEXT,
  ADD COLUMN "stitch_failure_message" TEXT;
