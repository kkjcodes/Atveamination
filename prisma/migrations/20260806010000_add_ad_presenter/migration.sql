-- Cartoon presenter (Phase C). Additive, nullable — existing ads unaffected.
ALTER TABLE "ads" ADD COLUMN "presenter_character_id" TEXT;
ALTER TABLE "ads" ADD COLUMN "presenter_slot" TEXT NOT NULL DEFAULT 'hook';
ALTER TABLE "ads" ADD COLUMN "presenter_keyframe_url" TEXT;
ALTER TABLE "ads" ADD COLUMN "presenter_clip_url" TEXT;
ALTER TABLE "ads" ADD COLUMN "presenter_clip_line_hash" TEXT;
