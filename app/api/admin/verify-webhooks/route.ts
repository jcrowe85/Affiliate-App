import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Verify webhooks exist for the current shop
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get access token from session
    const session = await prisma.shopifySession.findFirst({
      where: { shop: admin.shopify_shop_id + '.myshopify.com' },
      orderBy: { created_at: 'desc' },
    });

    if (!session || !session.access_token) {
      return NextResponse.json(
        { error: 'No access token found. Please reinstall the app.' },
        { status: 400 }
      );
    }

    // List webhooks
    const shop = admin.shopify_shop_id + '.myshopify.com';
    const response = await fetch(
      `https://${shop}/admin/api/2026-01/webhooks.json`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': session.access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch webhooks: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const webhooks = data.webhooks || [];

    // Filter to show only our app's webhooks
    const ourWebhooks = webhooks.filter((w: any) =>
      w.address?.includes('trycloudflare.com') || w.address?.includes('api/webhooks')
    );

    return NextResponse.json({
      success: true,
      total: webhooks.length,
      ourWebhooks: ourWebhooks.length,
      webhooks: ourWebhooks.map((w: any) => ({
        id: w.id,
        topic: w.topic,
        address: w.address,
        format: w.format,
        created_at: w.created_at,
        updated_at: w.updated_at,
      })),
      allWebhooks: webhooks.map((w: any) => ({
        id: w.id,
        topic: w.topic,
        address: w.address,
      })),
    });
  } catch (error: any) {
    console.error('Error verifying webhooks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify webhooks' },
      { status: 500 }
    );
  }
}
