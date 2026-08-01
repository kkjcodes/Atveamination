-- Persist the user's voice pick on the Ad row so a failed AdScript
-- generation can be retried without losing the original choice.
-- Nullable — existing rows just fall back to Sonnet's pick on regenerate.

ALTER TABLE "ads" ADD COLUMN "preferred_voice" TEXT;
