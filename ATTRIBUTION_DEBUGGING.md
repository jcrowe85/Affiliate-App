# Attribution Debugging Guide

## The Problem

You used Kasey Ackerman's ref ID (`?ref=30483` or similar) to checkout, but:
- ❌ No click was recorded
- ❌ Cart attributes are empty
- ❌ No attribution found
- ❌ No commission created

## Why Attribution Failed

### Issue 1: Cart Attributes Are Empty

Your logs show:
```
Cart Attributes: []
Extracted clickId from attributes: NOT FOUND
```

This means the **theme script didn't set cart attributes** before checkout.

**Possible causes:**
1. Theme script not installed or not working
2. Tracking API URL not configured in theme script
3. Cart attributes not being set before checkout
4. Script error preventing cart attribute update

### Issue 2: Email-Based Attribution is Disabled

The logs show:
```
Email-based attribution for order 6422307274931: affiliate cmkq4vu0c00026yvzrqkp5387
No attribution found for order 6422307274931
```

Email-based attribution **finds** the affiliate but **doesn't use it** (intentionally disabled to prevent self-referral). This is correct behavior - you don't want to pay yourself for your own orders!

## How to Fix

### Step 1: Verify Theme Script is Installed

1. Go to your Shopify Admin → **Online Store** → **Themes**
2. Click **Actions** → **Edit code**
3. Open `theme.liquid`
4. Search for `affiliate-tracking` or `TRACKING_API_URL`
5. Make sure the script is there and `TRACKING_API_URL` is set to your Cloudflare Tunnel URL

### Step 2: Check Tracking API URL

The script should have:
```javascript
const TRACKING_API_URL = 'https://your-cloudflare-url.trycloudflare.com/api/track';
```

**Update this** with your current Cloudflare Tunnel URL!

### Step 3: Test Click Recording

1. Visit your store with: `https://tryfleur.com/?ref=30483` (or Kasey's affiliate number)
2. Open browser console (F12)
3. Look for:
   - `Affiliate tracking: Detected ref parameter: 30483`
   - `Calling tracking API: ...`
   - `✅ Affiliate tracking initialized successfully`
   - `✅ Cookies set: affiliate_click_id, affiliate_id`

If you don't see these, the script isn't working.

### Step 4: Check Cart Attributes

1. Add a product to cart
2. Before checkout, open browser console
3. Check sessionStorage:
   ```javascript
   sessionStorage.getItem('affiliate_click_id')
   sessionStorage.getItem('affiliate_id')
   ```
4. These should have values if the script worked

### Step 5: Verify Click Was Recorded

After visiting with `?ref=30483`, check your database:
```sql
SELECT * FROM "Click" 
WHERE shopify_shop_id = '163bfa-5f' 
ORDER BY created_at DESC 
LIMIT 5;
```

You should see a click record for Kasey's affiliate.

## $0 Orders - Do They Work?

**Yes, $0 orders work!** The code explicitly handles them:

```typescript
const isZeroOrder = orderTotal === 0;
if (isZeroOrder) {
  console.log(`Processing $0 test order - will create commission even if status is ${financialStatus}`);
}
```

The issue is **not** the $0 amount - it's that **no attribution was found** because:
1. No click was recorded (cart attributes empty)
2. Email attribution is disabled (prevents self-referral)

## Quick Test

1. **Get Kasey's affiliate number** from your affiliates list
2. **Visit:** `https://tryfleur.com/?ref=KASEY_AFFILIATE_NUMBER`
3. **Check browser console** - should see tracking messages
4. **Check cookies** - should see `affiliate_click_id` and `affiliate_id`
5. **Add to cart and checkout**
6. **Check webhook logs** - should see `affiliate_click_id` in cart attributes

## Summary

- ✅ **$0 orders work** - not the issue
- ❌ **No click recorded** - theme script issue
- ❌ **Cart attributes empty** - script didn't set them
- ❌ **Email attribution disabled** - intentional (prevents self-referral)

**Fix:** Make sure theme script is installed and `TRACKING_API_URL` is set correctly!
