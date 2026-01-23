# ngrok Body Modification Fix

## The Problem

Your credentials match perfectly, but HMAC verification is still failing. This means **ngrok is likely modifying the request body** before it reaches your server.

## Why This Happens

ngrok (especially free tier) may:
- Compress/decompress the body
- Modify encoding
- Add/remove whitespace
- Transform the JSON structure

When the body is modified, the HMAC calculated by Shopify no longer matches what we calculate.

## Solutions

### Solution 1: Use ngrok with Request Inspection Disabled

ngrok free tier shows an inspection page that can modify requests. Try:

1. **Check ngrok dashboard:** http://localhost:4040
2. **Look for "Request Inspection"** - this might be modifying requests
3. **Upgrade to ngrok paid plan** - removes inspection and provides static domains

### Solution 2: Use ngrok with Compression Disabled

Start ngrok with compression disabled:

```bash
ngrok http 3000 --request-header-add "Accept-Encoding: identity"
```

Or configure ngrok to not modify requests.

### Solution 3: Use a Different Tunneling Service

Alternatives to ngrok:
- **Cloudflare Tunnel** (free, no body modification)
- **localtunnel** (free, simpler)
- **serveo** (SSH-based, free)

### Solution 4: Test Without ngrok First

Verify the webhook works locally, then troubleshoot ngrok separately:

```bash
# Test locally (works - we confirmed this)
npm run test:webhook http://localhost:3000/api/webhooks/orders

# Then test with ngrok
npm run test:webhook https://your-ngrok-url.ngrok.io/api/webhooks/orders
```

### Solution 5: Check ngrok Request Logs

1. Open ngrok dashboard: http://localhost:4040
2. Go to "Requests" tab
3. Click on a failed webhook request
4. Compare the "Request Body" with what your server received
5. Look for differences (compression, encoding, etc.)

## Verification Steps

1. ✅ **Credentials match** - Confirmed
2. ⚠️ **Body modification** - Likely the issue
3. 🔍 **Check ngrok logs** - Compare request body
4. 🔧 **Try different tunnel** - Test with Cloudflare Tunnel or localtunnel

## Quick Test

Try using Cloudflare Tunnel instead of ngrok:

```bash
# Install cloudflared (if not installed)
# Then run:
cloudflared tunnel --url http://localhost:3000
```

This will give you a URL like `https://random-subdomain.trycloudflare.com` that shouldn't modify the body.

## Next Steps

1. Check ngrok dashboard for request modifications
2. Try disabling ngrok request inspection
3. Test with a different tunneling service
4. Compare the request body in ngrok vs what your server receives

The credentials are correct, so the issue is definitely body modification by ngrok or the proxy layer.
