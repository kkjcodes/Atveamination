-- CreateTable
CREATE TABLE "scrapbook_projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled Scrapbook',
    "style" TEXT NOT NULL DEFAULT 'watercolor',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "final_video_url" TEXT,
    "total_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrapbook_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrapbook_pages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "character_id" TEXT,
    "source_photo_url" TEXT NOT NULL,
    "shot_plan" JSONB,
    "caption" TEXT NOT NULL DEFAULT '',
    "before_keyframe_url" TEXT,
    "after_keyframe_url" TEXT,
    "route" TEXT,
    "motion_prediction_id" TEXT,
    "raw_clip_url" TEXT,
    "qc_result" JSONB,
    "page_video_url" TEXT,
    "used_fallback" BOOLEAN NOT NULL DEFAULT false,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "generation_phase" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrapbook_pages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "scrapbook_projects" ADD CONSTRAINT "scrapbook_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrapbook_pages" ADD CONSTRAINT "scrapbook_pages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "scrapbook_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrapbook_pages" ADD CONSTRAINT "scrapbook_pages_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "scrapbook_projects_user_id_created_at_idx" ON "scrapbook_projects"("user_id", "created_at");
CREATE INDEX "scrapbook_pages_project_id_order_index_idx" ON "scrapbook_pages"("project_id", "order_index");
CREATE INDEX "scrapbook_pages_motion_prediction_id_idx" ON "scrapbook_pages"("motion_prediction_id");
