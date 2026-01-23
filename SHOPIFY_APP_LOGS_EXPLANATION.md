# Shopify App Logs Explanation

## Why Our Curl Script Doesn't Show in Shopify Logs

The curl script we created (`test-webhook-curl.sh`) **does NOT** show up in Shopify app logs because:

1. **It's a direct test** - The script sends a request directly to your webhook endpoint
2. **It bypasses Shopify** - The request never goes through Shopify's webhook system
3. **It's for local testing** - It's designed to test your webhook handler logic, not Shopify's webhook delivery

## What Shows Up in Shopify App Logs

Shopify app logs only show:
- ✅ **Real webhooks** that Shopify sends to your app
- ✅ **Webhook delivery attempts** (successful and failed)
- ✅ **Webhook retries** (if delivery fails)
- ✅ **API calls** made by your app to Shopify

## What Does NOT Show Up

- ❌ Direct HTTP requests to your webhook endpoint (like our curl script)
- ❌ Localhost requests
- ❌ Requests that don't go through Shopify's webhook system

## How to See Real Webhooks in Shopify Logs

### Step 1: Place a Real Order

1. Go to your Shopify store
2. Add a product to cart
3. Complete checkout with a test order
4. This triggers Shopify to send a real webhook

### Step 2: Check Shopify App Logs

1. Go to **Shopify Partners Dashboard**
2. Click on your app
3. Go to **Monitoring** or **Logs** tab
4. Look for webhook delivery events

You should see entries like:
- `orders/create` webhook sent
- `orders/updated` webhook sent
- Delivery status (success/failure)
- Response codes (200, 401, 500, etc.)

## Testing Webhooks Properly

### Option 1: Test with Real Orders (Recommended)

1. Place a test order on your store
2. Check Shopify app logs for webhook delivery
3. Check your server logs for webhook processing
4. Verify the order appears in your affiliate system

### Option 2: Use Shopify Webhook Testing Tool

Shopify provides a webhook testing tool in the Partners dashboard:
1. Go to your app → **Webhooks** section
2. Click on a webhook
3. Use "Send test webhook" button
4. This will show up in app logs

### Option 3: Use Our Curl Script (Local Testing Only)

Our curl script is useful for:
- ✅ Testing HMAC verification logic
- ✅ Testing webhook handler locally
- ✅ Debugging webhook processing
- ❌ **NOT** for testing Shopify's webhook delivery

## Understanding the Flow

### Real Shopify Webhook Flow:
```
Shopify Store → Order Created
     ↓
Shopify Webhook System → Signs with HMAC
     ↓
Sends to your webhook URL (ngrok/localhost)
     ↓
Your webhook handler → Verifies HMAC → Processes
     ↓
Shopify App Logs (shows delivery status)
```

### Our Curl Script Flow:
```
Curl Script → Generates HMAC → Sends directly
     ↓
Your webhook handler → Verifies HMAC → Processes
     ↓
(Does NOT go through Shopify, so no logs)
```

## Why This Matters

- **Shopify app logs** = Shows if Shopify successfully delivered webhooks
- **Our curl script** = Tests if your handler correctly processes webhooks
- **Both are useful** but serve different purposes

## Next Steps

1. **Place a real test order** to see webhooks in Shopify logs
2. **Check both**:
   - Shopify app logs (webhook delivery)
   - Your server logs (webhook processing)
3. **Compare** the webhook data in both places

## Troubleshooting

If you don't see webhooks in Shopify logs:
- ✅ Check webhook is configured in Shopify (Settings → Notifications → Webhooks)
- ✅ Verify webhook URL is correct
- ✅ Check webhook is enabled
- ✅ Place a real order (not just use curl script)

If webhooks show in Shopify logs but fail:
- ✅ Check your server logs for HMAC verification
- ✅ Verify ngrok is running and accessible
- ✅ Check webhook URL is reachable from internet
