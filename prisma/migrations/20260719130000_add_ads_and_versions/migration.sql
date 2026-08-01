-- CreateTable
CREATE TABLE "ads" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "template_family" TEXT NOT NULL,
    "aspect_ratio" TEXT NOT NULL,
    "ad_script" JSONB,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "gallery_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_versions" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "ad_script" JSONB NOT NULL,
    "edit_request" TEXT,
    "render_asset_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ads_business_id_updated_at_idx" ON "ads"("business_id", "updated_at");
CREATE UNIQUE INDEX "ad_versions_ad_id_version_no_key" ON "ad_versions"("ad_id", "version_no");
CREATE INDEX "ad_versions_ad_id_created_at_idx" ON "ad_versions"("ad_id", "created_at");

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_versions" ADD CONSTRAINT "ad_versions_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
