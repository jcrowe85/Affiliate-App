/**
 * Helper functions for creating and managing Shopify app-level webhooks
 */

/**
 * Create app-level webhooks for a shop after OAuth installation
 * These webhooks use the app's Client secret for HMAC verification
 */
export async function createAppWebhooks(
  shop: string,
  accessToken: string,
  appUrl: string
): Promise<{ success: boolean; created: string[]; errors: string[] }> {
  const created: string[] = [];
  const errors: string[] = [];

  // Webhooks to create
  const webhooks = [
    {
      topic: 'orders/create',
      address: `${appUrl}/api/webhooks/orders`,
    },
    {
      topic: 'orders/updated',
      address: `${appUrl}/api/webhooks/orders`,
    },
    {
      topic: 'refunds/create',
      address: `${appUrl}/api/webhooks/refunds`,
    },
  ];

  console.log('🔗 Creating app-level webhooks...');
  console.log(`   Shop: ${shop}`);
  console.log(`   App URL: ${appUrl}`);

  for (const webhook of webhooks) {
    try {
      // Check if webhook already exists
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

      if (listResponse.ok) {
        const listData = await listResponse.json();
        const existing = listData.webhooks?.find(
          (w: any) => w.topic === webhook.topic && w.address === webhook.address
        );

        if (existing) {
          console.log(`   ⏭️  Webhook already exists: ${webhook.topic}`);
          created.push(`${webhook.topic} (already exists)`);
          continue;
        }
      }

      // Create webhook
      const response = await fetch(
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
              // Note: api_version is set in Shopify Partners dashboard, not via API
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`   ✅ Created webhook: ${webhook.topic}`);
      console.log(`      Address: ${webhook.address}`);
      created.push(webhook.topic);
    } catch (error: any) {
      console.error(`   ❌ Failed to create webhook ${webhook.topic}:`, error.message);
      errors.push(`${webhook.topic}: ${error.message}`);
    }
  }

  return {
    success: errors.length === 0,
    created,
    errors,
  };
}
