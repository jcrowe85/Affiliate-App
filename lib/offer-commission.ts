import { prisma } from './db';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Calculate commission based on Offer model (replaces CommissionRule)
 */

/**
 * Get affiliate's offer and calculate commission based on order type
 */
export async function getAffiliateOffer(affiliateId: string): Promise<any | null> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: {
      offer: true,
    },
  });

  return affiliate?.offer || null;
}

/**
 * Calculate commission amount based on Offer and order type
 */
export function calculateOfferCommission(
  offer: any,
  orderSubtotal: number,
  isInitialPayment: boolean,
  currency: string = 'USD'
): Decimal {
  if (!offer) {
    return new Decimal(0);
  }

  // For initial payments, use the main commission settings
  if (isInitialPayment) {
    if (offer.commission_type === 'flat_rate') {
      return new Decimal(offer.amount.toString());
    } else if (offer.commission_type === 'percentage') {
      const percentage = parseFloat(offer.amount.toString());
      const amount = (orderSubtotal * percentage) / 100;
      return new Decimal(amount.toFixed(2));
    }
  } else {
    // For rebill payments, use rebill commission settings (if configured)
    if (offer.selling_subscriptions === 'credit_first_only' && 
        offer.subscription_rebill_commission_type &&
        offer.subscription_rebill_commission_value) {
      
      if (offer.subscription_rebill_commission_type === 'flat_rate') {
        return new Decimal(offer.subscription_rebill_commission_value.toString());
      } else if (offer.subscription_rebill_commission_type === 'percentage') {
        const percentage = parseFloat(offer.subscription_rebill_commission_value.toString());
        const amount = (orderSubtotal * percentage) / 100;
        return new Decimal(amount.toFixed(2));
      }
    } else if (offer.selling_subscriptions === 'credit_all') {
      // Use main commission settings for all rebills
      if (offer.commission_type === 'flat_rate') {
        return new Decimal(offer.amount.toString());
      } else if (offer.commission_type === 'percentage') {
        const percentage = parseFloat(offer.amount.toString());
        const amount = (orderSubtotal * percentage) / 100;
        return new Decimal(amount.toFixed(2));
      }
    }
    // credit_none: return 0 (no commission on rebills)
  }

  return new Decimal(0);
}

/**
 * Check if subscription rebill should receive commission based on Offer settings
 */
export async function shouldCommissionRebill(
  subscriptionAttributionId: string,
  offer: any
): Promise<boolean> {
  if (!offer) {
    return false;
  }

  // If offer doesn't credit rebills, return false
  if (offer.selling_subscriptions === 'no' || offer.selling_subscriptions === 'credit_none') {
    return false;
  }

  // If offer credits all rebills, always return true
  if (offer.selling_subscriptions === 'credit_all') {
    return true;
  }

  // For credit_first_only, check max_payments
  if (offer.selling_subscriptions === 'credit_first_only') {
    if (!offer.subscription_max_payments) {
      return true; // No limit set
    }

    const subscription = await prisma.subscriptionAttribution.findUnique({
      where: { id: subscriptionAttributionId },
    });

    if (!subscription || !subscription.active) {
      return false;
    }

    // Check if payments_made exceeds max_payments
    // If max_payments = 6, we want payments_made 0-6 to get commission (7 payments total)
    if (subscription.payments_made > offer.subscription_max_payments) {
      return false;
    }

    return true;
  }

  return false;
}

/**
 * Create commission using Offer-based calculation
 */
export async function createOfferCommission(
  affiliateId: string,
  orderAttributionId: string,
  shopifyOrderId: string,
  orderSubtotal: number,
  currency: string,
  offer: any,
  isInitialPayment: boolean,
  shopifyShopId: string
): Promise<string> {
  const amount = calculateOfferCommission(offer, orderSubtotal, isInitialPayment, currency);
  
  // Calculate eligible date (Net-30 default, but can be customized per affiliate)
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  const payoutTermsDays = affiliate?.payout_terms_days || 30;
  const eligibleDate = new Date();
  eligibleDate.setDate(eligibleDate.getDate() + payoutTermsDays);

  // Store offer snapshot for historical reference
  const offerSnapshot = {
    offer_id: offer.id,
    offer_name: offer.name,
    commission_type: offer.commission_type,
    amount: offer.amount.toString(),
    currency: offer.currency,
    selling_subscriptions: offer.selling_subscriptions,
    subscription_max_payments: offer.subscription_max_payments,
    subscription_rebill_commission_type: offer.subscription_rebill_commission_type,
    subscription_rebill_commission_value: offer.subscription_rebill_commission_value?.toString(),
    is_initial_payment: isInitialPayment,
  };

  const commission = await prisma.commission.create({
    data: {
      affiliate_id: affiliateId,
      order_attribution_id: orderAttributionId,
      shopify_order_id: shopifyOrderId,
      amount,
      currency,
      status: 'pending',
      eligible_date: eligibleDate,
      rule_snapshot: offerSnapshot as any, // Store offer snapshot instead of rule
      shopify_shop_id: shopifyShopId,
    },
  });

  return commission.id;
}
