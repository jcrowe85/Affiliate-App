# Store-Level vs App-Level Webhooks

## The Problem

You're using **store-level webhooks** (Settings → Notifications → Webhooks) instead of **app-level webhooks** (configured in Shopify Partners → Your App → Webhooks).

**This is why HMAC verification is failing!**

## The Difference

### Store-Level Webhooks (What You're Using)

**Location:** Shopify Admin → Settings → Notifications → Webhooks

**Characteristics:**
- ❌ **Not tied to any specific app**
- ❌ **Don't use your app's Client secret** for HMAC
- ❌ **`app_id` is `null`** in the webhook body
- ❌ **May use a different secret** or no secret at all
- ✅ Can be created by any admin user
- ✅ Work independently of apps

**HMAC Verification:**
- May use a **store-level secret** (different from app secret)
- Or may use **no secret** at all
- **This is why your HMAC doesn't match!**

### App-Level Webhooks (What You Should Use)

**Location:** Shopify Partners → Your App → Webhooks

**Characteristics:**
- ✅ **Tied to your specific app**
- ✅ **Use your app's Client secret** for HMAC
- ✅ **`app_id` matches your app** in the webhook body
- ✅ **Proper HMAC verification** with your secret
- ✅ Automatically created when app is installed
- ✅ Managed through your app configuration

**HMAC Verification:**
- Uses **your app's Client secret** (`SHOPIFY_API_SECRET`)
- HMAC will match correctly
- This is what we're expecting!

## Why This Matters

When you use **store-level webhooks**:
1. Shopify doesn't know which app the webhook is for
2. It doesn't use your app's Client secret
3. HMAC verification fails because we're using the wrong secret
4. `app_id` is `null` because it's not from an app

When you use **app-level webhooks**:
1. Shopify knows it's from your app
2. It uses your app's Client secret
3. HMAC verification works correctly
4. `app_id` matches your app

## Solutions

### Solution 1: Use App-Level Webhooks (Recommended)

**Configure webhooks in your app:**

1. Go to **Shopify Partners** → Your App
2. Click **App setup** or **Webhooks**
3. Add webhooks there:
   - Event: `Order creation`
   - Format: `JSON`
   - API version: `2026-01` (or latest)
   - URL: `https://your-cloudflare-url.trycloudflare.com/api/webhooks/orders`

4. **When your app is installed**, these webhooks are automatically created
5. They'll use your app's Client secret for HMAC verification

**Benefits:**
- ✅ HMAC verification works correctly
- ✅ `app_id` matches your app
- ✅ Automatically managed with app installation
- ✅ Proper app-level security

### Solution 2: Create Webhooks Programmatically During App Installation

You can create webhooks when your app is installed using the Shopify Admin API:

```typescript
// In your OAuth callback or app installation handler
const webhook = await shopify.rest.Webhook.create({
  session: session,
  topic: 'orders/create',
  address: 'https://your-app-url.com/api/webhooks/orders',
  format: 'json',
  api_version: '2026-01',
});
```

This creates **app-level webhooks** that use your app's secret.

### Solution 3: Find Store-Level Webhook Secret (Not Recommended)

Store-level webhooks might use a different secret, but:
- ❌ It's not documented
- ❌ It's not tied to your app
- ❌ It's harder to manage
- ❌ Not recommended for app development

## How to Check Which Type You're Using

### Store-Level Webhook:
- Created in: Shopify Admin → Settings → Notifications → Webhooks
- `app_id` in body: `null`
- HMAC: Doesn't match your app's secret

### App-Level Webhook:
- Created in: Shopify Partners → Your App → Webhooks
- OR: Created programmatically via Admin API
- `app_id` in body: `<your-app-id>` (e.g., `4877949`)
- HMAC: Matches your app's secret

## Migration Steps

### Step 1: Remove Store-Level Webhooks

1. Go to **Shopify Admin** → **Settings** → **Notifications** → **Webhooks**
2. Delete the webhooks you created there

### Step 2: Add App-Level Webhooks

**Option A: Via Shopify Partners**
1. Go to **Shopify Partners** → Your App → **Webhooks**
2. Add webhooks there
3. Reinstall your app to activate them

**Option B: Programmatically (Recommended)**
1. Add webhook creation to your app installation/OAuth flow
2. Webhooks are created automatically when app is installed
3. They use your app's secret

### Step 3: Test

1. Place a test order
2. Check webhook delivery
3. Verify `app_id` matches your app
4. HMAC should now verify correctly!

## Code Example: Create Webhook on App Installation

```typescript
// In your OAuth callback or app installation handler
import { shopifyApi } from '@shopify/shopify-api';

async function createAppWebhooks(session: Session) {
  const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY!,
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    scopes: ['read_orders', 'write_orders'],
    hostName: process.env.SHOPIFY_APP_URL!,
  });

  const client = new shopify.clients.Rest({ session });

  // Create order webhook
  await client.post({
    path: 'webhooks',
    data: {
      webhook: {
        topic: 'orders/create',
        address: `${process.env.SHOPIFY_APP_URL}/api/webhooks/orders`,
        format: 'json',
        api_version: '2026-01',
      },
    },
  });

  // Create order update webhook
  await client.post({
    path: 'webhooks',
    data: {
      webhook: {
        topic: 'orders/updated',
        address: `${process.env.SHOPIFY_APP_URL}/api/webhooks/orders`,
        format: 'json',
        api_version: '2026-01',
      },
    },
  });
}
```

## Summary

- ❌ **Store-level webhooks** = Not tied to app, wrong secret, HMAC fails
- ✅ **App-level webhooks** = Tied to app, correct secret, HMAC works

**The solution:** Use app-level webhooks instead of store-level webhooks!

This explains why:
- `app_id` is `null`
- HMAC doesn't match
- Verification fails

Switch to app-level webhooks and everything should work! 🎉
