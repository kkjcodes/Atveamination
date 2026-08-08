-- Phase A+B ad options: occasions, captions, QR/contact, plus business
-- contact fields. All additive with defaults — existing rows unaffected.
ALTER TABLE "businesses" ADD COLUMN "phone" TEXT;
ALTER TABLE "businesses" ADD COLUMN "website" TEXT;
ALTER TABLE "ads" ADD COLUMN "occasion" TEXT;
ALTER TABLE "ads" ADD COLUMN "captions_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ads" ADD COLUMN "qr_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ads" ADD COLUMN "contact_strip" BOOLEAN NOT NULL DEFAULT false;
