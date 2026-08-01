-- CreateTable
CREATE TABLE "tts_cache" (
    "content_hash" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "voice_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "audio_url" TEXT NOT NULL,
    "blob_path" TEXT NOT NULL,
    "duration_sec" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tts_cache_pkey" PRIMARY KEY ("content_hash")
);

-- CreateIndex
CREATE INDEX "tts_cache_engine_voice_id_idx" ON "tts_cache"("engine", "voice_id");
