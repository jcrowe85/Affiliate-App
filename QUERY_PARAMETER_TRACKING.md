# Query Parameter Tracking (Primary Method)

## Overview

Query parameter tracking (`?ref=30483`) is now the **primary** affiliate tracking method, matching Refersion's format that most affiliates expect.

## URL Format

**Primary (Query Parameter):**
```
https://tryfleur.com/?ref=30483
https://tryfleur.com/products/serum?ref=30483
https://tryfleur.com/blog/post?ref=30483
```

**Alternative (Path-Based):**
```
https://tryfleur.com/ref/30483
```

## How It Works

### 1. Affiliate Shares Link

Affiliate shares: `https://tryfleur.com/?ref=30483`

Or adds `?ref=30483` to any existing URL:
- `https://tryfleur.com/products/serum?ref=30483`
- `https://tryfleur.com/blog/post?ref=30483`

### 2. Theme Script Detects Parameter

The Shopify theme script (`affiliate-tracking.liquid`) automatically:
- Detects `?ref=30483` parameter on page load
- Calls `/api/track?ref=30483&shop=your-shop.myshopify.com`
- Records click server-side in database
- Sets tracking cookies (30 days)

### 3. Tracking Cookies Set

Cookies are set automatically:
- `affiliate_click_id` - Unique click identifier
- `affiliate_id` - Affiliate database ID

These cookies persist for 30 days, so any purchase during that time is attributed.

### 4. Checkout Attribution

When customer reaches checkout:
- Cart attributes are updated with affiliate data
- Order webhook receives affiliate information
- Commission is created based on offer rules

## Implementation

### Step 1: Update Theme Script

The theme script (`shopify-scripts/affiliate-tracking.liquid`) needs to be updated with your tracking API URL:

```liquid
const TRACKING_API_URL = 'https://your-app-domain.com/api/track';
```

**Update this line** with your actual app URL before deploying.

### Step 2: Add Script to Theme

1. Go to Shopify Admin → Online Store → Themes → Actions → Edit code
2. Navigate to: Snippets → Create new file: "affiliate-tracking"
3. Paste the code from `shopify-scripts/affiliate-tracking.liquid`
4. Update `TRACKING_API_URL` with your app URL
5. In `theme.liquid`, add: `{% render 'affiliate-tracking' %}`

### Step 3: Test

1. Visit: `https://tryfleur.com/?ref=30483`
2. Check browser console for tracking confirmation
3. Verify cookies are set (`affiliate_click_id`, `affiliate_id`)
4. Check database for click record

## API Endpoint

### `/api/track`

**Method:** GET

**Parameters:**
- `ref` (required) - Affiliate number (e.g., `30483`)
- `shop` (optional) - Shop domain (defaults to env variable)

**Response:**
```json
{
  "success": true,
  "clickId": "clx_abc123",
  "affiliateId": "aff_xyz789",
  "affiliateNumber": 30483
}
```

**What It Does:**
1. Validates affiliate number
2. Finds affiliate in database
3. Records click with IP/User Agent fingerprinting
4. Returns click ID and affiliate ID for cookie setting

## Benefits Over Path-Based

1. **Works on Any Page**
   - No need to redirect
   - Can add `?ref=30483` to any URL
   - Works on product pages, blog posts, etc.

2. **Familiar Format**
   - Matches Refersion (`?rfsn=...`)
   - Most affiliates expect this format
   - Easy to understand and use

3. **Flexible**
   - Can combine with other parameters
   - Easy to add campaign tracking
   - Works with existing URLs

4. **No Redirects**
   - User stays on the page they clicked
   - Better user experience
   - Faster page loads

## Path-Based Alternative

The path-based format (`/ref/30483`) is still available as an alternative:
- Cleaner URLs
- Better for sharing
- Server-side redirect with tracking

Both methods work the same way and use the same attribution logic.

## Testing

### Test Query Parameter Tracking

1. **Visit with ref parameter:**
   ```
   https://tryfleur.com/?ref=30483
   ```

2. **Check browser console:**
   Should see: `Affiliate tracking initialized: { affiliateNumber: 30483, clickId: "..." }`

3. **Check cookies:**
   - Open DevTools → Application → Cookies
   - Should see `affiliate_click_id` and `affiliate_id`

4. **Check database:**
   - Query `Click` table
   - Should see new click record with affiliate_id

5. **Test on product page:**
   ```
   https://tryfleur.com/products/serum?ref=30483
   ```
   - Should work the same way
   - No redirect, stays on product page

## Troubleshooting

### Cookies Not Setting

- Check browser console for errors
- Verify `TRACKING_API_URL` is correct
- Check CORS headers in API response
- Ensure script is loaded on page

### Click Not Recorded

- Check API endpoint is accessible
- Verify affiliate number exists in database
- Check affiliate status is "active"
- Review server logs for errors

### Attribution Not Working

- Verify cookies are set correctly
- Check cart attributes are updated
- Ensure theme script runs before checkout
- Verify webhook receives affiliate data

## Migration from Path-Based

If you were using path-based tracking (`/ref/30483`):
- Both methods still work
- Query parameter is now primary
- Path-based redirects still function
- No breaking changes

## Next Steps

1. ✅ Update theme script with your app URL
2. ✅ Add script to Shopify theme
3. ✅ Test with `?ref=30483` parameter
4. ✅ Verify cookies are set
5. ✅ Test checkout attribution
6. ✅ Share query parameter URLs with affiliates
