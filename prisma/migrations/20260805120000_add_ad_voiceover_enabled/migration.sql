-- Music-only ads: user-facing toggle at ad creation. Default true keeps
-- existing ads voiced.
ALTER TABLE "ads" ADD COLUMN "voiceover_enabled" BOOLEAN NOT NULL DEFAULT true;
