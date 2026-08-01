-- AlterTable
ALTER TABLE "scenes" ADD COLUMN "video_chunk_urls" JSONB;
ALTER TABLE "scenes" ADD COLUMN "video_chunk_count" INTEGER DEFAULT 1;
ALTER TABLE "scenes" ADD COLUMN "video_prompt" TEXT;
