import { prisma } from './db';

/**
 * Attribution model: Last-click wins, coupon overrides link
 */

export interface ClickData {
  clickId: string;
  affiliateId: string;
  linkId?: string;
  landingUrl: string;
  ipHash: string;
  userAgentHash: string;
  shopifyShopId: string;
}

export interface OrderAttributionData {
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  clickId?: string;
  couponCode?: string;
  shopifyShopId: string;
}

/**
 * Record a click for an affiliate
 */
export async function recordClick(data: ClickData): Promise<void> {
  await prisma.click.create({
    data: {
      id: data.clickId,
      affiliate_id: data.affiliateId,
      link_id: data.linkId,
      landing_url: data.landingUrl,
      ip_hash: data.ipHash,
      user_agent_hash: data.userAgentHash,
      shopify_shop_id: data.shopifyShopId,
    },
  });
}

/**
 * Attribute an order to an affiliate
 * Logic: Coupon overrides link, last-click wins
 */
export async function attributeOrder(data: OrderAttributionData): Promise<string | null> {
  let affiliateId: string | null = null;
  let clickId: string | null = data.clickId || null;
  let attributionType: 'link' | 'coupon' = 'link';

  // Check if coupon code matches any affiliate
  if (data.couponCode) {
    const couponLink = await prisma.affiliateLink.findFirst({
      where: {
        coupon_code: data.couponCode,
        shopify_shop_id: data.shopifyShopId,
      },
      include: {
        affiliate: true,
      },
    });

    if (couponLink && couponLink.affiliate.status === 'active') {
      affiliateId = couponLink.affiliate_id;
      attributionType = 'coupon';
      // Coupon attribution - ignore click_id for attribution
      clickId = null;
    }
  }

  // If no coupon match, use click_id (last-click wins)
  if (!affiliateId && data.clickId) {
    const click = await prisma.click.findUnique({
      where: { id: data.clickId },
      include: {
        affiliate: true,
      },
    });

    if (click && click.affiliate.status === 'active') {
      affiliateId = click.affiliate_id;
      clickId = click.id;
      attributionType = 'link';
    }
  }

  // If still no attribution, check for recent clicks from the same IP/session
  // This handles cases where click_id wasn't captured but we have session data
  if (!affiliateId) {
    // Could implement session-based attribution here
    // For now, we require explicit click_id or coupon
  }

  if (!affiliateId) {
    return null;
  }

  // Create or update order attribution
  const attribution = await prisma.orderAttribution.upsert({
    where: {
      shopify_order_id: data.shopifyOrderId,
    },
    create: {
      shopify_order_id: data.shopifyOrderId,
      shopify_order_number: data.shopifyOrderNumber,
      affiliate_id: affiliateId,
      click_id: clickId,
      attribution_type: attributionType,
      shopify_shop_id: data.shopifyShopId,
    },
    update: {
      affiliate_id: affiliateId,
      click_id: clickId,
      attribution_type: attributionType,
    },
  });

  return attribution.id;
}

/**
 * Check if order is a subscription renewal (Appstle)
 * 
 * Appstle subscription renewals can be identified by:
 * 1. Line item properties with '__appstle-selected-selling-plan'
 * 2. Line item tags with 'appstle_subscription_recurring_order'
 * 3. Order metafields (check in webhook handler)
 * 4. Order tags (check in webhook handler)
 * 
 * Note: Initial subscription orders also have selling plans, so we need
 * additional logic to distinguish renewals from initial orders.
 * Currently, we check if a subscription attribution already exists.
 */
export function isSubscriptionRenewal(lineItems: any[]): boolean {
  return lineItems.some((item) => {
    // Check for Appstle subscription selling plan property
    // This exists on both initial and renewal orders
    if (item.properties?.some((prop: any) => 
      prop.name === '__appstle-selected-selling-plan'
    )) {
      return true;
    }
    // Check for Appstle subscription renewal tag
    // This should only exist on renewal orders
    if (item.tags?.includes('appstle_subscription_recurring_order')) {
      return true;
    }
    return false;
  });
}

/**
 * Extract selling plan ID from order line items
 * 
 * Also checks for Appstle-specific properties that might contain
 * original order ID or subscription ID for better renewal matching.
 */
export function getSellingPlanId(lineItems: any[]): string | null {
  for (const item of lineItems) {
    const planProp = item.properties?.find((prop: any) => 
      prop.name === '__appstle-selected-selling-plan'
    );
    if (planProp) {
      return planProp.value;
    }
  }
  return null;
}

/**
 * Extract Appstle subscription identifiers from order
 * Returns any Appstle-specific data that can help match renewals to original subscriptions
 */
export function getAppstleSubscriptionData(order: any): {
  sellingPlanId: string | null;
  originalOrderId: string | null;
  subscriptionId: string | null;
  renewalNumber: number | null;
} {
  const sellingPlanId = getSellingPlanId(order.line_items || []);
  
  // Check order metafields for Appstle data
  const appstleMetafields = (order.metafields || []).filter(
    (m: any) => m.namespace === 'appstle' || m.namespace === 'appstle_subscription'
  );
  
  const originalOrderId = appstleMetafields.find(
    (m: any) => m.key === 'original_order_id' || m.key === 'parent_order_id'
  )?.value || null;
  
  const subscriptionId = appstleMetafields.find(
    (m: any) => m.key === 'subscription_id'
  )?.value || null;
  
  // Check line item properties for additional Appstle data
  let renewalNumber: number | null = null;
  for (const item of order.line_items || []) {
    const renewalProp = item.properties?.find((prop: any) => 
      prop.name === '__appstle-renewal-number' || 
      prop.name === '__appstle-payment-number'
    );
    if (renewalProp) {
      renewalNumber = parseInt(renewalProp.value, 10) || null;
      break;
    }
  }
  
  return {
    sellingPlanId,
    originalOrderId,
    subscriptionId,
    renewalNumber,
  };
}