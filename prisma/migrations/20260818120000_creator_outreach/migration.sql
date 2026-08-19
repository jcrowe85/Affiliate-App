-- CreateTable
CREATE TABLE "CreatorLead" (
    "id" TEXT NOT NULL,
    "shopify_shop_id" TEXT NOT NULL,
    "trybe_creator_id" TEXT,
    "source_filter" TEXT,
    "sourced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instagram_handle" TEXT NOT NULL,
    "full_name" TEXT,
    "bio" TEXT,
    "followers" INTEGER,
    "engagement_rate" DECIMAL(6,3),
    "is_business" BOOLEAN,
    "profile_url" TEXT,
    "email" TEXT,
    "email_source" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolve_attempts" INTEGER NOT NULL DEFAULT 0,
    "resolve_error" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sourced',
    "emailed_at" TIMESTAMP(3),
    "follow_up_count" INTEGER NOT NULL DEFAULT 0,
    "last_follow_up_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "unsubscribe_token" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorSuppression" (
    "id" TEXT NOT NULL,
    "shopify_shop_id" TEXT NOT NULL,
    "email" TEXT,
    "instagram_handle" TEXT,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorOutreachEvent" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorOutreachEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorLead_unsubscribe_token_key" ON "CreatorLead"("unsubscribe_token");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorLead_shopify_shop_id_instagram_handle_key" ON "CreatorLead"("shopify_shop_id", "instagram_handle");

-- CreateIndex
CREATE INDEX "CreatorLead_shopify_shop_id_status_idx" ON "CreatorLead"("shopify_shop_id", "status");

-- CreateIndex
CREATE INDEX "CreatorLead_shopify_shop_id_email_idx" ON "CreatorLead"("shopify_shop_id", "email");

-- CreateIndex
CREATE INDEX "CreatorSuppression_shopify_shop_id_email_idx" ON "CreatorSuppression"("shopify_shop_id", "email");

-- CreateIndex
CREATE INDEX "CreatorSuppression_shopify_shop_id_instagram_handle_idx" ON "CreatorSuppression"("shopify_shop_id", "instagram_handle");

-- CreateIndex
CREATE INDEX "CreatorOutreachEvent_lead_id_created_at_idx" ON "CreatorOutreachEvent"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "CreatorOutreachEvent_type_created_at_idx" ON "CreatorOutreachEvent"("type", "created_at");

-- AddForeignKey
ALTER TABLE "CreatorOutreachEvent" ADD CONSTRAINT "CreatorOutreachEvent_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "CreatorLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
