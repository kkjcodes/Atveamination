-- AlterTable
ALTER TABLE "scenes" ADD COLUMN     "audio_prediction_id" TEXT,
ADD COLUMN     "generation_phase" TEXT,
ADD COLUMN     "image_prediction_id" TEXT,
ADD COLUMN     "video_prediction_id" TEXT;
