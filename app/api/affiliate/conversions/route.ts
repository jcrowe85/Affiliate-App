import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAffiliate } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Get affiliate conversions (commissions)
 * SECURITY: Only returns data for the logged-in affiliate
 */
export async function GET(request: NextRequest) {
  try {
    const affiliate = await getCurrentAffiliate();
    if (!affiliate) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: Always filter by affiliate_id
    const commissions = await prisma.commission.findMany({
      where: {
        affiliate_id: affiliate.id,
      },
      include: {
        order_attribution: {
          include: {
            click: {
              select: { url_params: true },
            },
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 100,
    });

    const formatted = commissions.map(c => {
      const oa = c.order_attribution;
      const landingParams = (oa?.landing_url_params as Record<string, string> | null) ?? null;
      const clickParams = (oa?.click as { url_params?: unknown } | null)?.url_params;
      const urlParams = landingParams && Object.keys(landingParams).length > 0
        ? landingParams
        : (clickParams && typeof clickParams === 'object' && !Array.isArray(clickParams)
            ? (clickParams as Record<string, string>)
            : null);
      return {
        id: c.id,
        order_number: oa?.shopify_order_number || oa?.shopify_order_id || 'N/A',
        amount: c.amount.toString(),
        currency: c.currency,
        status: c.status,
        eligible_date: c.eligible_date.toISOString(),
        created_at: c.created_at.toISOString(),
        ...(urlParams && Object.keys(urlParams).length > 0 && { landing_url_params: urlParams }),
      };
    });

    return NextResponse.json({ conversions: formatted });
  } catch (error: any) {
    console.error('Affiliate conversions error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch conversions' },
      { status: 500 }
    );
  }
}
