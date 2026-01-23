# Capture Shopify Webhook HMAC for Debugging

## The Problem

You want to see exactly what HMAC Shopify is sending vs what we're calculating to identify if:
- The secret is wrong
- The body is being modified
- Multiple apps are involved
- There's an encoding issue

## Solution 1: Enhanced Logging (Already Added)

I've added detailed logging to the webhook handler. Every webhook will now log:

1. **Exact HMAC from Shopify** (full value)
2. **Exact body from Shopify** (first/last 200 chars + full length)
3. **Our calculated HMAC** (using our secret)
4. **Comparison** (match or mismatch)
5. **Secret info** (length, preview)

### How to Use

1. Send a test webhook from Shopify
2. Check your server console/logs
3. Look for the section:
   ```
   ═══════════════════════════════════════════════════════════
   📥 SHOPIFY WEBHOOK DATA CAPTURE
   ═══════════════════════════════════════════════════════════
   ```

4. Compare:
   - `HMAC from Shopify` vs `Our Calculated HMAC`
   - If they match → Secret is correct, but something else is wrong
   - If they don't match → Secret is wrong or body was modified

## Solution 2: Debug Capture Endpoint

I've created a dedicated debug endpoint that captures everything.

### Step 1: Point Webhook to Debug Endpoint

1. Go to **Shopify Admin** → **Settings** → **Notifications** → **Webhooks**
2. Edit your webhook
3. Temporarily change the URL to:
   ```
   https://your-cloudflare-url.trycloudflare.com/api/debug/webhook-capture
   ```
4. Save

### Step 2: Send Test Webhook

1. Click **"Send test webhook"** in Shopify
2. Check your server logs
3. You'll see a detailed JSON capture of everything

### Step 3: Compare Data

The capture includes:
- Exact HMAC from Shopify
- Our calculated HMAC
- Full body (for analysis)
- All headers
- Secret info

### Step 4: Restore Original URL

After capturing, change the webhook URL back to:
```
https://your-cloudflare-url.trycloudflare.com/api/webhooks/orders
```

## What to Look For

### If HMACs Match But Verification Fails

This shouldn't happen, but if it does:
- Check for encoding issues
- Verify body wasn't modified between calculation and verification

### If HMACs Don't Match

**Most likely causes:**
1. **Wrong secret** - Secret in `.env` doesn't match Shopify
2. **Body modified** - Body was changed between Shopify and your server
3. **Multiple apps** - Different app's secret is being used

### If Body Looks Different

- Check if body was modified by middleware
- Check if body encoding changed
- Compare body length (should match exactly)

## Checking for Multiple Apps

If you suspect multiple apps:

1. **Check Shopify Partners:**
   - List all your apps
   - Note each app's Client secret
   - Compare with your `.env` file

2. **Check Webhook Configuration:**
   - In Shopify Admin → Webhooks
   - Look at which app created the webhook
   - Make sure you're using that app's secret

3. **Check App ID in Webhook:**
   - The webhook body includes `app_id`
   - This tells you which app sent the webhook
   - Make sure your secret matches that app

## Example Output

When you send a webhook, you'll see:

```
═══════════════════════════════════════════════════════════
📥 SHOPIFY WEBHOOK DATA CAPTURE
═══════════════════════════════════════════════════════════
🔑 HMAC from Shopify (x-shopify-hmac-sha256):
   Full HMAC: naqLKsYr2waeZVn+nVPkEOsIjyraOR...
   HMAC Length: 44

📦 Body from Shopify:
   Body Type: string
   Body Length: 10779
   Body (first 200 chars): {"id":820982911946154508,"admin_graphql_api_id":"gid://shopify/Order/820982911946154508","app_id":4877949,...

🧮 Our Calculated HMAC:
   Full HMAC: B6TG4TG6GscF/62MCdWA4hRnW5/eMy...
   HMAC Length: 44

🔍 Comparison:
   Shopify HMAC: naqLKsYr2waeZVn+nVPkEOsIjyraOR...
   Our HMAC:     B6TG4TG6GscF/62MCdWA4hRnW5/eMy...
   Match: ❌ NO
═══════════════════════════════════════════════════════════
```

## Next Steps

1. **Send a test webhook** and check the logs
2. **Compare the HMACs** - do they match?
3. **If they don't match:**
   - Check Shopify Partners for the correct secret
   - Update `.env` with the exact secret
   - Restart server
   - Test again

4. **If they do match but verification still fails:**
   - Check for encoding issues
   - Verify body wasn't modified
   - Check middleware isn't interfering

## Summary

You now have two ways to capture what Shopify is sending:

1. **Enhanced logging** - Every webhook logs full details
2. **Debug endpoint** - Dedicated endpoint for detailed capture

Use these to compare what Shopify sends vs what we calculate, and identify the exact issue!
