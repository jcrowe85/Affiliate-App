# HMAC Bypass for Testing (Development Only)

## ⚠️ WARNING

**This is for DEVELOPMENT/TESTING ONLY. Never enable this in production!**

## The Problem

You're getting HMAC verification failures because ngrok is modifying the request body. This is a common issue with ngrok's free tier.

## Quick Fix for Testing

If you need to test webhooks immediately while troubleshooting ngrok, you can temporarily bypass HMAC verification:

### Step 1: Add to `.env`

```bash
# ⚠️ DEVELOPMENT ONLY - Never use in production!
BYPASS_WEBHOOK_HMAC=true
```

### Step 2: Restart Your Server

```bash
npm run dev
```

### Step 3: Test Webhook

Now webhooks should work, but you'll see a warning in your logs:
```
⚠️  WARNING: HMAC verification is BYPASSED (development only)
```

## Better Solutions (Recommended)

### Option 1: Use Cloudflare Tunnel (Free, No Body Modification)

```bash
# Install cloudflared (if not installed)
# macOS: brew install cloudflare/cloudflare/cloudflared
# Linux: Download from https://github.com/cloudflare/cloudflared/releases

# Run tunnel
cloudflared tunnel --url http://localhost:3000
```

This gives you a URL like `https://random-subdomain.trycloudflare.com` that doesn't modify the body.

### Option 2: Disable ngrok Request Inspection

1. Open ngrok dashboard: http://localhost:4040
2. Look for "Request Inspection" settings
3. Disable it if possible
4. Or upgrade to ngrok paid plan

### Option 3: Use localtunnel (Free Alternative)

```bash
# Install
npm install -g localtunnel

# Run
lt --port 3000
```

## When to Use Bypass

✅ **Use bypass when:**
- Testing locally with ngrok
- Debugging webhook processing logic
- Development environment only

❌ **Never use bypass when:**
- Production environment
- Staging environment
- Any environment exposed to the internet

## Security Note

HMAC verification ensures that:
1. The webhook actually came from Shopify
2. The body wasn't modified in transit
3. No one can spoof webhooks

Bypassing it removes these security guarantees, so only use it for local testing.

## How to Disable Bypass

Simply remove or set to false in `.env`:
```bash
BYPASS_WEBHOOK_HMAC=false
# Or remove the line entirely
```

Then restart your server.

## Summary

1. **For immediate testing**: Add `BYPASS_WEBHOOK_HMAC=true` to `.env` (dev only!)
2. **For production**: Use Cloudflare Tunnel or fix ngrok configuration
3. **Never enable bypass in production** - it's a security risk

The bypass is automatically disabled if `NODE_ENV` is not `development`, so it's safe to leave in your `.env` file as long as you don't set `NODE_ENV=production` locally.
