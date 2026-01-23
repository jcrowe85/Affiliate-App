# Shopify App Configuration - Step by Step

## Redirect URI Configuration

When you get the error: **"Oauth error invalid_request: The redirect_uri is not whitelisted"**, it means the redirect URI you're sending doesn't match what's configured in Shopify Partners.

## How to Fix

### 1. Go to Shopify Partners Dashboard

1. Visit [https://partners.shopify.com/](https://partners.shopify.com/)
2. Log in to your Partner account
3. Click **Apps** in the sidebar
4. Select your app

### 2. Navigate to App Setup

1. Click **App setup** in the left sidebar
2. Scroll down to **App URL** section

### 3. Configure URLs

**App URL:**
```
http://localhost:3000/app
```
(Or `https://affiliate.ourstore.com/app` for production)

**Allowed redirection URL(s):**

For local development, add EXACTLY this:
```
http://localhost:3000/api/auth/shopify
```

For production, add:
```
https://affiliate.ourstore.com/api/auth/shopify
```

### 4. Important Notes

✅ **Must be exact match** - The redirect URI in the OAuth request must EXACTLY match what's in Shopify
✅ **No trailing slash** - Don't add `/` at the end
✅ **Case sensitive** - `http` vs `https` matters
✅ **Include port** - `localhost:3000` must include the port

### 5. Multiple URLs

You can add multiple redirect URLs if you need:
- Development: `http://localhost:3000/api/auth/shopify`
- Production: `https://affiliate.ourstore.com/api/auth/shopify`

Just add each one on a new line or click "Add URL" if the interface supports it.

### 6. Save Changes

After adding the redirect URL(s), make sure to:
1. Click **Save** or **Update** button
2. Wait a few seconds for changes to propagate
3. Try the OAuth flow again

## Common Issues

### Issue: Still getting "redirect_uri is not whitelisted"

**Solutions:**
1. Double-check the URL is EXACTLY the same (no extra spaces, correct port, correct protocol)
2. Make sure you clicked **Save** in Shopify Partners
3. Wait 30 seconds and try again (Shopify caches these settings)
4. Check your `.env` file - if `SHOPIFY_APP_URL` is set, make sure it matches
5. Clear your browser cache and try again

### Issue: "App URL" vs "Redirect URL" confusion

- **App URL**: Where your app is hosted (`/app` path)
- **Redirect URL**: Where Shopify sends the OAuth callback (`/api/auth/shopify` path)

Both are required and both must be configured.

## Quick Checklist

- [ ] Added redirect URL to Shopify Partners: `http://localhost:3000/api/auth/shopify`
- [ ] Set App URL: `http://localhost:3000/app`
- [ ] Clicked Save in Shopify Partners
- [ ] Verified `.env` has correct `SHOPIFY_APP_URL` (or let it auto-detect)
- [ ] Restarted your dev server
- [ ] Tried OAuth flow again

## Still Having Issues?

Check your server logs when you trigger the OAuth flow. You should see:
```
📡 Using app URL: http://localhost:3000
```

If it shows a different URL, that's what you need to add to Shopify Partners.