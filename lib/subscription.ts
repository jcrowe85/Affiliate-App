import { prisma } from './db';

/**
 * Handle subscription attribution and rebill tracking
 */

export interface SubscriptionData {
  originalOrderId: string;
  affiliateId: string;
  sellingPlanId: string;
  intervalMonths: number;
  maxPayments?: number | null;
  shopifyShopId: string;
}

/**
 * Create or update subscription attribution
 */
export async function createSubscriptionAttribution(
  data: SubscriptionData
): Promise<string> {
  // Check if subscription already exists
  const existing = await prisma.subscriptionAttribution.findFirst({
    where: {
      original_order_id: data.originalOrderId,
      selling_plan_id: data.sellingPlanId,
    },
  });

  if (existing) {
    return existing.id;
  }

  const subscription = await prisma.subscriptionAttribution.create({
    data: {
      original_order_id: data.originalOrderId,
      affiliate_id: data.affiliateId,
      selling_plan_id: data.sellingPlanId,
      interval_months: data.intervalMonths,
      max_payments: data.maxPayments,
      active: true,
      shopify_shop_id: data.shopifyShopId,
      payments_made: 0,
    },
  });

  return subscription.id;
}

/**
 * Get subscription attribution for a renewal order
 */
export async function getSubscriptionAttribution(
  originalOrderId: string,
  sellingPlanId: string
): Promise<any | null> {
  return prisma.subscriptionAttribution.findFirst({
    where: {
      original_order_id: originalOrderId,
      selling_plan_id: sellingPlanId,
    },
    include: {
      affiliate: true,
    },
  });
}

/**
 * Increment payment count for subscription
 */
export async function incrementSubscriptionPayments(
  subscriptionAttributionId: string
): Promise<void> {
  await prisma.subscriptionAttribution.update({
    where: { id: subscriptionAttributionId },
    data: {
      payments_made: {
        increment: 1,
      },
    },
  });
}

/**
 * Calculate interval months from Appstle selling plan
 */
export function parseIntervalMonths(interval: string): number {
  // Parse "1 month", "3 months", "6 months", etc.
  const match = interval.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1; // Default to 1 month
}