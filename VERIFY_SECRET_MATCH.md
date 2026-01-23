# Verify Your Secret Matches Shopify

## The Problem

Your secret is loading correctly (38 characters, starts with `shpss_`), but HMAC verification is still failing. This means **the secret in your `.env` file doesn't match what Shopify is using**.

## How to Fix

### Step 1: Get the Correct Secret from Shopify

1. Go to **Shopify Partners Dashboard**: https://partners.shopify.com/
2. Log in to your Partner account
3. Click **Apps** in the sidebar
4. Select your app
5. Click **App setup** in the left sidebar
6. Scroll down to find **"Client secret"**
7. **Copy it exactly** (it should start with `shpss_`)

### Step 2: Compare with Your .env File

1. Open your `.env` file
2. Find the line: `SHOPIFY_API_SECRET=...`
3. Compare it character-by-character with what you copied from Shopify Partners

**Common issues:**
- ❌ Extra spaces: `SHOPIFY_API_SECRET= shpss_...` (space after `=`)
- ❌ Quotes: `SHOPIFY_API_SECRET="shpss_..."` (remove quotes)
- ❌ Wrong secret: Using API key instead of secret
- ❌ Old secret: Secret was regenerated but `.env` wasn't updated

### Step 3: Update Your .env File

Make sure it looks exactly like this (no quotes, no spaces):

```bash
SHOPIFY_API_SECRET=shpss_d56f...77355
```

**Important:**
- No quotes around the value
- No spaces before or after the `=`
- Exact match with Shopify Partners

### Step 4: Restart Your Server

```bash
# Stop your server (Ctrl+C)
# Then restart
npm run dev
```

### Step 5: Test Again

1. Send a test webhook from Shopify
2. Check your server logs
3. HMAC should now verify correctly

## Quick Verification

Run this to see what secret is currently loaded:

```bash
node scripts/test-webhook-hmac.js
```

It will show:
- Secret length (should be 38)
- Secret preview (first/last few chars)

Compare the preview with what's in Shopify Partners. They should match exactly.

## If Secret Still Doesn't Match

### Option 1: Regenerate Secret in Shopify

1. Shopify Partners → Your App → App setup
2. Click **"Regenerate"** next to Client secret
3. Copy the new secret
4. Update `.env` with the new secret
5. Restart server

### Option 2: Check for Multiple .env Files

Make sure you're editing the right file:
- `.env` (main file)
- `.env.local` (takes priority if exists)
- `.env.development` (development-specific)

The server loads `.env.local` first, then `.env`. Make sure the secret is in the right file.

## Summary

The issue is almost certainly that your `.env` secret doesn't match Shopify's secret. 

1. ✅ Get secret from Shopify Partners
2. ✅ Compare character-by-character
3. ✅ Update `.env` (no quotes, no spaces)
4. ✅ Restart server
5. ✅ Test webhook

This should fix the HMAC verification issue!
