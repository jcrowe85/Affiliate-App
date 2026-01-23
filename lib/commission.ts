import { prisma } from './db';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Calculate commission for an order based on rules
 */

export interface CommissionCalculation {
  amount: Decimal;
  rule: any;
  appliesTo: 'one_time' | 'subscription_initial' | 'subscription_rebill';
}

/**
 * Find applicable commission rule for an order
 */
export async function findApplicableRule(
  shopifyShopId: string,
  appliesTo: 'one_time' | 'subscription_initial' | 'subscription_rebill',
  sellingPlanId?: string | null
): Promise<any | null> {
  const rules = await prisma.commissionRule.findMany({
    where: {
      shopify_shop_id: shopifyShopId,
      active: true,
      applies_to: appliesTo,
    },
    orderBy: {
      created_at: 'desc', // Most recent first
    },
  });

  // Filter by selling plan if provided
  if (sellingPlanId && rules.length > 0) {
    const planSpecificRules = rules.filter((rule) => {
      if (!rule.selling_plan_ids) return false;
      const planIds = JSON.parse(rule.selling_plan_ids as string);
      return planIds.includes(sellingPlanId);
    });
    if (planSpecificRules.length > 0) {
      return planSpecificRules[0];
    }
  }

  // Return first applicable rule (or null if none)
  return rules[0] || null;
}

/**
 * Calculate commission amount based on rule and order subtotal
 */
export function calculateCommission(
  rule: any,
  orderSubtotal: number
): Decimal {
  if (rule.rule_type === 'flat') {
    return new Decimal(rule.value);
  } else if (rule.rule_type === 'percentage') {
    const percentage = parseFloat(rule.value.toString());
    const amount = (orderSubtotal * percentage) / 100;
    return new Decimal(amount.toFixed(2));
  }
  return new Decimal(0);
}

/**
 * Create commission for an order
 */
export async function createCommission(
  affiliateId: string,
  orderAttributionId: string,
  shopifyOrderId: string,
  orderSubtotal: number,
  currency: string,
  rule: any,
  shopifyShopId: string
): Promise<string> {
  const amount = calculateCommission(rule, orderSubtotal);
  
  // Calculate eligible date (Net-30 default, but can be customized per affiliate)
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  const payoutTermsDays = affiliate?.payout_terms_days || 30;
  const eligibleDate = new Date();
  eligibleDate.setDate(eligibleDate.getDate() + payoutTermsDays);

  const commission = await prisma.commission.create({
    data: {
      affiliate_id: affiliateId,
      order_attribution_id: orderAttributionId,
      shopify_order_id: shopifyOrderId,
      amount,
      currency,
      status: 'pending',
      eligible_date: eligibleDate,
      rule_snapshot: rule as any,
      shopify_shop_id: shopifyShopId,
    },
  });

  return commission.id;
}

/**
 * Check if subscription should receive commission (max payments/months check)
 */
export async function shouldCommissionSubscription(
  subscriptionAttributionId: string,
  rule: any
): Promise<boolean> {
  const subscription = await prisma.subscriptionAttribution.findUnique({
    where: { id: subscriptionAttributionId },
  });

  if (!subscription || !subscription.active) {
    return false;
  }

  // Check max payments
  // If max_payments = 6, we want exactly 6 rebill payments to get commission
  // payments_made starts at 0, so we check if it's greater than (not >=) max_payments
  // This means payments_made 0-6 all get commission when max_payments = 6
  if (rule.max_payments && subscription.payments_made > rule.max_payments) {
    return false;
  }

  // Check max months (approximate)
  if (rule.max_months) {
    const monthsElapsed = Math.floor(
      (Date.now() - subscription.created_at.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    if (monthsElapsed >= rule.max_months) {
      return false;
    }
  }

  return true;
}

/**
 * Reverse a commission (for refunds)
 */
export async function reverseCommission(
  commissionId: string,
  reason: string
): Promise<void> {
  const commission = await prisma.commission.findUnique({
    where: { id: commissionId },
  });

  if (!commission) {
    throw new Error('Commission not found');
  }

  // If already paid, we can't reverse but should flag for clawback
  if (commission.status === 'paid') {
    // Log clawback requirement (would need separate clawback model)
    console.warn(`Commission ${commissionId} already paid, requires clawback: ${reason}`);
  }

  await prisma.commission.update({
    where: { id: commissionId },
    data: {
      status: 'reversed',
    },
  });
}