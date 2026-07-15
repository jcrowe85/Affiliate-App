-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "payout_method" TEXT,
    "payout_identifier" TEXT,
    "payout_terms_days" INTEGER NOT NULL DEFAULT 30,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "affiliate_number" INTEGER,
    "city" TEXT,
    "company" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "merchant_id" TEXT,
    "offer_id" TEXT,
    "password_hash" TEXT,
    "paypal_email" TEXT,
    "phone" TEXT,
    "postback_affiliate_id" TEXT,
    "postback_sub1" TEXT,
    "postback_sub2" TEXT,
    "postback_sub3" TEXT,
    "postback_sub4" TEXT,
    "postback_transaction_id" TEXT,
    "state" TEXT,
    "webhook_parameter_mapping" JSONB,
    "webhook_url" TEXT,
    "zip" TEXT,
    "redirect_base_url" TEXT,
    "source" TEXT,
    "redirect_parameters_enabled" BOOLEAN DEFAULT false,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateApplication" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "paypal_email" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "shopify_shop_id" TEXT NOT NULL,
    "affiliate_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "destination_url" TEXT NOT NULL,
    "campaign_name" TEXT,
    "coupon_code" TEXT,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateOffer" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateSession" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateWebhookLog" (
    "id" TEXT NOT NULL,
    "commission_id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "webhook_url" TEXT NOT NULL,
    "request_method" TEXT NOT NULL DEFAULT 'GET',
    "request_body" TEXT,
    "response_code" INTEGER,
    "response_body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "last_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "request_params" JSONB,

    CONSTRAINT "AffiliateWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Click" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "link_id" TEXT,
    "landing_url" TEXT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "user_agent_hash" TEXT NOT NULL,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url_transaction_id" TEXT,
    "url_affiliate_id" TEXT,
    "url_sub1" TEXT,
    "url_sub2" TEXT,
    "url_sub3" TEXT,
    "url_sub4" TEXT,
    "url_params" JSONB,

    CONSTRAINT "Click_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "order_attribution_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "eligible_date" TIMESTAMP(3) NOT NULL,
    "rule_snapshot" JSONB NOT NULL,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "applies_to" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "max_payments" INTEGER,
    "max_months" INTEGER,
    "selling_plan_ids" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudFlag" (
    "id" TEXT NOT NULL,
    "commission_id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "flag_type" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "offer_number" INTEGER,
    "name" TEXT NOT NULL,
    "commission_type" TEXT NOT NULL DEFAULT 'flat_rate',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "commission_terms" TEXT,
    "attribution_window_days" INTEGER NOT NULL DEFAULT 90,
    "auto_approve_affiliates" BOOLEAN NOT NULL DEFAULT false,
    "selling_subscriptions" TEXT NOT NULL DEFAULT 'no',
    "subscription_max_payments" INTEGER,
    "subscription_rebill_commission_type" TEXT,
    "subscription_rebill_commission_value" DECIMAL(10,2),
    "make_private" BOOLEAN NOT NULL DEFAULT false,
    "hide_referral_links" BOOLEAN NOT NULL DEFAULT false,
    "hide_coupon_promotion" BOOLEAN NOT NULL DEFAULT false,
    "enable_variable_commission" BOOLEAN NOT NULL DEFAULT false,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAttribution" (
    "id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "shopify_order_number" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "click_id" TEXT,
    "attribution_type" TEXT NOT NULL,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_email" TEXT,
    "customer_name" TEXT,
    "order_currency" TEXT DEFAULT 'USD',
    "order_total" DECIMAL(10,2),
    "landing_url_params" JSONB,

    CONSTRAINT "OrderAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRun" (
    "id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payout_reference" TEXT,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRunCommission" (
    "id" TEXT NOT NULL,
    "payout_run_id" TEXT NOT NULL,
    "commission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutRunCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostbackLog" (
    "id" TEXT NOT NULL,
    "commission_id" TEXT NOT NULL,
    "postback_template_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response_code" INTEGER,
    "response_body" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "last_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostbackLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostbackTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "param_mappings" JSONB NOT NULL,
    "trigger_event" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostbackTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifySession" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "access_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storefront_access_token" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionAttribution" (
    "id" TEXT NOT NULL,
    "original_order_id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "selling_plan_id" TEXT NOT NULL,
    "interval_months" INTEGER NOT NULL,
    "max_payments" INTEGER,
    "payments_made" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "shopify_shop_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorEvent" (
    "id" TEXT NOT NULL,
    "visitor_session_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "shopify_shop_id" TEXT NOT NULL,
    "page_url" TEXT,
    "page_path" TEXT,
    "page_title" TEXT,
    "referrer" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_data" JSONB,

    CONSTRAINT "VisitorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorSession" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "shopify_shop_id" TEXT NOT NULL,
    "entry_page" TEXT NOT NULL,
    "exit_page" TEXT,
    "start_time" BIGINT NOT NULL,
    "end_time" BIGINT,
    "page_views" INTEGER NOT NULL DEFAULT 0,
    "pages_visited" TEXT[],
    "total_time" INTEGER,
    "is_bounce" BOOLEAN NOT NULL DEFAULT false,
    "device_type" TEXT,
    "user_agent" TEXT,
    "screen_width" INTEGER,
    "screen_height" INTEGER,
    "language" TEXT,
    "timezone" TEXT,
    "referrer_type" TEXT,
    "referrer_url" TEXT,
    "referrer_domain" TEXT,
    "location_country" TEXT,
    "location_city" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "affiliate_id" TEXT,
    "affiliate_number" INTEGER,
    "url_params" JSONB,
    "landing_page" TEXT,

    CONSTRAINT "VisitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminSession_admin_user_id_idx" ON "AdminSession"("admin_user_id" ASC);

-- CreateIndex
CREATE INDEX "AdminSession_token_idx" ON "AdminSession"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_token_key" ON "AdminSession"("token" ASC);

-- CreateIndex
CREATE INDEX "AdminUser_email_idx" ON "AdminUser"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email" ASC);

-- CreateIndex
CREATE INDEX "AdminUser_shopify_shop_id_idx" ON "AdminUser"("shopify_shop_id" ASC);

-- CreateIndex
CREATE INDEX "Affiliate_email_idx" ON "Affiliate"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_email_key" ON "Affiliate"("email" ASC);

-- CreateIndex
CREATE INDEX "Affiliate_offer_id_idx" ON "Affiliate"("offer_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_shopify_shop_id_affiliate_number_key" ON "Affiliate"("shopify_shop_id" ASC, "affiliate_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_shopify_shop_id_merchant_id_key" ON "Affiliate"("shopify_shop_id" ASC, "merchant_id" ASC);

-- CreateIndex
CREATE INDEX "Affiliate_shopify_shop_id_status_idx" ON "Affiliate"("shopify_shop_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateApplication_affiliate_id_key" ON "AffiliateApplication"("affiliate_id" ASC);

-- CreateIndex
CREATE INDEX "AffiliateApplication_email_idx" ON "AffiliateApplication"("email" ASC);

-- CreateIndex
CREATE INDEX "AffiliateApplication_shopify_shop_id_status_idx" ON "AffiliateApplication"("shopify_shop_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "AffiliateLink_affiliate_id_idx" ON "AffiliateLink"("affiliate_id" ASC);

-- CreateIndex
CREATE INDEX "AffiliateLink_coupon_code_idx" ON "AffiliateLink"("coupon_code" ASC);

-- CreateIndex
CREATE INDEX "AffiliateLink_shopify_shop_id_idx" ON "AffiliateLink"("shopify_shop_id" ASC);

-- CreateIndex
CREATE INDEX "AffiliateOffer_affiliate_id_idx" ON "AffiliateOffer"("affiliate_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateOffer_affiliate_id_offer_id_key" ON "AffiliateOffer"("affiliate_id" ASC, "offer_id" ASC);

-- CreateIndex
CREATE INDEX "AffiliateOffer_offer_id_idx" ON "AffiliateOffer"("offer_id" ASC);

-- CreateIndex
CREATE INDEX "AffiliateSession_affiliate_id_idx" ON "AffiliateSession"("affiliate_id" ASC);

-- CreateIndex
CREATE INDEX "AffiliateSession_token_idx" ON "AffiliateSession"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateSession_token_key" ON "AffiliateSession"("token" ASC);

-- CreateIndex
CREATE INDEX "AffiliateWebhookLog_affiliate_id_idx" ON "AffiliateWebhookLog"("affiliate_id" ASC);

-- CreateIndex
CREATE INDEX "AffiliateWebhookLog_commission_id_idx" ON "AffiliateWebhookLog"("commission_id" ASC);

-- CreateIndex
CREATE INDEX "AffiliateWebhookLog_shopify_shop_id_idx" ON "AffiliateWebhookLog"("shopify_shop_id" ASC);

-- CreateIndex
CREATE INDEX "AffiliateWebhookLog_status_last_attempt_at_idx" ON "AffiliateWebhookLog"("status" ASC, "last_attempt_at" ASC);

-- CreateIndex
CREATE INDEX "Click_affiliate_id_created_at_idx" ON "Click"("affiliate_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "Click_shopify_shop_id_created_at_idx" ON "Click"("shopify_shop_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "Commission_affiliate_id_status_idx" ON "Commission"("affiliate_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Commission_shopify_order_id_idx" ON "Commission"("shopify_order_id" ASC);

-- CreateIndex
CREATE INDEX "Commission_shopify_shop_id_status_idx" ON "Commission"("shopify_shop_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Commission_status_eligible_date_idx" ON "Commission"("status" ASC, "eligible_date" ASC);

-- CreateIndex
CREATE INDEX "CommissionRule_shopify_shop_id_active_idx" ON "CommissionRule"("shopify_shop_id" ASC, "active" ASC);

-- CreateIndex
CREATE INDEX "FraudFlag_affiliate_id_resolved_idx" ON "FraudFlag"("affiliate_id" ASC, "resolved" ASC);

-- CreateIndex
CREATE INDEX "FraudFlag_commission_id_idx" ON "FraudFlag"("commission_id" ASC);

-- CreateIndex
CREATE INDEX "FraudFlag_shopify_shop_id_resolved_idx" ON "FraudFlag"("shopify_shop_id" ASC, "resolved" ASC);

-- CreateIndex
CREATE INDEX "Offer_shopify_shop_id_idx" ON "Offer"("shopify_shop_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_shopify_shop_id_offer_number_key" ON "Offer"("shopify_shop_id" ASC, "offer_number" ASC);

-- CreateIndex
CREATE INDEX "OrderAttribution_affiliate_id_idx" ON "OrderAttribution"("affiliate_id" ASC);

-- CreateIndex
CREATE INDEX "OrderAttribution_customer_email_idx" ON "OrderAttribution"("customer_email" ASC);

-- CreateIndex
CREATE INDEX "OrderAttribution_shopify_order_id_idx" ON "OrderAttribution"("shopify_order_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrderAttribution_shopify_order_id_key" ON "OrderAttribution"("shopify_order_id" ASC);

-- CreateIndex
CREATE INDEX "OrderAttribution_shopify_shop_id_idx" ON "OrderAttribution"("shopify_shop_id" ASC);

-- CreateIndex
CREATE INDEX "PayoutRun_shopify_shop_id_status_idx" ON "PayoutRun"("shopify_shop_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRunCommission_commission_id_key" ON "PayoutRunCommission"("commission_id" ASC);

-- CreateIndex
CREATE INDEX "PostbackLog_commission_id_idx" ON "PostbackLog"("commission_id" ASC);

-- CreateIndex
CREATE INDEX "PostbackLog_status_last_attempt_at_idx" ON "PostbackLog"("status" ASC, "last_attempt_at" ASC);

-- CreateIndex
CREATE INDEX "PostbackTemplate_shopify_shop_id_active_trigger_event_idx" ON "PostbackTemplate"("shopify_shop_id" ASC, "active" ASC, "trigger_event" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifySession_id_key" ON "ShopifySession"("id" ASC);

-- CreateIndex
CREATE INDEX "ShopifySession_shop_idx" ON "ShopifySession"("shop" ASC);

-- CreateIndex
CREATE INDEX "SubscriptionAttribution_affiliate_id_idx" ON "SubscriptionAttribution"("affiliate_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionAttribution_original_order_id_selling_plan_id_key" ON "SubscriptionAttribution"("original_order_id" ASC, "selling_plan_id" ASC);

-- CreateIndex
CREATE INDEX "SubscriptionAttribution_shopify_shop_id_active_idx" ON "SubscriptionAttribution"("shopify_shop_id" ASC, "active" ASC);

-- CreateIndex
CREATE INDEX "VisitorEvent_shopify_shop_id_timestamp_idx" ON "VisitorEvent"("shopify_shop_id" ASC, "timestamp" ASC);

-- CreateIndex
CREATE INDEX "VisitorEvent_visitor_session_id_idx" ON "VisitorEvent"("visitor_session_id" ASC);

-- CreateIndex
CREATE INDEX "VisitorSession_affiliate_id_start_time_idx" ON "VisitorSession"("affiliate_id" ASC, "start_time" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VisitorSession_session_id_key" ON "VisitorSession"("session_id" ASC);

-- CreateIndex
CREATE INDEX "VisitorSession_shopify_shop_id_created_at_idx" ON "VisitorSession"("shopify_shop_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "VisitorSession_shopify_shop_id_start_time_idx" ON "VisitorSession"("shopify_shop_id" ASC, "start_time" ASC);

-- CreateIndex
CREATE INDEX "VisitorSession_visitor_id_idx" ON "VisitorSession"("visitor_id" ASC);

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplication" ADD CONSTRAINT "AffiliateApplication_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateOffer" ADD CONSTRAINT "AffiliateOffer_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateOffer" ADD CONSTRAINT "AffiliateOffer_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateSession" ADD CONSTRAINT "AffiliateSession_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateWebhookLog" ADD CONSTRAINT "AffiliateWebhookLog_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateWebhookLog" ADD CONSTRAINT "AffiliateWebhookLog_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "Commission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Click" ADD CONSTRAINT "Click_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Click" ADD CONSTRAINT "Click_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "AffiliateLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_order_attribution_id_fkey" FOREIGN KEY ("order_attribution_id") REFERENCES "OrderAttribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudFlag" ADD CONSTRAINT "FraudFlag_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudFlag" ADD CONSTRAINT "FraudFlag_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "Commission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_click_id_fkey" FOREIGN KEY ("click_id") REFERENCES "Click"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRunCommission" ADD CONSTRAINT "PayoutRunCommission_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "Commission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRunCommission" ADD CONSTRAINT "PayoutRunCommission_payout_run_id_fkey" FOREIGN KEY ("payout_run_id") REFERENCES "PayoutRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostbackLog" ADD CONSTRAINT "PostbackLog_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "Commission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostbackLog" ADD CONSTRAINT "PostbackLog_postback_template_id_fkey" FOREIGN KEY ("postback_template_id") REFERENCES "PostbackTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAttribution" ADD CONSTRAINT "SubscriptionAttribution_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_visitor_session_id_fkey" FOREIGN KEY ("visitor_session_id") REFERENCES "VisitorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorSession" ADD CONSTRAINT "VisitorSession_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

