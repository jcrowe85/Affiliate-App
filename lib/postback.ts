import { prisma } from './db';

/**
 * Postback/webhook handling for external partners
 */

export interface PostbackParams {
  click_id?: string;
  order_id?: string;
  commission_amount?: string;
  currency?: string;
  status?: string;
  [key: string]: string | undefined;
}

/**
 * Send postback to external partner
 */
export async function sendPostback(
  commissionId: string,
  templateId: string,
  params: PostbackParams,
  shopifyShopId: string
): Promise<boolean> {
  const template = await prisma.postbackTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template || !template.active) {
    return false;
  }

  // Parse param mappings
  const mappings = template.param_mappings as Record<string, string>;
  
  // Build URL with parameters
  let url = template.base_url;
  const urlParams = new URLSearchParams();

  for (const [key, value] of Object.entries(mappings)) {
    const paramValue = params[key];
    if (paramValue) {
      urlParams.append(value, paramValue);
    }
  }

  if (urlParams.toString()) {
    url += (url.includes('?') ? '&' : '?') + urlParams.toString();
  }

  // Send postback
  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Fleur-Affiliates/1.0',
      },
    });

    responseCode = response.status;
    responseBody = await response.text().catch(() => '');
    success = response.ok;
  } catch (error: any) {
    console.error('Postback error:', error);
    responseBody = error.message;
  }

  // Log postback attempt
  await prisma.postbackLog.create({
    data: {
      commission_id: commissionId,
      postback_template_id: templateId,
      status: success ? 'success' : 'failed',
      response_code: responseCode,
      response_body: responseBody?.substring(0, 1000) || null,
      attempts: 1,
      last_attempt_at: new Date(),
      shopify_shop_id: shopifyShopId,
    },
  });

  return success;
}

/**
 * Fire postbacks for a commission based on trigger event
 */
export async function firePostbacks(
  commissionId: string,
  triggerEvent: 'conversion' | 'approval' | 'payment',
  shopifyShopId: string
): Promise<void> {
  // Get templates for this event
  const templates = await prisma.postbackTemplate.findMany({
    where: {
      shopify_shop_id: shopifyShopId,
      active: true,
      trigger_event: triggerEvent,
    },
  });

  if (templates.length === 0) {
    return;
  }

  // Get commission details
  const commission = await prisma.commission.findUnique({
    where: { id: commissionId },
    include: {
      order_attribution: {
        include: {
          click: true,
        },
      },
    },
  });

  if (!commission) {
    return;
  }

  // Build postback parameters
  const params: PostbackParams = {
    click_id: commission.order_attribution.click_id || undefined,
    order_id: commission.shopify_order_id,
    commission_amount: commission.amount.toString(),
    currency: commission.currency,
    status: commission.status,
  };

  // Send postbacks
  for (const template of templates) {
    await sendPostback(commissionId, template.id, params, shopifyShopId);
  }
}

/**
 * Retry failed postbacks (with exponential backoff)
 */
export async function retryFailedPostbacks(
  maxAttempts: number = 5,
  shopifyShopId: string
): Promise<void> {
  const failedLogs = await prisma.postbackLog.findMany({
    where: {
      shopify_shop_id: shopifyShopId,
      status: 'failed',
      attempts: {
        lt: maxAttempts,
      },
      last_attempt_at: {
        // Only retry after 1 hour
        lte: new Date(Date.now() - 60 * 60 * 1000),
      },
    },
    include: {
      commission: {
        include: {
          order_attribution: {
            include: {
              click: true,
            },
          },
        },
      },
      template: true,
    },
    take: 100, // Limit batch size
  });

  for (const log of failedLogs) {
    const params: PostbackParams = {
      click_id: log.commission.order_attribution.click_id || undefined,
      order_id: log.commission.shopify_order_id,
      commission_amount: log.commission.amount.toString(),
      currency: log.commission.currency,
      status: log.commission.status,
    };

    const success = await sendPostback(
      log.commission_id,
      log.postback_template_id,
      params,
      shopifyShopId
    );

    if (success) {
      // Update existing log
      await prisma.postbackLog.update({
        where: { id: log.id },
        data: {
          status: 'success',
          attempts: {
            increment: 1,
          },
          last_attempt_at: new Date(),
        },
      });
    } else {
      // Increment attempts
      await prisma.postbackLog.update({
        where: { id: log.id },
        data: {
          attempts: {
            increment: 1,
          },
          last_attempt_at: new Date(),
        },
      });
    }
  }
}