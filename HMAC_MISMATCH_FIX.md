# HMAC Mismatch Fix Guide

## The Problem

Your debug output shows:
- **Received HMAC:** `neYKi4ApQoSz/0ugOlzjUte6Br6bU+...`
- **Calculated HMAC:** `M5AC8bSryFNFhS0/YlPswOjMArdc/N...`
- **Secret length:** 38

The HMACs are completely different, which means either:
1. ❌ **Secret mismatch** (most likely) - Your `SHOPIFY_API_SECRET` doesn't match what Shopify is using
2. ⚠️ **Body modification** - ngrok or Next.js is modifying the request body

## Solution 1: Verify Secret Match (Most Likely Fix)

### Step 1: Get the Correct Secret from Shopify

1. Go to **Shopify Partners Dashboard**
2. Click on your app
3. Go to **API credentials** tab
4. Copy the **Client secret** (this is your `SHOPIFY_API_SECRET`)

### Step 2: Update Your .env File

```env
SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Important:**
- Make sure there are **no extra spaces** before or after
- Make sure there are **no quotes** around it
- Make sure it's the **Client secret**, not the API key

### Step 3: Restart Your Server

```bash
# Stop server (Ctrl+C)
npm run dev
```

### Step 4: Test Again

Place another test order and check if the HMAC verification passes.

## Solution 2: Check for Body Modification

If the secret is correct but HMAC still fails, the body might be getting modified.

### Check ngrok Configuration

ngrok free tier might modify requests. Check:

1. **ngrok Dashboard:** http://localhost:4040
2. Look for any request transformations
3. Check if compression is enabled

### Disable ngrok Request Inspection (if enabled)

If you see an inspection page, you can:
1. Upgrade to ngrok paid plan (static domain, no inspection)
2. Or use a different tunneling service

## Solution 3: Verify Secret Format

The secret should:
- Start with `shpss_` (for Shopify app secrets)
- Be about 38-40 characters long
- Match exactly what's in Shopify Partners

## Testing

After updating the secret:

1. **Restart your server**
2. **Place a test order**
3. **Check server logs** - You should see:
   ```
   ✅ HMAC Verification Passed
   ```

If you still see HMAC mismatch:
- Double-check the secret character-by-character
- Make sure there are no hidden characters
- Verify the secret in Shopify Partners matches your `.env`

## Why This Happens

Shopify signs webhooks using the **Client secret** from your app's API credentials. If your local `.env` has a different secret (or an old one), the HMACs won't match.

**Common causes:**
- Secret was regenerated in Shopify but `.env` wasn't updated
- Copy/paste error when setting the secret
- Using the wrong secret (API key instead of Client secret)
- Extra whitespace or quotes in `.env`

## Next Steps

1. ✅ Get the correct secret from Shopify Partners
2. ✅ Update `.env` file
3. ✅ Restart server
4. ✅ Test with a real order
5. ✅ Check logs for "✅ HMAC Verification Passed"
