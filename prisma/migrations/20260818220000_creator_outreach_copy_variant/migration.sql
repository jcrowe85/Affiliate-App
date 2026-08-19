-- AlterTable
ALTER TABLE "CreatorLead" ADD COLUMN     "copy_variant" TEXT;

-- CreateIndex
CREATE INDEX "CreatorLead_shopify_shop_id_copy_variant_status_idx" ON "CreatorLead"("shopify_shop_id", "copy_variant", "status");
