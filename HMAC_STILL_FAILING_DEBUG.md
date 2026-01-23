# HMAC Still Failing - Debugging Guide

## The Problem

Even with Cloudflare Tunnel (which doesn't modify bodies), HMAC verification is still failing. This suggests the issue is **not** body modification by the proxy, but something else.

## Possible Causes

### 1. Wrong Secret (MOST LIKELY)

The `SHOPIFY_API_SECRET` in your `.env` file might not match what Shopify is using.

**How to verify:**
1. Go to **Shopify Partners** → Your App → **App setup**
2. Look for **"Client secret"** (this is your `SHOPIFY_API_SECRET`)
3. Copy it exactly (no spaces, no quotes)
4. Compare with your `.env` file

**Common issues:**
- Extra spaces before/after the secret
- Quotes around the secret (remove them)
- Wrong secret (using API key instead of secret)
- Old secret (regenerated but not updated)

### 2. Next.js Middleware Modifying Body

Check if `middleware.ts` is modifying requests. If it reads the body, it can't be read again in the webhook handler.

**Solution:** Make sure middleware doesn't read the body for webhook routes.

### 3. Body Encoding Issue

The body might be getting re-encoded somewhere.

**Check:**
- Is the body exactly as Shopify sent it?
- Are there any special characters that might be encoded differently?

### 4. Secret Environment Variable Not Loading

The secret might not be loading correctly.

**Check:**
```bash
# In your server logs, you should see:
# Secret Set: true
# Secret Length: 38 (or similar)
```

If `Secret Length: 0`, the secret isn't loading.

## Debugging Steps

### Step 1: Verify Secret

Run the test script:
```bash
node scripts/test-webhook-hmac.js
```

This will show:
- If the secret is set
- If HMAC calculation works
- Secret preview (first/last few chars)

### Step 2: Check Shopify Partners

1. Go to **Shopify Partners** → Your App
2. Click **App setup**
3. Find **"Client secret"**
4. Copy it exactly
5. Update your `.env` file:
   ```bash
   SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxx
   ```
   (No quotes, no spaces)

### Step 3: Check Webhook Delivery in Shopify

1. Go to **Shopify Admin** → **Settings** → **Notifications** → **Webhooks**
2. Click on your webhook
3. Look at **"Recent deliveries"**
4. Click on a failed delivery
5. Check the **"Request body"** and **"Response"**
6. Look for the HMAC header in the request

### Step 4: Compare Secrets

In your server logs, you'll see:
```
Secret preview: shpss_...xxxxx
```

Compare this with what's in Shopify Partners. They should match exactly.

### Step 5: Test with Bypass (Temporary)

To confirm the webhook processing works (ignoring HMAC):

1. Add to `.env`:
   ```bash
   BYPASS_WEBHOOK_HMAC=true
   ```

2. Restart server

3. Test webhook - if it works, the issue is definitely HMAC/secret

4. **Remove bypass** after testing!

## Most Likely Solution

**The secret in your `.env` file doesn't match Shopify's secret.**

### How to Fix:

1. **Get the correct secret:**
   - Shopify Partners → Your App → App setup
   - Copy "Client secret" (starts with `shpss_`)

2. **Update `.env`:**
   ```bash
   SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxx
   ```
   - No quotes
   - No spaces
   - Exact match

3. **Restart server:**
   ```bash
   npm run dev
   ```

4. **Test webhook again**

## Quick Test

Run this to verify your secret:
```bash
node scripts/test-webhook-hmac.js
```

If it shows the secret is set and HMAC calculation works, but webhooks still fail, the secret in `.env` is wrong.

## Summary

Since Cloudflare Tunnel doesn't modify bodies, the issue is almost certainly:
1. ❌ Wrong secret in `.env`
2. ❌ Secret not loading correctly
3. ❌ Middleware modifying body (less likely)

**Most likely:** Wrong secret. Check Shopify Partners and update `.env`.
