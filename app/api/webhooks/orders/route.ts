import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook } from '@/lib/utils';
import { prisma } from '@/lib/db';
import { attributeOrder, isSubscriptionRenewal, getSellingPlanId, getAppstleSubscriptionData } from '@/lib/attribution';
import { attributeOrderEnhanced } from '@/lib/attribution-enhanced';
import { getSubscriptionAttribution, createSubscriptionAttribution, incrementSubscriptionPayments, parseIntervalMonths } from '@/lib/subscription';
import { getAffiliateOffer, calculateOfferCommission, shouldCommissionRebill, createOfferCommission } from '@/lib/offer-commission';
import { runFraudChecks } from '@/lib/fraud';

/**
 * Handle Shopify order webhooks (orders/create, orders/paid)
 * Must be idempotent and verify HMAC
 */
// Disable body parsing to get raw body for HMAC verification
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Store body at function scope for error handling
  let body = '';
  try {
    // Read body as raw text - this is critical for HMAC verification
    // The body must be exactly as Shopify sent it, without any modifications
    body = await request.text();
    const hmac = request.headers.get('x-shopify-hmac-sha256');
    const topic = request.headers.get('x-shopify-topic');
    const shop = request.headers.get('x-shopify-shop-domain');

    if (!hmac || !shop) {
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // Verify HMAC
    const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_WEBHOOK_SECRET;
    
    // DEVELOPMENT ONLY: Allow bypassing HMAC verification for testing
    // ⚠️ WARNING: Never enable this in production!
    const bypassHmac = process.env.BYPASS_WEBHOOK_HMAC === 'true' && process.env.NODE_ENV === 'development';
    
    if (!secret && !bypassHmac) {
      console.error('❌ HMAC Verification Failed: SHOPIFY_API_SECRET or SHOPIFY_WEBHOOK_SECRET not set');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    // Check for potential body modification issues
    // ngrok or proxies might modify the body, so we need to verify the raw body
    const rawBody = body;
    
    // CAPTURE EXACT DATA FROM SHOPIFY FOR DEBUGGING
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📥 SHOPIFY WEBHOOK DATA CAPTURE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔑 HMAC from Shopify (x-shopify-hmac-sha256):');
    console.log('   Full HMAC:', hmac);
    console.log('   HMAC Length:', hmac?.length || 0);
    console.log('');
    console.log('📦 Body from Shopify:');
    console.log('   Body Type:', typeof body);
    console.log('   Body Length:', body.length);
    console.log('   Body (first 200 chars):', body.substring(0, 200));
    console.log('   Body (last 200 chars):', body.substring(Math.max(0, body.length - 200)));
    console.log('');
    console.log('🔐 Our Configuration:');
    console.log('   Secret Set:', !!secret);
    console.log('   Secret Length:', secret?.length || 0);
    console.log('   Secret Preview:', secret ? `${secret.substring(0, 10)}...${secret.substring(secret.length - 5)}` : 'NOT SET');
    console.log('   Shop Domain:', shop);
    console.log('   Topic:', topic);
    console.log('');
    
    // Calculate what WE think the HMAC should be
    if (secret) {
      const crypto = require('crypto');
      const ourCalculatedHmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');
      
      console.log('🧮 Our Calculated HMAC:');
      console.log('   Full HMAC:', ourCalculatedHmac);
      console.log('   HMAC Length:', ourCalculatedHmac.length);
      console.log('');
      console.log('🔍 Comparison:');
      console.log('   Shopify HMAC:', hmac);
      console.log('   Our HMAC:    ', ourCalculatedHmac);
      console.log('   Match:', hmac === ourCalculatedHmac ? '✅ YES' : '❌ NO');
      console.log('');
      
      // Check if lengths match
      if (hmac.length !== ourCalculatedHmac.length) {
        console.log('⚠️  HMAC Length Mismatch!');
        console.log('   Shopify length:', hmac.length);
        console.log('   Our length:', ourCalculatedHmac.length);
      }
      
      // Check first few characters
      if (hmac.substring(0, 10) !== ourCalculatedHmac.substring(0, 10)) {
        console.log('⚠️  HMAC starts differently - likely wrong secret or modified body');
      }
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    
    let isValid = false;
    
    if (bypassHmac) {
      console.warn('⚠️  WARNING: HMAC verification is BYPASSED (development only)');
      console.warn('   This should NEVER be enabled in production!');
      isValid = true;
    } else if (secret) {
      isValid = verifyShopifyWebhook(
        rawBody,
        hmac,
        secret
      );
    } else {
      console.error('❌ HMAC Verification Failed: Secret not available');
      isValid = false;
    }

    if (!isValid) {
      console.error('❌ HMAC Verification Failed');
      console.error('   HMAC Header:', hmac ? `${hmac.substring(0, 20)}...` : 'MISSING');
      console.error('   Body Length:', body.length);
      console.error('   Body Preview:', body.substring(0, 100));
      console.error('   Secret Set:', !!secret);
      console.error('   Secret Length:', secret?.length || 0);
      console.error('   Shop:', shop);
      console.error('   ⚠️  Possible causes:');
      console.error('      1. Body was modified by ngrok/proxy (MOST LIKELY)');
      console.error('      2. Secret mismatch (check Shopify Partners)');
      console.error('      3. Body encoding issue');
      console.error('');
      console.error('   💡 Solutions:');
      console.error('      - Use Cloudflare Tunnel instead of ngrok: cloudflared tunnel --url http://localhost:3000');
      console.error('      - Disable ngrok request inspection');
      console.error('      - For testing only: Set BYPASS_WEBHOOK_HMAC=true in .env (development only!)');
      return NextResponse.json(
        { error: 'Invalid HMAC - webhook signature verification failed' },
        { status: 401 }
      );
    }
    
    console.log('✅ HMAC Verification Passed');

    // Parse JSON body with error handling
    let order;
    try {
      order = JSON.parse(body);
    } catch (parseError: any) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.error('   Body preview:', body.substring(0, 200));
      return NextResponse.json(
        { error: 'Invalid JSON in webhook body' },
        { status: 400 }
      );
    }

    const shopifyShopId = shop.replace('.myshopify.com', '');
    
    // Check if this is a test webhook (Shopify test webhooks have minimal data)
    // Also check x-shopify-test header
    const isTestWebhookHeader = request.headers.get('x-shopify-test') === 'true';
    const isTestWebhook = !order.id || !order.order_number || order.test === true || isTestWebhookHeader;
    
    // Log app_id to identify which app sent the webhook
    const appId = order.app_id;
    console.log('📱 Webhook App Info:');
    console.log('   app_id from body:', appId || 'null (test webhook or no app)');
    console.log('   x-shopify-test header:', isTestWebhookHeader ? 'true (test webhook)' : 'false (real webhook)');
    if (appId) {
      console.log('   ⚠️  If app_id doesn\'t match your app, this webhook is from a different app!');
    }
    
    // Enhanced logging for debugging
    console.log(`=== WEBHOOK RECEIVED ===`);
    console.log(`Topic: ${topic}`);
    console.log(`Shop: ${shop}`);
    console.log(`Shop ID: ${shopifyShopId}`);
    console.log(`Is Test Webhook: ${isTestWebhook}`);
    
    // Safe logging (order might not have all fields, especially in test webhooks)
    if (order) {
      console.log(`Order Number: ${order.order_number || 'N/A'}`);
      console.log(`Order ID: ${order.id || 'N/A'}`);
      console.log(`Financial Status: ${order.financial_status || 'N/A'}`);
      console.log(`Total Price: ${order.total_price || 'N/A'}`);
      console.log(`Subtotal Price: ${order.subtotal_price || 'N/A'}`);
      console.log(`Email: ${order.email || 'N/A'}`);
      console.log(`Cart Attributes:`, JSON.stringify(order.attributes || [], null, 2));
      console.log(`Note Attributes:`, JSON.stringify(order.note_attributes || [], null, 2));
      console.log(`Order Metafields:`, JSON.stringify(order.metafields || [], null, 2));
      console.log(`Referring Site: ${order.referring_site || 'none'}`);
      console.log(`Landing Site: ${order.client_details?.landing_site || 'none'}`);
    } else {
      console.log(`⚠️ Order object is null or undefined`);
    }
    console.log(`======================`);
    
    // Handle test webhooks - just acknowledge, don't process
    if (isTestWebhook) {
      console.log('✅ Test webhook received - acknowledging without processing');
      return NextResponse.json({ received: true, test: true });
    }

    // Handle different webhook events
    // Shopify webhook events vary by API version:
    // - 'orders/create' or 'Order creation' → Order created
    // - 'orders/updated' or 'Order update' → Order status changed
    // - 'order/payment' or 'Order payment' → Payment received (if available)
    // We check order.financial_status to determine if order is paid
    
    const isOrderCreate = topic === 'orders/create' || topic === 'Order creation';
    const isOrderUpdate = topic === 'orders/updated' || topic === 'Order update';
    const isOrderPayment = topic === 'order/payment' || topic === 'Order payment';
    
    if (isOrderCreate) {
      // For orders/create, just attribute the order (don't create commission yet)
      // Extract attribution data from multiple sources (cart attributes, note attributes, metafields)
      // Cart attributes are set by theme script and included in webhook
      // Note: Shopify sometimes stores cart attributes in note_attributes instead
      const clickIdFromAttributes = order.attributes?.find(
        (attr: any) => attr.key === 'affiliate_click_id' || attr.name === 'affiliate_click_id'
      )?.value;
      
      const clickIdFromNoteAttributes = order.note_attributes?.find(
        (attr: any) => attr.name === 'affiliate_click_id'
      )?.value;
      
      const clickIdFromMetafields = order.metafields?.find(
        (m: any) => m.namespace === 'affiliate' && m.key === 'click_id'
      )?.value;
      
      const clickId = clickIdFromAttributes || clickIdFromNoteAttributes || clickIdFromMetafields;

      console.log(`[orders/create] Extracted clickId from attributes: ${clickId || 'NOT FOUND'}`);
      console.log(`[orders/create]   - From order.attributes: ${clickIdFromAttributes || 'NOT FOUND'}`);
      console.log(`[orders/create]   - From order.note_attributes: ${clickIdFromNoteAttributes || 'NOT FOUND'}`);
      console.log(`[orders/create]   - From order.metafields: ${clickIdFromMetafields || 'NOT FOUND'}`);
      console.log(`[orders/create] All order attributes:`, JSON.stringify(order.attributes || [], null, 2));
      console.log(`[orders/create] All note attributes:`, JSON.stringify(order.note_attributes || [], null, 2));

      const couponCode = order.discount_codes?.[0]?.code;
      
      // Check for internal traffic markers in cart attributes or note attributes
      const isInternalFromAttributes = order.attributes?.find(
        (attr: any) => (attr.key === 'ref' || attr.name === 'ref') && (attr.value === 'internal' || attr.value === 'direct')
      )?.value;
      
      const isInternalFromNoteAttributes = order.note_attributes?.find(
        (attr: any) => attr.name === 'ref' && (attr.value === 'internal' || attr.value === 'direct')
      )?.value;
      
      const isInternal = isInternalFromAttributes || isInternalFromNoteAttributes;
      
      console.log(`[orders/create] Is internal traffic: ${!!isInternal}`);

      // Attribute order using enhanced method with multiple fallbacks
      // This ensures attribution even if cookies fail (critical for legal compliance)
      // CRITICAL: Internal traffic detection prevents paying affiliates for your own marketing
      // Ensure we have required fields before processing
      if (!order.id || !order.order_number) {
        console.log('⚠️ Missing required order fields (id or order_number) - skipping attribution');
        return NextResponse.json({ received: true });
      }
      
      const orderAttributionId = await attributeOrderEnhanced({
        shopifyOrderId: order.id.toString(),
        shopifyOrderNumber: order.order_number.toString(),
        clickId: isInternal ? undefined : clickId, // Don't use affiliate click_id if internal
        couponCode,
        orderEmail: order.email,
        customerName: order.customer?.first_name && order.customer?.last_name 
          ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
          : order.customer?.first_name || order.customer?.last_name || order.billing_address?.name || null,
        orderTotal: parseFloat(order.total_price || '0'),
        orderCurrency: order.currency || 'USD',
        orderBillingAddress: order.billing_address,
        orderIp: order.client_details?.browser_ip || 
                 request.headers.get('x-forwarded-for')?.split(',')[0] ||
                 request.headers.get('x-real-ip') || undefined,
        orderUserAgent: order.client_details?.user_agent ||
                        request.headers.get('user-agent') || undefined,
        orderReferrer: order.referring_site || order.client_details?.landing_site || undefined,
        orderCreatedAt: new Date(order.created_at || Date.now()), // For attribution window check
        shopifyShopId,
      });

      if (orderAttributionId) {
        // Store order details for later commission calculation
        await prisma.orderAttribution.update({
          where: { id: orderAttributionId },
          data: {
            // We'll store order total and product info when we have it
            // For now, just ensure attribution exists
          },
        });
      }

      return NextResponse.json({ received: true });
    }

    // For order updates or payment events, check if order is paid and create commission
    // Also handle orders/create if order is already paid (instant payment)
    // NOTE: $0 orders may be marked as "pending" or "authorized" instead of "paid"
    // We'll still attribute them and create commissions if they're $0 (test orders)
    if (isOrderUpdate || isOrderPayment || (isOrderCreate && order.financial_status === 'paid')) {
      // Check if order is paid (for commission creation)
      const financialStatus = order.financial_status;
      const orderTotal = parseFloat(order.total_price || '0');
      const isPaid = financialStatus === 'paid' || financialStatus === 'partially_paid';
      const isZeroOrder = orderTotal === 0;
      
      // Only create commissions for paid orders OR $0 test orders
      if (!isPaid && !isZeroOrder) {
        // Order not paid yet and not a $0 test order, skip commission creation
        console.log(`Skipping commission: Order not paid (status: ${financialStatus}, total: ${orderTotal})`);
        return NextResponse.json({ received: true });
      }
      
      if (isZeroOrder) {
        console.log(`Processing $0 test order - will create commission even if status is ${financialStatus}`);
      }
      
      // Proceed to create commission (code continues below)
    } else {
      // Unknown or unhandled event type, ignore
      return NextResponse.json({ received: true });
    }
    
    // Check if commission already exists (idempotency)
    // This prevents creating duplicate commissions if webhook fires multiple times

    // Extract attribution data from multiple sources (cart attributes, note attributes, metafields)
    // Cart attributes are set by theme script and included in webhook
    // Note: Shopify sometimes stores cart attributes in note_attributes instead
    const clickIdFromAttributes = order.attributes?.find(
      (attr: any) => attr.key === 'affiliate_click_id' || attr.name === 'affiliate_click_id'
    )?.value;
    
    const clickIdFromNoteAttributes = order.note_attributes?.find(
      (attr: any) => attr.name === 'affiliate_click_id'
    )?.value;
    
    const clickIdFromMetafields = order.metafields?.find(
      (m: any) => m.namespace === 'affiliate' && m.key === 'click_id'
    )?.value;
    
    const clickId = clickIdFromAttributes || clickIdFromNoteAttributes || clickIdFromMetafields;

    const couponCode = order.discount_codes?.[0]?.code;
    
    // Check for internal traffic markers in cart attributes or note attributes
    const isInternalFromAttributes = order.attributes?.find(
      (attr: any) => (attr.key === 'ref' || attr.name === 'ref') && (attr.value === 'internal' || attr.value === 'direct')
    )?.value;
    
    const isInternalFromNoteAttributes = order.note_attributes?.find(
      (attr: any) => attr.name === 'ref' && (attr.value === 'internal' || attr.value === 'direct')
    )?.value;
    
    const isInternal = isInternalFromAttributes || isInternalFromNoteAttributes;

    // Check if commission already exists (idempotency)
    const existingCommission = await prisma.commission.findFirst({
      where: {
        shopify_order_id: order.id.toString(),
        shopify_shop_id: shopifyShopId,
      },
    });

    if (existingCommission) {
      // Already processed, return success
      return NextResponse.json({ received: true });
    }

    // Ensure we have required fields before processing
    if (!order.id || !order.order_number) {
      console.log('⚠️ Missing required order fields (id or order_number) - skipping commission creation');
      return NextResponse.json({ received: true });
    }

      // Attribute order using enhanced method with multiple fallbacks
      // This ensures attribution even if cookies fail (critical for legal compliance)
      // IMPORTANT: Pass order creation date for attribution window enforcement
      // CRITICAL: Internal traffic detection prevents paying affiliates for your own marketing
      const orderAttributionId = await attributeOrderEnhanced({
        shopifyOrderId: order.id.toString(),
        shopifyOrderNumber: order.order_number.toString(),
        clickId: isInternal ? undefined : clickId, // Don't use affiliate click_id if internal
        couponCode,
        orderEmail: order.email,
        customerName: order.customer?.first_name && order.customer?.last_name 
          ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
          : order.customer?.first_name || order.customer?.last_name || order.billing_address?.name || null,
        orderTotal: parseFloat(order.total_price || '0'),
        orderCurrency: order.currency || 'USD',
        orderBillingAddress: order.billing_address,
        orderIp: order.client_details?.browser_ip || 
                 request.headers.get('x-forwarded-for')?.split(',')[0] ||
                 request.headers.get('x-real-ip') || undefined,
        orderUserAgent: order.client_details?.user_agent ||
                        request.headers.get('user-agent') || undefined,
        orderReferrer: order.referring_site || order.client_details?.landing_site || undefined,
        orderCreatedAt: new Date(order.created_at || Date.now()), // For attribution window check
        shopifyShopId,
      });

    if (!orderAttributionId) {
      // No attribution found, skip commission
      console.log(`No attribution found for order ${order.order_number}. Check: 1) Click was recorded, 2) Attribution window, 3) Affiliate exists and is active`);
      return NextResponse.json({ received: true });
    }
    
    console.log(`Order attributed successfully. Attribution ID: ${orderAttributionId}`);

    // Get order attribution with affiliate and offer
    const attribution = await prisma.orderAttribution.findUnique({
      where: { id: orderAttributionId },
      include: {
        affiliate: {
          include: {
            offer: true, // Get the affiliate's offer
          },
        },
        click: true,
      },
    });

    if (!attribution) {
      console.log(`⚠️ Attribution record not found (ID: ${orderAttributionId}) - skipping commission`);
      return NextResponse.json({ received: true });
    }
    
    // Check if affiliate exists (might have been deleted)
    if (!attribution.affiliate) {
      console.log(`⚠️ Affiliate not found for attribution ${orderAttributionId} (affiliate may have been deleted) - skipping commission`);
      return NextResponse.json({ received: true });
    }
    
    if (attribution.affiliate.status !== 'active') {
      console.log(`⚠️ Affiliate ${attribution.affiliate_id} is not active (status: ${attribution.affiliate.status}) - skipping commission`);
      return NextResponse.json({ received: true });
    }

    // Get affiliate's offer
    const offer = attribution.affiliate.offer;
    if (!offer) {
      // Affiliate has no offer assigned, skip commission
      console.log(`⚠️ Affiliate ${attribution.affiliate_id} has no offer assigned - skipping commission`);
      return NextResponse.json({ received: true });
    }
    
    console.log(`✅ Processing commission for affiliate ${attribution.affiliate_id}, offer: ${offer.name}`);

    // Determine if this is a subscription order
    const isRenewal = isSubscriptionRenewal(order.line_items || []);
    const sellingPlanId = getSellingPlanId(order.line_items || []);
    
    // Extract Appstle subscription data (for better renewal matching)
    const appstleData = getAppstleSubscriptionData(order);
    
    // DEBUG: Log Appstle subscription data for renewal orders
    if (isRenewal || appstleData.sellingPlanId) {
      console.log('=== APSTLE SUBSCRIPTION ORDER DEBUG ===');
      console.log('Order ID:', order.id);
      console.log('Order Number:', order.order_number);
      console.log('Is Renewal:', isRenewal);
      console.log('Appstle Data:', JSON.stringify(appstleData, null, 2));
      console.log('Order Metafields:', JSON.stringify(order.metafields || [], null, 2));
      console.log('Order Tags:', order.tags);
      console.log('Order Note:', order.note);
      console.log('Order Attributes:', JSON.stringify(order.attributes || [], null, 2));
      console.log('Line Items (first 2):', JSON.stringify((order.line_items || []).slice(0, 2), null, 2));
      console.log('======================================');
    }

    let isInitialPayment = true;
    let subscriptionAttributionId: string | null = null;

    if (isRenewal && sellingPlanId) {
      // This is a subscription renewal/rebill
      isInitialPayment = false;

      // For Appstle renewals, find the original subscription
      // Try to use original order ID from Appstle data if available
      let subscription = null;
      
      if (appstleData.originalOrderId) {
        // Try to find subscription by original order ID (most reliable)
        const originalAttribution = await prisma.orderAttribution.findFirst({
          where: {
            shopify_order_id: appstleData.originalOrderId,
            shopify_shop_id: shopifyShopId,
          },
          include: {
            affiliate: true,
          },
        });
        
        if (originalAttribution) {
          subscription = await prisma.subscriptionAttribution.findFirst({
            where: {
              affiliate_id: originalAttribution.affiliate_id,
              selling_plan_id: sellingPlanId,
              active: true,
            },
            orderBy: {
              created_at: 'desc',
            },
          });
        }
      }
      
      // Fallback: Find by affiliate and selling plan (most recent active subscription)
      if (!subscription) {
        subscription = await prisma.subscriptionAttribution.findFirst({
          where: {
            affiliate_id: attribution.affiliate_id,
            selling_plan_id: sellingPlanId,
            active: true,
          },
          orderBy: {
            created_at: 'desc', // Get most recent subscription for this affiliate/plan
          },
        });
      }

      if (subscription) {
        subscriptionAttributionId = subscription.id;
      } else {
        // Can't find subscription attribution, skip commission for safety
        console.warn(`No subscription attribution found for renewal order ${order.id}, affiliate ${attribution.affiliate_id}`);
        return NextResponse.json({ received: true });
      }

      // Check if rebill should receive commission based on offer settings
      if (subscriptionAttributionId) {
        const shouldCommission = await shouldCommissionRebill(
          subscriptionAttributionId,
          offer
        );
        if (!shouldCommission) {
          return NextResponse.json({ received: true });
        }
      } else {
        // Can't find subscription attribution, skip commission for safety
        return NextResponse.json({ received: true });
      }
    } else if (sellingPlanId) {
      // This is the initial subscription order
      isInitialPayment = true;
      
      // Create subscription attribution
      const intervalMonths = parseIntervalMonths(
        order.line_items?.[0]?.selling_plan_allocation?.selling_plan?.billing_policy?.interval || '1 month'
      );

      subscriptionAttributionId = await createSubscriptionAttribution({
        originalOrderId: order.id.toString(),
        affiliateId: attribution.affiliate_id,
        sellingPlanId,
        intervalMonths,
        maxPayments: offer.subscription_max_payments || null,
        shopifyShopId,
      });
    }

    // Calculate order subtotal (excluding discounts for commission calculation)
    const orderSubtotal = parseFloat(order.subtotal_price || '0');

    // Create commission using Offer-based calculation
    const commissionId = await createOfferCommission(
      attribution.affiliate_id,
      orderAttributionId,
      order.id.toString(),
      orderSubtotal,
      order.currency || 'USD',
      offer,
      isInitialPayment,
      shopifyShopId
    );

    // Update subscription payment count if applicable
    if (subscriptionAttributionId && !isInitialPayment) {
      await incrementSubscriptionPayments(subscriptionAttributionId);
    }

    // Run fraud checks
    await runFraudChecks(
      commissionId,
      attribution.affiliate_id,
      order.email || '',
      order.billing_address || {},
      shopifyShopId,
      attribution.click?.ip_hash || undefined
    );

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('❌ Order webhook error:', error);
    console.error('   Error name:', error.name);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    
    // Log order details for debugging
    try {
      const orderData = JSON.parse(body);
      console.error('   Order ID:', orderData.id);
      console.error('   Order Number:', orderData.order_number);
      console.error('   Financial Status:', orderData.financial_status);
    } catch (e) {
      // Ignore parse errors
    }
    
    // Provide more specific error information
    let errorMessage = 'Webhook processing failed';
    let statusCode = 500;
    
    if (error.name === 'PrismaClientKnownRequestError') {
      errorMessage = `Database error: ${error.message}`;
      console.error('   Prisma error code:', error.code);
      console.error('   Prisma error meta:', JSON.stringify(error.meta || {}, null, 2));
    } else if (error.name === 'PrismaClientValidationError') {
      errorMessage = `Validation error: ${error.message}`;
      statusCode = 400;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // For non-critical errors (like missing attribution), return 200 to stop retries
    // For critical errors (database issues), return 500 to allow retries
    const isNonCriticalError = 
      errorMessage.includes('attribution') ||
      errorMessage.includes('affiliate') ||
      error.code === 'P2025'; // Record not found
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: isNonCriticalError ? 200 : statusCode }
    );
  }
}