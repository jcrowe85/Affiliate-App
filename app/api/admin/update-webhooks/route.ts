import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Update webhook URLs for the current shop
 * POST /api/admin/update-webhooks
 * Body: { webhookUrl: "https://new-url.trycloudflare.com" }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const webhookUrl = body.webhookUrl || process.env.CLOUDFLARE_TUNNEL_URL;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'webhookUrl required in body or CLOUDFLARE_TUNNEL_URL in env' },
        { status: 400 }
      );
    }

    // Ensure URL is HTTPS
    const finalUrl = webhookUrl.startsWith('https://') 
      ? webhookUrl 
      : `https://${webhookUrl}`;

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

    const shop = admin.shopify_shop_id + '.myshopify.com';
    const accessToken = session.access_token;

    // Webhooks to update
    const webhooks = [
      { topic: 'orders/create', address: `${finalUrl}/api/webhooks/orders` },
      { topic: 'orders/updated', address: `${finalUrl}/api/webhooks/orders` },
      { topic: 'refunds/create', address: `${finalUrl}/api/webhooks/refunds` },
    ];

    const updated: string[] = [];
    const errors: string[] = [];

    // First, list all existing webhooks
    const listResponse = await fetch(
      `https://${shop}/admin/api/2026-01/webhooks.json`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!listResponse.ok) {
      return NextResponse.json(
        { error: `Failed to list webhooks: ${listResponse.status}` },
        { status: listResponse.status }
      );
    }

    const listData = await listResponse.json();
    const existingWebhooks = listData.webhooks || [];

    // Update or create each webhook
    for (const webhook of webhooks) {
      try {
        // Find existing webhook by topic
        const existing = existingWebhooks.find(
          (w: any) => w.topic === webhook.topic
        );

        if (existing) {
          // Update existing webhook
          const updateResponse = await fetch(
            `https://${shop}/admin/api/2026-01/webhooks/${existing.id}.json`,
            {
              method: 'PUT',
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                webhook: {
                  id: existing.id,
                  address: webhook.address,
                  format: 'json',
                },
              }),
            }
          );

          if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            throw new Error(`HTTP ${updateResponse.status}: ${errorText}`);
          }

          console.log(`✅ Updated webhook: ${webhook.topic}`);
          updated.push(`${webhook.topic} (updated)`);
        } else {
          // Create new webhook if it doesn't exist
          const createResponse = await fetch(
            `https://${shop}/admin/api/2026-01/webhooks.json`,
            {
              method: 'POST',
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                webhook: {
                  topic: webhook.topic,
                  address: webhook.address,
                  format: 'json',
                },
              }),
            }
          );

          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`HTTP ${createResponse.status}: ${errorText}`);
          }

          console.log(`✅ Created webhook: ${webhook.topic}`);
          updated.push(`${webhook.topic} (created)`);
        }
      } catch (error: any) {
        console.error(`❌ Failed to update webhook ${webhook.topic}:`, error.message);
        errors.push(`${webhook.topic}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      webhookUrl: finalUrl,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error updating webhooks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update webhooks' },
      { status: 500 }
    );
  }
}
