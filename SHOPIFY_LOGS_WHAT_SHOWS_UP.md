# What Shows Up in Shopify App Logs

## Understanding Shopify App Logs

Shopify app logs in the Partners dashboard show **specific types of events**, not all API activity.

## What DOES Show in Shopify Logs

### 1. Webhook Deliveries (Outgoing from Shopify)
- ✅ When Shopify **sends** webhooks to your app
- ✅ Webhook delivery attempts (success/failure)
- ✅ Webhook retries
- ✅ Response codes from your webhook endpoint

**Example:**
```
orders/create webhook → https://your-app.com/api/webhooks/orders
Status: 200 OK
```

### 2. OAuth/Installation Events
- ✅ App installation attempts
- ✅ OAuth authorization flows
- ✅ Token exchanges
- ✅ App uninstallations

### 3. API Rate Limits
- ✅ When your app hits rate limits
- ✅ API quota usage
- ✅ Throttling events

### 4. App Lifecycle Events
- ✅ App enabled/disabled
- ✅ App updates
- ✅ Version changes

## What DOES NOT Show in Shopify Logs

### ❌ Direct API Calls FROM Your App TO Shopify

When your app makes API calls to Shopify (like our test script), these **do NOT** show in app logs because:

1. **They're outgoing requests** - Your app is calling Shopify, not the other way around
2. **They're authenticated requests** - Shopify processes them but doesn't log them in app logs
3. **App logs focus on webhooks** - They track what Shopify sends to you, not what you request from Shopify

**Examples that DON'T show:**
- `GET /admin/api/2024-01/shop.json` (our test script)
- `GET /admin/api/2024-01/products.json`
- `POST /admin/api/2024-01/orders.json`
- Any API call your app makes to Shopify

## Why Our Test Script Doesn't Show

Our `test-shopify-api-credentials.js` script:
1. Makes a **direct API call** to Shopify (`GET /admin/api/2024-01/shop.json`)
2. This is an **outgoing request** from your app to Shopify
3. Shopify processes it and returns data, but **doesn't log it** in app logs
4. It's authenticated and works, but it's not a "webhook delivery" event

## How to Verify Credentials Are Working

### Method 1: Our Test Script (What We Just Did)
```bash
npm run test:shopify-api
```

**What it confirms:**
- ✅ Credentials format is correct
- ✅ HMAC generation works
- ✅ Access token is valid
- ✅ API calls succeed

**What it doesn't show:**
- ❌ In Shopify app logs (because it's an outgoing API call)

### Method 2: Check OAuth Events (Shows in Logs)
1. Go to Shopify Partners → Your App → **Logs** or **Monitoring**
2. Look for **OAuth/Installation** events
3. These show when the app was installed and OAuth completed

### Method 3: Check Webhook Deliveries (Shows in Logs)
1. Place a real order on your store
2. Go to Shopify Partners → Your App → **Logs**
3. Look for **webhook delivery** events
4. You'll see:
   - `orders/create` webhook sent
   - Delivery status (200, 401, 500, etc.)
   - Retry attempts (if failed)

## The Difference

### Outgoing API Calls (Your App → Shopify)
- **What:** Your app requests data from Shopify
- **Example:** `GET /admin/api/2024-01/shop.json`
- **Shows in logs:** ❌ No (these are authenticated requests, not logged)
- **How to verify:** Our test script confirms they work

### Incoming Webhooks (Shopify → Your App)
- **What:** Shopify sends events to your app
- **Example:** `POST /api/webhooks/orders` (Shopify calls your endpoint)
- **Shows in logs:** ✅ Yes (webhook delivery events)
- **How to verify:** Check Shopify app logs after placing an order

## Summary

| Event Type | Shows in Logs? | Why |
|------------|----------------|-----|
| Webhook deliveries | ✅ Yes | Shopify tracks what it sends to you |
| OAuth/Installation | ✅ Yes | App lifecycle events |
| API calls (your app → Shopify) | ❌ No | Outgoing requests aren't logged |
| Rate limits | ✅ Yes | Important for monitoring |
| Our test script | ❌ No | It's an outgoing API call |

## How to See Activity in Logs

To see activity in Shopify app logs:

1. **Place a real order** → Triggers webhook → Shows in logs
2. **Install/uninstall app** → Shows OAuth events → Shows in logs
3. **Hit rate limits** → Shows throttling → Shows in logs

**Our test script** verifies credentials work, but it's an outgoing API call, so it doesn't appear in logs.

## Verification

Your credentials ARE working (we confirmed with the test script). The fact that:
- ✅ API call succeeded
- ✅ Shop data was retrieved
- ✅ Access token is valid

...proves your credentials are correct. The absence from logs is expected behavior, not an error.
