import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { fireAffiliateWebhook } from '@/lib/affiliate-webhook';

export const dynamic = 'force-dynamic';

/**
 * Get webhook logs for a commission
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { commissionId: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const logs = await prisma.affiliateWebhookLog.findMany({
      where: {
        commission_id: params.commissionId,
        shopify_shop_id: admin.shopify_shop_id,
      },
      include: {
        affiliate: {
          select: {
            id: true,
            name: true,
            affiliate_number: true,
            email: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Error fetching webhook logs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch webhook logs' },
      { status: 500 }
    );
  }
}

/**
 * Manually trigger webhook for testing
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { commissionId: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get commission and verify it belongs to this shop
    const commission = await prisma.commission.findFirst({
      where: {
        id: params.commissionId,
        shopify_shop_id: admin.shopify_shop_id,
      },
      include: {
        affiliate: true,
      },
    });

    if (!commission) {
      return NextResponse.json(
        { error: 'Commission not found' },
        { status: 404 }
      );
    }

    if (!commission.affiliate.webhook_url) {
      return NextResponse.json(
        { error: 'Affiliate does not have a webhook URL configured' },
        { status: 400 }
      );
    }

    // Fire the webhook
    const success = await fireAffiliateWebhook(
      commission.id,
      commission.affiliate_id
    );

    // Get the latest log entry
    const latestLog = await prisma.affiliateWebhookLog.findFirst({
      where: {
        commission_id: params.commissionId,
        shopify_shop_id: admin.shopify_shop_id,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json({
      success,
      message: success
        ? 'Webhook fired successfully'
        : 'Webhook failed - check logs for details',
      log: latestLog,
    });
  } catch (error: any) {
    console.error('Error firing webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fire webhook' },
      { status: 500 }
    );
  }
}
