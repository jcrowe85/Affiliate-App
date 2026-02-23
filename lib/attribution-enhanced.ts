import { prisma } from './db';
import { hashIP, hashUserAgent } from './utils';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Enhanced attribution with multiple fallback methods for legal compliance
 * 
 * ATTRIBUTION POLICY (explicit and enforced):
 * 1. Last-click wins: Most recent valid click within attribution window wins
 * 2. Internal/direct never overwrites: If ref=internal or ref=direct, never attribute to affiliate
 * 3. Existing click protection: If clickId exists and is <30 days old, don't overwrite unless:
 *    - New click is from different affiliate AND within attribution window (last-touch)
 *    - Attribution window check: Each click must be within its own affiliate's attribution window
 * 4. Attribution window enforcement: Only clicks within the offer's attribution window (default 90 days) count
 * 
 * Attribution Priority (most reliable first):
 * 1. URL parameter (ref=30483) - Always works, server-side
 * 2. Cookie (affiliate_click_id) - Works if cookies enabled
 * 3. Cart attribute (affiliate_click_id) - Set by theme script
 * 4. IP + User Agent fingerprinting - Fallback for privacy-focused users
 * 5. Recent click lookup - Last resort
 * 
 * Note: ?ref=internal and ?ref=direct are excluded from affiliate attribution.
 */

export interface EnhancedAttributionData {
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  clickId?: string;
  couponCode?: string;
  orderEmail?: string;
  customerName?: string; // Customer name from order
  orderTotal?: number; // Order total price
  orderCurrency?: string; // Order currency
  orderBillingAddress?: any;
  orderIp?: string;
  orderUserAgent?: string;
  orderReferrer?: string; // For URL parameter extraction
  orderCreatedAt?: Date; // Order creation date for attribution window check
  shopifyShopId: string;
}

/**
 * Get attribution window from offer (defaults to 90 days)
 */
async function getAttributionWindow(affiliateId: string | null, shopifyShopId: string): Promise<number> {
  if (!affiliateId) return 90; // Default window
  
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: { offer: true },
  });
  
  return affiliate?.offer?.attribution_window_days || 90;
}

/**
 * Check if click is within attribution window
 */
function isWithinAttributionWindow(
  clickDate: Date,
  orderDate: Date,
  windowDays: number
): boolean {
  const windowStart = new Date(orderDate);
  windowStart.setDate(windowStart.getDate() - windowDays);
  return clickDate >= windowStart && clickDate <= orderDate;
}

/**
 * Check if traffic is internal (your own marketing, organic search, direct)
 * Internal traffic should NOT be attributed to affiliates
 */
function isInternalTraffic(data: EnhancedAttributionData): boolean {
  // Check URL parameters in referrer
  if (data.orderReferrer) {
    try {
      const referrerUrl = new URL(data.orderReferrer);
      const refParam = referrerUrl.searchParams.get('ref');
      
      // If ref=internal, this is internal traffic
      if (refParam === 'internal' || refParam === 'direct') {
        return true;
      }
    } catch (e) {
      // Invalid URL, continue
    }
  }
  
  // Check if referrer is from your own domain (internal navigation)
  if (data.orderReferrer) {
    try {
      const referrerUrl = new URL(data.orderReferrer);
      const referrerHost = referrerUrl.hostname;
      
      // If referrer is your own domain (not external), it's internal
      // This catches cases where user navigates internally on your site
      // Note: You may want to check against your actual domain
      if (referrerHost && !referrerHost.includes('myshopify.com') && 
          !referrerHost.includes('shopify.com')) {
        // Could be internal if it's your domain
        // For now, we'll rely on ref=internal parameter for explicit marking
      }
    } catch (e) {
      // Invalid URL, continue
    }
  }
  
  // Check for organic search (Google, Bing, etc.) - these are internal traffic
  // If user came from search engine but no affiliate params, it's organic/internal
  if (data.orderReferrer) {
    try {
      const referrerUrl = new URL(data.orderReferrer);
      const referrerHost = referrerUrl.hostname.toLowerCase();
      
      // Common search engines
      const searchEngines = [
        'google.com', 'google.co.uk', 'google.ca', 'google.com.au',
        'bing.com', 'yahoo.com', 'duckduckgo.com', 'yandex.com',
        'baidu.com', 'ask.com'
      ];
      
      const isSearchEngine = searchEngines.some(engine => 
        referrerHost.includes(engine)
      );
      
      // If came from search engine AND no affiliate click_id, it's organic/internal
      if (isSearchEngine && !data.clickId) {
        return true; // Organic search = internal traffic
      }
    } catch (e) {
      // Invalid URL, continue
    }
  }
  
  return false;
}

/**
 * Enhanced order attribution with multiple fallback methods
 * This ensures we can always attribute orders even if cookies fail
 * 
 * CRITICAL RULES:
 * 1. Internal traffic check FIRST - if internal, no affiliate attribution
 * 2. Attribution window enforcement - clicks outside window are ignored
 * 3. Last-touch wins - most recent click within window gets credit
 * 4. No double payment - if attribution changes, old commission is reversed
 */
export async function attributeOrderEnhanced(
  data: EnhancedAttributionData
): Promise<string | null> {
  // CRITICAL: Check for internal traffic FIRST
  // If internal traffic detected, do NOT attribute to affiliates
  if (isInternalTraffic(data)) {
    console.log(`Order ${data.shopifyOrderNumber} detected as internal traffic - skipping affiliate attribution`);
    return null; // No affiliate attribution for internal traffic
  }
  
  const orderDate = data.orderCreatedAt || new Date();
  let affiliateId: string | null = null;
  let clickId: string | null = data.clickId || null;
  let attributionType: 'link' | 'coupon' | 'fingerprint' | 'url_param' = 'link';
  let attributionMethod: string = 'unknown';
  let clickDate: Date | null = null;

  // Method 1: Coupon code (highest priority, always reliable)
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
      attributionMethod = 'coupon_code';
      clickId = null; // Coupon attribution doesn't use click_id
    }
  }

  // Method 2a: Extract click_id from URL parameters in referrer (most reliable)
  if (!affiliateId && data.orderReferrer) {
    try {
      const referrerUrl = new URL(data.orderReferrer);
      const urlClickId = referrerUrl.searchParams.get('click_id');
      const urlRef = referrerUrl.searchParams.get('ref');
      
      if (urlClickId) {
        const click = await prisma.click.findUnique({
          where: { id: urlClickId },
          include: {
            affiliate: {
              include: { offer: true },
            },
          },
        });

        if (click && click.affiliate.status === 'active') {
          // Check attribution window
          const windowDays = click.affiliate.offer?.attribution_window_days || 90;
          if (isWithinAttributionWindow(click.created_at, orderDate, windowDays)) {
            affiliateId = click.affiliate_id;
            clickId = click.id;
            clickDate = click.created_at;
            attributionType = 'link';
            attributionMethod = 'url_parameter_click_id';
          } else {
            console.warn(`Click ${urlClickId} outside attribution window (${windowDays} days)`);
          }
        }
      } else if (urlRef && urlRef !== 'internal' && urlRef !== 'direct') {
        // Direct affiliate number in URL (using 'ref' parameter)
        // Skip if ref=internal or ref=direct (internal traffic)
        const affiliateNumber = parseInt(urlRef, 10);
        if (!isNaN(affiliateNumber)) {
          const affiliate = await prisma.affiliate.findFirst({
            where: {
              affiliate_number: affiliateNumber,
              shopify_shop_id: data.shopifyShopId,
              status: 'active',
            },
            include: {
              offer: true,
            },
          });
          if (affiliate) {
            // Get attribution window from offer
            const windowDays = affiliate.offer?.attribution_window_days || 90;
            const windowStart = new Date(orderDate);
            windowStart.setDate(windowStart.getDate() - windowDays);
            
            // Find most recent click for this affiliate within attribution window
            const recentClick = await prisma.click.findFirst({
              where: {
                affiliate_id: affiliate.id,
                shopify_shop_id: data.shopifyShopId,
                created_at: {
                  gte: windowStart,
                  lte: orderDate,
                },
              },
              orderBy: {
                created_at: 'desc', // Last-touch: most recent click wins
              },
            });
            
            if (recentClick) {
              affiliateId = affiliate.id;
              clickId = recentClick.id;
              clickDate = recentClick.created_at;
              attributionMethod = 'url_parameter_ref';
            }
          }
        }
      }
    } catch (e) {
      // Invalid referrer URL, continue to next method
    }
  }

  // Method 2b: Click ID from cart attribute or cookie (if available)
  // CRITICAL: When the order includes affiliate_click_id (set at checkout from the customer's session),
  // we MUST use that click for attribution. Do NOT override with "most recent click in the shop" —
  // that would wrongly attribute to another affiliate (e.g. the merchant's own test click) when the
  // customer had a different affiliate in their cart.
  if (!affiliateId && data.clickId) {
    const click = await prisma.click.findUnique({
      where: { id: data.clickId },
      include: {
        affiliate: {
          include: { offer: true },
        },
      },
    });

    if (click && click.affiliate.status === 'active') {
      const windowDays = click.affiliate.offer?.attribution_window_days || 90;
      if (isWithinAttributionWindow(click.created_at, orderDate, windowDays)) {
        affiliateId = click.affiliate_id;
        clickId = click.id;
        clickDate = click.created_at;
        attributionType = 'link';
        attributionMethod = 'cookie_click_id';
      } else {
        console.warn(`Click ${data.clickId} outside attribution window`);
      }
    }
  }

  // Method 3: IP + User Agent fingerprinting (fallback for privacy-focused users)
  // This method finds the MOST RECENT click from same IP/UA within attribution window
  if (!affiliateId && data.orderIp && data.orderUserAgent) {
    const ipHash = hashIP(data.orderIp);
    const userAgentHash = hashUserAgent(data.orderUserAgent);

    // Find ALL recent clicks from same IP/UA to determine attribution window
    // We'll use the most recent click's offer window, or default to 90
    const windowStart = new Date(orderDate);
    windowStart.setDate(windowStart.getDate() - 90); // Start with default window

    const recentClicks = await prisma.click.findMany({
      where: {
        shopify_shop_id: data.shopifyShopId,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
        created_at: {
          gte: windowStart,
          lte: orderDate,
        },
      },
      include: {
        affiliate: {
          include: { offer: true },
        },
      },
      orderBy: {
        created_at: 'desc', // Most recent first
      },
    });

    // Find the most recent click that's within its offer's attribution window
    for (const click of recentClicks) {
      if (click.affiliate.status === 'active') {
        const windowDays = click.affiliate.offer?.attribution_window_days || 90;
        if (isWithinAttributionWindow(click.created_at, orderDate, windowDays)) {
          affiliateId = click.affiliate_id;
          clickId = click.id;
          clickDate = click.created_at;
          attributionType = 'fingerprint';
          attributionMethod = 'ip_useragent_fingerprint';
          break; // Use most recent valid click (last-touch)
        }
      }
    }
  }

  // Method 4: Email-based attribution (if order email matches affiliate email)
  // This is a last resort and should be logged for audit
  if (!affiliateId && data.orderEmail) {
    const emailNorm = data.orderEmail.trim().toLowerCase();
    const affiliateByEmail = await prisma.affiliate.findFirst({
      where: {
        shopify_shop_id: data.shopifyShopId,
        email: emailNorm,
        status: 'active',
      },
    });

    // Only use email attribution if we can't find any other method
    // This prevents self-referral but allows attribution if customer is also affiliate
    // Note: This is logged separately for audit purposes
    if (affiliateByEmail) {
      // Log this as a potential self-referral for review
      console.warn(`Email-based attribution for order ${data.shopifyOrderId}: affiliate ${affiliateByEmail.id} (email: ${emailNorm})`);
      // Don't automatically attribute - this needs manual review
      // Uncomment below if you want to allow email attribution:
      // affiliateId = affiliateByEmail.id;
      // attributionMethod = 'email_match';
    }
  }

  if (!affiliateId) {
    // No attribution found - log for audit
    console.warn(`No attribution found for order ${data.shopifyOrderId}`, {
      hasClickId: !!data.clickId,
      hasCoupon: !!data.couponCode,
      hasIp: !!data.orderIp,
      hasEmail: !!data.orderEmail,
    });
    return null;
  }

  // Check if order is already attributed to a different affiliate
  // If so, we need to reverse any existing commissions (no double payment)
  const existingAttribution = await prisma.orderAttribution.findUnique({
    where: {
      shopify_order_id: data.shopifyOrderId,
    },
    include: {
      commissions: {
        where: {
          status: { in: ['pending', 'eligible', 'approved'] }, // Only reverse unpaid commissions
        },
      },
    },
  });

  // If attribution changed, reverse old commissions
  if (existingAttribution && existingAttribution.affiliate_id !== affiliateId) {
    console.warn(`Order ${data.shopifyOrderNumber} re-attributed from affiliate ${existingAttribution.affiliate_id} to ${affiliateId}`);
    
    // Reverse all unpaid commissions from old affiliate
    for (const commission of existingAttribution.commissions) {
      await prisma.commission.update({
        where: { id: commission.id },
        data: {
          status: 'reversed',
        },
      });
      console.log(`Reversed commission ${commission.id} due to re-attribution`);
    }
  }

  // Snapshot URL params (UTM, sub params, etc.) from the attributed click for campaign tracking
  let landingUrlParams: Record<string, string> | null = null;
  if (clickId) {
    const click = await prisma.click.findUnique({
      where: { id: clickId },
    });
    if (click) {
      const c = click as { url_params?: unknown; url_transaction_id?: string | null; url_affiliate_id?: string | null; url_sub1?: string | null; url_sub2?: string | null; url_sub3?: string | null; url_sub4?: string | null };
      const params = (c.url_params && typeof c.url_params === 'object' && !Array.isArray(c.url_params)
        ? { ...(c.url_params as Record<string, string>) }
        : {}) as Record<string, string>;
      if (c.url_transaction_id) params.transaction_id = c.url_transaction_id;
      if (c.url_affiliate_id) params.affiliate_id = c.url_affiliate_id;
      if (c.url_sub1) params.sub1 = c.url_sub1;
      if (c.url_sub2) params.sub2 = c.url_sub2;
      if (c.url_sub3) params.sub3 = c.url_sub3;
      if (c.url_sub4) params.sub4 = c.url_sub4;
      if (Object.keys(params).length > 0) landingUrlParams = params;
    }
  }

  // Create or update order attribution with method tracking (include landing_url_params for campaign/UTM tracking)
  const createData = {
    shopify_order_id: data.shopifyOrderId,
    shopify_order_number: data.shopifyOrderNumber,
    affiliate_id: affiliateId,
    click_id: clickId,
    attribution_type: attributionType,
    shopify_shop_id: data.shopifyShopId,
    customer_email: data.orderEmail || null,
    customer_name: data.customerName || null,
    order_total: data.orderTotal ? new Decimal(data.orderTotal) : null,
    order_currency: data.orderCurrency || 'USD',
    landing_url_params: landingUrlParams,
  };
  const updateData = {
    affiliate_id: affiliateId,
    click_id: clickId,
    attribution_type: attributionType,
    customer_email: data.orderEmail || null,
    customer_name: data.customerName || null,
    order_total: data.orderTotal ? new Decimal(data.orderTotal) : null,
    order_currency: data.orderCurrency || 'USD',
    landing_url_params: landingUrlParams,
  };
  const attribution = await prisma.orderAttribution.upsert({
    where: { shopify_order_id: data.shopifyOrderId },
    create: createData as any,
    update: updateData as any,
  });

  // Log attribution method for audit trail (you may want to add this to OrderAttribution model)
  console.log(`Order ${data.shopifyOrderNumber} attributed to affiliate ${affiliateId} via method: ${attributionMethod}`);

  return attribution.id;
}
