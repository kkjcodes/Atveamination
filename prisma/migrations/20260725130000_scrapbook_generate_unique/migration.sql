-- Prevent double-charging a scrapbook project when concurrent page-generate
-- calls race the quota check. Partial unique index — narrow to scrapbook
-- generations only so it doesn't affect scene_generate rows (which are
-- expected to have multiple entries per scene across re-runs).
--
-- Concurrent INSERTs from two racing generates will collide on this
-- constraint; the losing INSERT gets a Postgres 23505 unique-violation,
-- which the caller (app/api/scrapbook/pages/[id]/generate/route.ts) catches
-- and treats as "already charged" — safe idempotent behavior.

CREATE UNIQUE INDEX "jobs_scrapbook_generate_entity_unique"
  ON "jobs" ("entity_id")
  WHERE "type" = 'scrapbook_generate';
