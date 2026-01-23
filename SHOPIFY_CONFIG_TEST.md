# Shopify Configuration Test

## Quick Test

Run the configuration test to verify your Shopify API credentials:

```bash
npm run test:shopify-config
```

This will:
- ✅ Check if `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` are set
- ✅ Test HMAC verification function
- ✅ Verify webhook signature validation works

## Test Webhook Endpoint

Test your webhook endpoint with a properly signed request:

```bash
# Test against localhost (default)
npm run test:webhook

# Or test against a specific URL (e.g., ngrok)
npm run test:webhook https://your-ngrok-url.ngrok.io/api/webhooks/orders
```

This simulates what Shopify sends to your webhook endpoint and will show:
- ✅ If HMAC verification passes (200/201 status)
- ❌ If HMAC verification fails (401 status)
- ⚠️ If there are other issues (400, 500, etc.)

## Manual Testing

### Test 1: Configuration Check

```bash
node scripts/test-shopify-config.js
```

**Expected Output:**
```
✅ SHOPIFY_API_KEY: Set
✅ SHOPIFY_API_SECRET: Set
✅ Valid HMAC test: PASSED
✅ Invalid HMAC test: PASSED (correctly rejected)
✅ Wrong secret test: PASSED (correctly rejected)
```

### Test 2: Webhook Endpoint

```bash
bash scripts/test-webhook-curl.sh http://localhost:3000/api/webhooks/orders
```

**Expected Output (Success):**
```
✅ SUCCESS: Webhook accepted!
HTTP Status Code: 200
```

**Expected Output (HMAC Failure):**
```
❌ UNAUTHORIZED: HMAC verification failed
   This means the SHOPIFY_API_SECRET doesn't match
```

## Troubleshooting

### If `SHOPIFY_API_SECRET` is not set:

1. Check your `.env` or `.env.local` file
2. Make sure it's in the format: `SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxx`
3. Restart your development server after updating

### If HMAC verification fails:

1. Verify the secret in Shopify Partners → Your App → API credentials
2. Compare character-by-character with your `.env` file
3. Make sure there are no extra spaces or newlines
4. Check that you're using the **Client secret**, not the API key

### If webhook test fails:

1. Make sure your server is running (`npm run dev`)
2. Check the webhook URL is correct
3. Verify the endpoint exists: `/api/webhooks/orders`
4. Check server logs for detailed error messages

## What Gets Tested

### Configuration Test (`test-shopify-config.js`)
- Environment variable presence
- HMAC generation
- HMAC verification with valid signatures
- HMAC rejection with invalid signatures
- HMAC rejection with wrong secrets

### Webhook Test (`test-webhook-curl.sh`)
- Full webhook request simulation
- Proper HMAC signature generation
- All required headers (HMAC, Topic, Shop Domain)
- Response status code validation
- Error message interpretation

## Next Steps

After running these tests:

1. ✅ If all tests pass → Your configuration is correct
2. ❌ If HMAC fails → Check your `SHOPIFY_API_SECRET`
3. ❌ If webhook returns 401 → Verify secret matches Shopify
4. ✅ If webhook returns 200 → Ready to receive real webhooks!
