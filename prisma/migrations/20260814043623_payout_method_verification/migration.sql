-- CreateTable
CREATE TABLE "PayoutMethodVerification" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "paypal_batch_id" TEXT,
    "paypal_item_id" TEXT,
    "initiated_by" TEXT NOT NULL,
    "initiated_ip" TEXT,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutMethodVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutMethodVerification_affiliate_id_created_at_idx" ON "PayoutMethodVerification"("affiliate_id", "created_at");

-- CreateIndex
CREATE INDEX "PayoutMethodVerification_shopify_shop_id_status_idx" ON "PayoutMethodVerification"("shopify_shop_id", "status");

-- AddForeignKey
ALTER TABLE "PayoutMethodVerification" ADD CONSTRAINT "PayoutMethodVerification_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
