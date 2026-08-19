-- AlterTable
ALTER TABLE "CreatorLead" ADD COLUMN     "batch_id" TEXT,
ADD COLUMN     "scheduled_send_at" TIMESTAMP(3),
ADD COLUMN     "send_error" TEXT;

-- CreateIndex
CREATE INDEX "CreatorLead_shopify_shop_id_status_scheduled_send_at_idx" ON "CreatorLead"("shopify_shop_id", "status", "scheduled_send_at");

-- CreateIndex
CREATE INDEX "CreatorLead_batch_id_idx" ON "CreatorLead"("batch_id");
