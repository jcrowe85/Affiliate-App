import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook } from '@/lib/utils';
import { prisma } from '@/lib/db';
import { reverseCommission } from '@/lib/commission';

// Mark route as dynamic to prevent static analysis during build
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Handle Shopify refund webhooks
 * Reverses commissions for refunded orders
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const hmac = request.headers.get('x-shopify-hmac-sha256');
    const shop = request.headers.get('x-shopify-shop-domain');

    if (!hmac || !shop) {
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // Verify HMAC
    const isValid = verifyShopifyWebhook(
      body,
      hmac,
      process.env.SHOPIFY_API_SECRET!
    );

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid HMAC' },
        { status: 401 }
      );
    }

    const refund = JSON.parse(body);
    const shopifyShopId = shop.replace('.myshopify.com', '');
    const orderId = refund.order_id?.toString();

    if (!orderId) {
      return NextResponse.json({ received: true });
    }

    // Find all commissions for this order
    const commissions = await prisma.commission.findMany({
      where: {
        shopify_order_id: orderId,
        shopify_shop_id: shopifyShopId,
        status: {
          in: ['pending', 'eligible', 'approved'], // Only reverse non-paid commissions
        },
      },
    });

    // Reverse each commission
    for (const commission of commissions) {
      await reverseCommission(
        commission.id,
        `Refund processed for order ${orderId}`
      );
    }

    // If commissions were already paid, they need to be flagged for clawback
    // This would require a separate clawback model or flag

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Refund webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}