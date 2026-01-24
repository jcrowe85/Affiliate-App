import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

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
        // Find all existing webhooks with this topic
        const existingForTopic = existingWebhooks.filter(
          (w: any) => w.topic === webhook.topic
        );

        // Find the one that matches the new URL (if any)
        const matchingWebhook = existingForTopic.find(
          (w: any) => w.address === webhook.address
        );

        // Delete all old webhooks with this topic that don't match the new URL
        for (const oldWebhook of existingForTopic) {
          if (oldWebhook.address !== webhook.address) {
            try {
              const deleteResponse = await fetch(
                `https://${shop}/admin/api/2026-01/webhooks/${oldWebhook.id}.json`,
                {
                  method: 'DELETE',
                  headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                  },
                }
              );

              if (deleteResponse.ok) {
                console.log(`🗑️  Deleted old webhook: ${webhook.topic} (${oldWebhook.address})`);
                updated.push(`${webhook.topic} (deleted old: ${oldWebhook.address})`);
              } else {
                const errorText = await deleteResponse.text();
                console.warn(`⚠️  Failed to delete old webhook ${oldWebhook.id}: ${errorText}`);
              }
            } catch (deleteError: any) {
              console.warn(`⚠️  Error deleting old webhook ${oldWebhook.id}:`, deleteError.message);
            }
          }
        }

        if (matchingWebhook) {
          // Webhook with correct URL already exists, no action needed
          console.log(`✅ Webhook already correct: ${webhook.topic}`);
          updated.push(`${webhook.topic} (already correct)`);
        } else if (existingForTopic.length > 0) {
          // Update the first existing webhook to the new URL
          const webhookToUpdate = existingForTopic[0];
          const updateResponse = await fetch(
            `https://${shop}/admin/api/2026-01/webhooks/${webhookToUpdate.id}.json`,
            {
              method: 'PUT',
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                webhook: {
                  id: webhookToUpdate.id,
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
          // Create new webhook if none exist
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
