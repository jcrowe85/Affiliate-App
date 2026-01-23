# Localhost Testing Guide

## ⚠️ Important: Shopify Can't Reach Localhost

Shopify webhooks **cannot** reach `localhost:3000` directly because it's not publicly accessible. You need a tunneling service.

## Solution: Use ngrok (Recommended)

### Step 1: Install ngrok
```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### Step 2: Start Your Local Server
```bash
npm run dev
# Server runs on http://localhost:3000
```

### Step 3: Start ngrok Tunnel
```bash
ngrok http 3000
```

You'll get output like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

### Step 4: Use ngrok URL in Shopify Webhooks

In Shopify Admin → Settings → Notifications → Webhooks:

**URL:** `https://abc123.ngrok-free.app/api/webhooks/orders`

**Important Notes:**
- ngrok free tier gives you a **random URL each time** (changes when you restart)
- You'll need to **update webhook URLs** in Shopify each time you restart ngrok
- For production, use your actual deployed domain (not ngrok)

## Alternative: Cloudflare Tunnel (Free, Persistent URL)

Cloudflare Tunnel gives you a persistent URL (doesn't change):

```bash
# Install
npm install -g cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:3000
```

## Webhook API Version

**Recommended:** Use **"2026-01 latest"** (or **"2025-10"** for more stability)

**Do NOT use:**
- ❌ "unstable" (not recommended for production)
- ❌ "2026-04 release candidate" (may have breaking changes)

**Why:**
- The code uses `LATEST_API_VERSION` which adapts to any recent version
- Webhook payload structure is stable across recent versions
- "2026-01 latest" is the most current stable version
- "2025-10" is older but more battle-tested

## Testing Checklist

1. ✅ Start local server: `npm run dev`
2. ✅ Start ngrok: `ngrok http 3000`
3. ✅ Copy ngrok HTTPS URL (e.g., `https://abc123.ngrok-free.app`)
4. ✅ Create webhook in Shopify:
   - URL: `https://abc123.ngrok-free.app/api/webhooks/orders`
   - Format: JSON
   - API Version: **2026-01 latest** (or 2025-10)
   - Event: `orders/create` or `orders/paid`
5. ✅ Test by creating a test order in Shopify
6. ✅ Check your local server logs for webhook receipt

## Troubleshooting

### Webhook Not Received
- Check ngrok is running: Visit `http://localhost:4040` (ngrok dashboard)
- Check webhook URL in Shopify matches ngrok URL exactly
- Verify `SHOPIFY_API_SECRET` is set correctly (for HMAC verification)
- Check webhook delivery logs in Shopify Admin → Settings → Notifications → Webhooks

### HMAC Verification Fails
- Ensure `SHOPIFY_API_SECRET` in `.env` matches your Shopify app's API secret
- Check webhook is using correct format (JSON, not XML)

### ngrok URL Changes
- Free ngrok gives random URLs each restart
- Update webhook URLs in Shopify when ngrok restarts
- Or use Cloudflare Tunnel for persistent URL

## Production Deployment

Once ready for production:
1. Deploy to Vercel/Fly.io/etc.
2. Update webhook URLs in Shopify to your production domain
3. Remove ngrok (no longer needed)
