import { prisma } from './db';

/**
 * Fraud detection and flagging
 */

export type FraudFlagType =
  | 'self_referral'
  | 'excessive_clicks'
  | 'high_refund_rate'
  | 'coupon_abuse'
  | 'velocity_anomaly';

export interface FraudCheck {
  shouldFlag: boolean;
  flagType?: FraudFlagType;
  score: number;
  reason: string;
}

/**
 * Check for self-referral (email, address, IP heuristics)
 */
export async function checkSelfReferral(
  affiliateId: string,
  orderEmail: string,
  orderBillingAddress: any,
  shopifyShopId: string,
  clickIpHash?: string
): Promise<FraudCheck> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  if (!affiliate) {
    return { shouldFlag: false, score: 0, reason: '' };
  }

  let score = 0;
  const reasons: string[] = [];

  // Check email match
  if (affiliate.email.toLowerCase() === orderEmail.toLowerCase()) {
    score += 50;
    reasons.push('Email matches affiliate email');
  }

  // Check IP (if we have recent clicks from affiliate)
  if (clickIpHash) {
    const recentClicks = await prisma.click.findMany({
      where: {
        affiliate_id: affiliateId,
        ip_hash: clickIpHash,
        shopify_shop_id: shopifyShopId,
        created_at: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    });

    if (recentClicks.length > 5) {
      score += 30;
      reasons.push(`Same IP as affiliate with ${recentClicks.length} clicks`);
    }
  }

  return {
    shouldFlag: score >= 50,
    flagType: 'self_referral',
    score,
    reason: reasons.join('; '),
  };
}

/**
 * Check for excessive clicks
 */
export async function checkExcessiveClicks(
  affiliateId: string,
  shopifyShopId: string,
  timeWindowHours: number = 24
): Promise<FraudCheck> {
  const cutoff = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
  
  const clickCount = await prisma.click.count({
    where: {
      affiliate_id: affiliateId,
      shopify_shop_id: shopifyShopId,
      created_at: {
        gte: cutoff,
      },
    },
  });

  // Threshold: 100 clicks in 24 hours
  if (clickCount > 100) {
    return {
      shouldFlag: true,
      flagType: 'excessive_clicks',
      score: Math.min(100, (clickCount / 100) * 50),
      reason: `${clickCount} clicks in last ${timeWindowHours} hours`,
    };
  }

  return { shouldFlag: false, score: 0, reason: '' };
}

/**
 * Check for high refund rate
 */
export async function checkHighRefundRate(
  affiliateId: string,
  shopifyShopId: string
): Promise<FraudCheck> {
  const totalCommissions = await prisma.commission.count({
    where: {
      affiliate_id: affiliateId,
      shopify_shop_id: shopifyShopId,
      status: {
        in: ['pending', 'eligible', 'approved', 'paid'],
      },
    },
  });

  const reversedCommissions = await prisma.commission.count({
    where: {
      affiliate_id: affiliateId,
      shopify_shop_id: shopifyShopId,
      status: 'reversed',
    },
  });

  if (totalCommissions === 0) {
    return { shouldFlag: false, score: 0, reason: '' };
  }

  const refundRate = (reversedCommissions / totalCommissions) * 100;

  // Threshold: 30% refund rate
  if (refundRate > 30) {
    return {
      shouldFlag: true,
      flagType: 'high_refund_rate',
      score: Math.min(100, (refundRate / 30) * 50),
      reason: `${refundRate.toFixed(1)}% refund rate (${reversedCommissions}/${totalCommissions})`,
    };
  }

  return { shouldFlag: false, score: 0, reason: '' };
}

/**
 * Create fraud flag
 */
export async function createFraudFlag(
  commissionId: string,
  affiliateId: string,
  flagType: FraudFlagType,
  score: number,
  reason: string,
  shopifyShopId: string
): Promise<string> {
  const flag = await prisma.fraudFlag.create({
    data: {
      commission_id: commissionId,
      affiliate_id: affiliateId,
      flag_type: flagType,
      score,
      reason,
      resolved: false,
      shopify_shop_id: shopifyShopId,
    },
  });

  return flag.id;
}

/**
 * Run all fraud checks for a commission
 */
export async function runFraudChecks(
  commissionId: string,
  affiliateId: string,
  orderEmail: string,
  orderBillingAddress: any,
  shopifyShopId: string,
  clickIpHash?: string
): Promise<void> {
  // Self-referral check
  const selfReferralCheck = await checkSelfReferral(
    affiliateId,
    orderEmail,
    orderBillingAddress,
    shopifyShopId,
    clickIpHash
  );

  if (selfReferralCheck.shouldFlag) {
    await createFraudFlag(
      commissionId,
      affiliateId,
      selfReferralCheck.flagType!,
      selfReferralCheck.score,
      selfReferralCheck.reason,
      shopifyShopId
    );
  }

  // Excessive clicks check
  const clicksCheck = await checkExcessiveClicks(affiliateId, shopifyShopId);
  if (clicksCheck.shouldFlag) {
    await createFraudFlag(
      commissionId,
      affiliateId,
      clicksCheck.flagType!,
      clicksCheck.score,
      clicksCheck.reason,
      shopifyShopId
    );
  }

  // High refund rate check
  const refundCheck = await checkHighRefundRate(affiliateId, shopifyShopId);
  if (refundCheck.shouldFlag) {
    await createFraudFlag(
      commissionId,
      affiliateId,
      refundCheck.flagType!,
      refundCheck.score,
      refundCheck.reason,
      shopifyShopId
    );
  }
}