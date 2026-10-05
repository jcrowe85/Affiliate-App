-- What was sent to each seeded affiliate. Additive: a new table only.
-- CreateTable
CREATE TABLE "AffiliateSeedOrder" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "shopify_shop_id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "order_name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateSeedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateSeedOrder_shopify_order_id_key" ON "AffiliateSeedOrder"("shopify_order_id");

-- CreateIndex
CREATE INDEX "AffiliateSeedOrder_affiliate_id_created_at_idx" ON "AffiliateSeedOrder"("affiliate_id", "created_at");

-- CreateIndex
CREATE INDEX "AffiliateSeedOrder_shopify_shop_id_idx" ON "AffiliateSeedOrder"("shopify_shop_id");

-- AddForeignKey
ALTER TABLE "AffiliateSeedOrder" ADD CONSTRAINT "AffiliateSeedOrder_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
