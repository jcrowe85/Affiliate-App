# Webhook HMAC 401 Error Troubleshooting

## The Problem

You're seeing `401 Unauthorized` errors from `/api/webhooks/orders` in ngrok. This means HMAC verification is failing.

## Root Causes

### 1. Missing or Incorrect `SHOPIFY_API_SECRET`

**Check:**
```bash
# In your .env file
SHOPIFY_API_SECRET=your_actual_secret_here
```

**Where to find it:**
1. Go to Shopify Partners → Your App
2. Go to **API credentials**
3. Copy the **Client secret** (this is your `SHOPIFY_API_SECRET`)

**Important:** This is the **same secret** used for:
- OAuth authentication
- Webhook HMAC verification

### 2. Request Body Modified Before Verification

**Common causes:**
- ngrok modifying the request
- Next.js middleware parsing the body
- Body being read multiple times

**Solution:** The webhook handler reads the body as raw text first, which should prevent this. But check:
- No middleware is parsing the body before it reaches the webhook handler
- ngrok isn't transforming the request

### 3. Wrong Secret Type

**Important:** For webhooks, you use the **same** `SHOPIFY_API_SECRET` as OAuth. There's no separate "webhook secret" in Shopify.

## How to Debug

### Step 1: Check Environment Variable

```bash
# In your terminal (where you run the app)
echo $SHOPIFY_API_SECRET
```

Or check your `.env` file:
```env
SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 2: Check Server Logs

With the enhanced logging I added, you should see:

**If secret is missing:**
```
❌ HMAC Verification Failed: SHOPIFY_API_SECRET or SHOPIFY_WEBHOOK_SECRET not set
```

**If HMAC verification fails:**
```
❌ HMAC Verification Failed
   HMAC Header: abc123...
   Body Length: 1234
   Body Preview: {"id":123456...
   Secret Set: true
   Shop: your-shop.myshopify.com
```

### Step 3: Verify Secret in Shopify

1. Go to **Shopify Partners** → **Apps** → Your App
2. Click **API credentials**
3. Copy the **Client secret**
4. Compare with your `.env` file

**Important:** Make sure there are no extra spaces or newlines in the secret.

### Step 4: Test Webhook Manually

You can test the webhook endpoint manually using Shopify's webhook testing tool or by creating a test order.

## Common Solutions

### Solution 1: Restart Your Server

After updating `.env`, restart your development server:
```bash
# Stop the server (Ctrl+C)
# Start again
npm run dev
```

### Solution 2: Check ngrok Configuration

If using ngrok, make sure:
- The webhook URL in Shopify matches your ngrok URL exactly
- No ngrok transformations are enabled
- The request is being forwarded as-is

### Solution 3: Verify Body Reading

The webhook handler reads the body as raw text:
```typescript
const body = await request.text();
```

This ensures the body isn't modified before HMAC verification.

### Solution 4: Check for Middleware Interference

Check your `middleware.ts` - make sure it's not:
- Parsing the request body
- Modifying headers
- Intercepting webhook requests

## Testing

### Test 1: Check Secret is Set

Look for this in your server logs when webhook is called:
```
✅ HMAC Verification Passed
```

If you see:
```
❌ HMAC Verification Failed: SHOPIFY_API_SECRET or SHOPIFY_WEBHOOK_SECRET not set
```

Then the secret is missing from your environment.

### Test 2: Verify Secret Matches

1. Get your secret from Shopify Partners
2. Compare character-by-character with your `.env` file
3. Make sure there are no hidden characters

### Test 3: Check ngrok Logs

In ngrok, you should see the full request. Check:
- Headers include `x-shopify-hmac-sha256`
- Body is intact (not modified)

## Next Steps

1. **Check your `.env` file** - Ensure `SHOPIFY_API_SECRET` is set correctly
2. **Restart your server** - Environment variables are loaded at startup
3. **Check server logs** - Look for the detailed error messages I added
4. **Verify in Shopify** - Confirm the secret matches what's in Partners

## Still Not Working?

If you've checked everything above and still getting 401:

1. **Share the error logs** - The enhanced logging will show exactly what's wrong
2. **Check ngrok request/response** - See if the body is being modified
3. **Try without ngrok** - Test locally to see if ngrok is the issue
4. **Verify webhook URL** - Make sure it's exactly: `https://your-ngrok-url.ngrok.io/api/webhooks/orders`
