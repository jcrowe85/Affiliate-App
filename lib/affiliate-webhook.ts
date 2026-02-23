import { prisma } from './db';

/**
 * Available database fields that can be mapped to webhook parameters
 */
export const AVAILABLE_WEBHOOK_FIELDS = {
  // Commission fields
  commission_id: 'Commission ID',
  commission_amount: 'Commission Amount',
  commission_currency: 'Commission Currency',
  commission_status: 'Commission Status',
  
  // Order fields
  order_id: 'Shopify Order ID',
  order_number: 'Shopify Order Number',
  order_total: 'Order Total',
  order_currency: 'Order Currency',
  order_date: 'Order Date',
  
  // Customer fields
  customer_email: 'Customer Email',
  customer_name: 'Customer Name',
  
  // Affiliate fields
  affiliate_id: 'Affiliate ID (internal)',
  affiliate_number: 'Affiliate Number',
  affiliate_name: 'Affiliate Name',
  affiliate_email: 'Affiliate Email',
  
  // Click/Attribution fields
  click_id: 'Click ID',
  landing_url: 'Landing URL',
  
  // Offer fields
  offer_id: 'Offer ID',
  offer_name: 'Offer Name',
  
  // Postback parameters (captured from affiliate redirect URL)
  transaction_id: 'Transaction ID (from URL)',
  affiliate_id_url: 'Affiliate ID (from URL)',
  sub1: 'Sub1 (from URL)',
  sub2: 'Sub2 (from URL)',
  sub3: 'Sub3 (from URL)',
  sub4: 'Sub4 (from URL)',
  // Legacy postback parameter names (for backward compatibility)
  postback_affiliate_id: 'Postback Affiliate ID',
  postback_sub1: 'Postback Sub1',
  postback_sub2: 'Postback Sub2',
  postback_sub3: 'Postback Sub3',
  postback_sub4: 'Postback Sub4',
  // Any URL param from the click (all params from affiliate link are stored per click)
  adv4: 'Adv4 (from URL)',
  adv5: 'Adv5 (from URL)',
  nid: 'NID (from URL)',
} as const;

export type WebhookFieldKey = keyof typeof AVAILABLE_WEBHOOK_FIELDS;

/**
 * Fire affiliate webhook with parameter mapping
 */
export async function fireAffiliateWebhook(
  commissionId: string,
  affiliateId: string
): Promise<boolean> {
  // Get affiliate with webhook configuration
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  if (!affiliate || !affiliate.webhook_url) {
    return false; // No webhook configured
  }

  // Get commission with all related data
  const commission = await prisma.commission.findUnique({
    where: { id: commissionId },
    include: {
      order_attribution: {
        include: {
          click: true,
          affiliate: {
            include: {
              offer: true,
            },
          },
        },
      },
      affiliate: {
        include: {
          offer: true,
        },
      },
    },
  });

  if (!commission || !commission.order_attribution) {
    return false;
  }

  const orderAttribution = commission.order_attribution;
  const click = orderAttribution.click;
  const offer = commission.affiliate.offer;

  // Build data map from database
  const dataMap: Record<string, string> = {
    commission_id: commission.id,
    commission_amount: commission.amount.toString(),
    commission_currency: commission.currency,
    commission_status: commission.status,
    order_id: commission.shopify_order_id,
    order_number: orderAttribution.shopify_order_number,
    order_total: orderAttribution.order_total?.toString() || '0',
    order_currency: orderAttribution.order_currency || 'USD',
    order_date: commission.created_at.toISOString(),
    customer_email: orderAttribution.customer_email || '',
    customer_name: orderAttribution.customer_name || '',
    affiliate_id: commission.affiliate_id,
    affiliate_number: commission.affiliate.affiliate_number?.toString() || '',
    affiliate_name: commission.affiliate.name,
    affiliate_email: commission.affiliate.email,
    click_id: click?.id || '',
    landing_url: click?.landing_url || '',
    offer_id: offer?.id || '',
    offer_name: offer?.name || '',
    // Dynamic params (transaction_id, affiliate_id, sub1–sub4): from the converting click’s URL; fall back to affiliate-level for coupon attributions / legacy
    transaction_id: click?.url_transaction_id ?? commission.affiliate.postback_transaction_id ?? '',
    affiliate_id_url: click?.url_affiliate_id ?? commission.affiliate.postback_affiliate_id ?? '',
    postback_affiliate_id: click?.url_affiliate_id ?? commission.affiliate.postback_affiliate_id ?? '',
    sub1: click?.url_sub1 ?? commission.affiliate.postback_sub1 ?? '',
    sub2: click?.url_sub2 ?? commission.affiliate.postback_sub2 ?? '',
    sub3: click?.url_sub3 ?? commission.affiliate.postback_sub3 ?? '',
    sub4: click?.url_sub4 ?? commission.affiliate.postback_sub4 ?? '',
    postback_sub1: click?.url_sub1 ?? commission.affiliate.postback_sub1 ?? '',
    postback_sub2: click?.url_sub2 ?? commission.affiliate.postback_sub2 ?? '',
    postback_sub3: click?.url_sub3 ?? commission.affiliate.postback_sub3 ?? '',
    postback_sub4: click?.url_sub4 ?? commission.affiliate.postback_sub4 ?? '',
  };

  // Overlay all URL params from the converting click (e.g. adv4, nid) so they can be mapped in the webhook
  const clickUrlParams = click?.url_params;
  if (clickUrlParams && typeof clickUrlParams === 'object' && !Array.isArray(clickUrlParams)) {
    for (const [k, v] of Object.entries(clickUrlParams)) {
      if (v != null && String(v).trim() !== '') dataMap[k] = String(v);
    }
  }

  // Get parameter mapping from affiliate
  // Support both old format (Record<string, string>) and new format (Record<string, { type: 'fixed' | 'dynamic', value: string }>)
  const parameterMappingRaw = (affiliate.webhook_parameter_mapping as any) || {};

  // Build URL with mapped parameters
  let webhookUrl = affiliate.webhook_url;
  const urlParams = new URLSearchParams();

  // Replace placeholders in URL (e.g., {sub3}, {conversion_id})
  // First, extract all placeholders from the URL
  const placeholderRegex = /\{([^}]+)\}/g;
  const placeholders = new Set<string>();
  let match;
  while ((match = placeholderRegex.exec(webhookUrl)) !== null) {
    placeholders.add(match[1]);
  }

  // Map each placeholder to its value (either fixed or from database)
  for (const placeholder of placeholders) {
    const mapping = parameterMappingRaw[placeholder];
    let value: string | undefined;

    if (!mapping) {
      continue; // No mapping for this placeholder
    }

    // Handle new format: { type: 'fixed' | 'dynamic', value: string }
    if (typeof mapping === 'object' && mapping && 'type' in mapping && 'value' in mapping) {
      const typedMapping = mapping as { type: 'fixed' | 'dynamic'; value: string };
      if (typedMapping.type === 'fixed') {
        value = typedMapping.value;
      } else if (typedMapping.type === 'dynamic' && dataMap[typedMapping.value] !== undefined) {
        value = dataMap[typedMapping.value];
      }
    } 
    // Handle legacy format: string (database field name)
    else if (typeof mapping === 'string' && dataMap[mapping] !== undefined) {
      value = dataMap[mapping];
    }

    if (value !== undefined) {
      // Replace placeholder in URL
      webhookUrl = webhookUrl.replace(`{${placeholder}}`, encodeURIComponent(value));
    }
  }

  // Also handle query parameters (if mapping specifies them)
  for (const [placeholder, mapping] of Object.entries(parameterMappingRaw)) {
    // Skip if already replaced in URL
    if (webhookUrl.includes(`{${placeholder}}`)) {
      continue;
    }

    let value: string | undefined;

    // Handle new format
    if (typeof mapping === 'object' && mapping && 'type' in mapping && 'value' in mapping) {
      const typedMapping = mapping as { type: 'fixed' | 'dynamic'; value: string };
      if (typedMapping.type === 'fixed') {
        value = typedMapping.value;
      } else if (typedMapping.type === 'dynamic' && dataMap[typedMapping.value] !== undefined) {
        value = dataMap[typedMapping.value];
      }
    }
    // Handle legacy format
    else if (typeof mapping === 'string' && dataMap[mapping] !== undefined) {
      value = dataMap[mapping];
    }

    if (value !== undefined) {
      urlParams.append(placeholder, value);
    }
  }

  // Add query parameters if any
  if (urlParams.toString()) {
    webhookUrl += (webhookUrl.includes('?') ? '&' : '?') + urlParams.toString();
  }

  // Safeguard: never send postbacks to our own store (avoids misconfigured webhook_url)
  try {
    const parsed = new URL(webhookUrl);
    if (parsed.hostname === 'tryfleur.com' || parsed.hostname === 'www.tryfleur.com') {
      console.error('[AffiliateWebhook] Skipping webhook: URL points to store domain (tryfleur.com). Affiliate id:', affiliateId, '| Stored webhook_url:', affiliate.webhook_url);
      const now = new Date();
      await prisma.affiliateWebhookLog.create({
        data: {
          commission_id: commissionId,
          affiliate_id: affiliateId,
          webhook_url: webhookUrl,
          request_method: 'GET',
          request_params: {},
          status: 'failed',
          response_code: null,
          response_body: null,
          error_message: 'Skipped: webhook URL is tryfleur.com (store domain). Update affiliate webhook URL in admin to the partner postback URL.',
          shopify_shop_id: commission.shopify_shop_id,
          created_at: now,
          updated_at: now,
        },
      });
      return false;
    }
  } catch {
    // URL parse failed; continue and let the fetch fail
  }

  // Send webhook
  let success = false;
  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;

  // Extract request parameters from the final webhook URL for logging
  const requestParams: Record<string, string> = {};
  try {
    const urlObj = new URL(webhookUrl);
    urlObj.searchParams.forEach((value, key) => {
      requestParams[key] = value;
    });
  } catch (e) {
    // URL parsing failed, skip parameter extraction
  }

  // Create webhook log entry before attempting
  const now = new Date();
  const webhookLog = await prisma.affiliateWebhookLog.create({
    data: {
      commission_id: commissionId,
      affiliate_id: affiliateId,
      webhook_url: webhookUrl,
      request_method: 'GET',
      request_params: requestParams, // Store the actual parameter values sent
      status: 'pending',
      shopify_shop_id: commission.shopify_shop_id,
      created_at: now,
      updated_at: now,
    },
  });

  try {
    const response = await fetch(webhookUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Fleur-Affiliates/1.0',
      },
      // Timeout after 10 seconds
      signal: AbortSignal.timeout(10000),
    });

    responseCode = response.status;
    success = response.ok;
    
    // Try to read response body (limit to 1000 chars)
    try {
      responseBody = await response.text();
      if (responseBody.length > 1000) {
        responseBody = responseBody.substring(0, 1000) + '... (truncated)';
      }
    } catch (e) {
      responseBody = null;
    }

    if (!success) {
      errorMessage = `HTTP ${response.status}: ${responseBody?.substring(0, 200) || 'No response body'}`;
    }
  } catch (error: any) {
    errorMessage = error.message || 'Unknown error';
    if (error.name === 'AbortError') {
      errorMessage = 'Request timeout (10s)';
    }
  }

  // Update webhook log with results
  await prisma.affiliateWebhookLog.update({
    where: { id: webhookLog.id },
    data: {
      status: success ? 'success' : 'failed',
      response_code: responseCode,
      response_body: responseBody,
      error_message: errorMessage,
      last_attempt_at: new Date(),
      updated_at: new Date(),
    },
  });

  // Also log to console for debugging
  console.log(`[Webhook] Affiliate ${affiliateId}, Commission ${commissionId}:`, {
    url: webhookUrl,
    success,
    responseCode,
    error: errorMessage,
  });

  return success;
}
