-- DropIndex
DROP INDEX "scrapbook_pages_motion_prediction_id_idx";

-- DropIndex
DROP INDEX "scrapbook_pages_project_id_order_index_idx";

-- DropIndex
DROP INDEX "scrapbook_projects_user_id_created_at_idx";

-- CreateTable
CREATE TABLE "spend_ledger" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "estimated_cost_usd" DOUBLE PRECISION NOT NULL,
    "actual_cost_usd" DOUBLE PRECISION,
    "user_id" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spend_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spend_ledger_created_at_idx" ON "spend_ledger"("created_at");
