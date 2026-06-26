-- AlterTable
ALTER TABLE "scenes" ADD COLUMN     "focus_character_id" TEXT;

-- CreateTable
CREATE TABLE "project_characters" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "label" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_characters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_characters_project_id_character_id_key" ON "project_characters"("project_id", "character_id");

-- AddForeignKey
ALTER TABLE "project_characters" ADD CONSTRAINT "project_characters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
