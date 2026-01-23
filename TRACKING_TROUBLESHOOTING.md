# Tracking Troubleshooting Guide

## Browser-Side Storage

**Yes, affiliate tracking data is stored browser-side!** You can check it in two ways:

### 1. Browser Developer Tools

**Cookies (30-day storage):**
- Open Chrome DevTools (F12)
- Go to **Application** tab → **Cookies** → Your domain
- Look for:
  - `affiliate_click_id` - The click ID for this session
  - `affiliate_id` - The affiliate's database ID

**Session Storage (for checkout):**
- In DevTools → **Application** tab → **Session Storage** → Your domain
- Look for:
  - `affiliate_click_id`
  - `affiliate_id`

### 2. Pixel Test Tool (In-App)

Go to **Pixel Test** tab in the dashboard and scroll down to **Browser-Side Tracking Debug**. This shows:
- Current URL and URL parameters
- Cookies
- Session Storage
- Cart Attributes (if on Shopify store)

## Correct URL Format

**✅ CORRECT:**
```
https://tryfleur.com/?ref=30843
https://tryfleur.com/products/serum?ref=30843
```

**❌ INCORRECT:**
```
https://tryfleur.com/products/serum30843  (appended to URL path)
https://tryfleur.com/products/serum#30843  (hash instead of query param)
```

**Important:** The affiliate number must be in a **query parameter** (`?ref=30843`), not appended to the URL path.

## How to Test

1. **Visit with affiliate link:**
   ```
   https://tryfleur.com/?ref=30843
   ```

2. **Check browser console:**
   - Open DevTools (F12) → **Console** tab
   - Look for messages like:
     - `✅ Affiliate tracking initialized successfully`
     - `✅ Cookies set: affiliate_click_id, affiliate_id`
   - If you see errors, check:
     - `TRACKING_API_URL` is configured correctly
     - API endpoint is accessible

3. **Check cookies:**
   - DevTools → **Application** → **Cookies**
   - Should see `affiliate_click_id` and `affiliate_id`

4. **Add product to cart:**
   - The script should update cart attributes automatically
   - Check console for: `Cart attributes updated`

5. **Complete checkout:**
   - Cart attributes are passed to Shopify checkout
   - These appear in the order webhook as `order.attributes`

## Webhook Debugging

When an order is placed, check your server logs for:

```
=== WEBHOOK RECEIVED ===
Topic: orders/create
Order Number: 1234
Financial Status: paid
Cart Attributes: [{"key":"affiliate_click_id","value":"abc123"}]
```

**What to check:**

1. **Cart Attributes:**
   - Should contain `affiliate_click_id` and `affiliate_id`
   - If missing, the theme script didn't set cart attributes

2. **Attribution:**
   - Look for: `Order attributed successfully. Attribution ID: ...`
   - If missing: `No attribution found` - check:
     - Click was recorded in database
     - Attribution window (default 90 days)
     - Affiliate exists and is active

3. **Commission:**
   - Look for: `Processing commission for affiliate ...`
   - If missing, check:
     - Affiliate has an offer assigned
     - Order is marked as paid (or $0 test order)

## Common Issues

### Issue 1: No Cookies Set

**Symptoms:**
- No `affiliate_click_id` cookie in browser
- Console shows errors

**Solutions:**
1. Check `TRACKING_API_URL` in theme script is configured
2. Check API endpoint is accessible (not blocked by CORS)
3. Check affiliate number exists in database
4. Check browser console for specific error messages

### Issue 2: Cart Attributes Not Set

**Symptoms:**
- Cookies exist but cart attributes are empty
- Webhook shows no `affiliate_click_id` in order attributes

**Solutions:**
1. Ensure script runs on cart page
2. Check `sessionStorage` has values (script copies cookies to sessionStorage)
3. Verify Shopify object is available (`typeof Shopify !== 'undefined'`)

### Issue 3: Order Not Attributed

**Symptoms:**
- Webhook received but no attribution created
- Logs show: `No attribution found`

**Solutions:**
1. Check click was recorded: Use debug endpoint `/api/debug/test-order?affiliate_number=30843`
2. Check attribution window: Click must be within offer's attribution window (default 90 days)
3. Check affiliate status: Must be `active`
4. Check for internal traffic markers: `ref=internal` or `ref=direct` will skip attribution

### Issue 4: Commission Not Created

**Symptoms:**
- Order attributed but no commission

**Solutions:**
1. Check affiliate has offer assigned
2. Check order financial status: Must be `paid` or `partially_paid` (or $0 for test orders)
3. Check webhook topic: Must be `orders/updated` or `orders/create` with paid status

## Debug Endpoints

### Check Affiliate and Clicks
```
GET /api/debug/test-order?affiliate_number=30843
```

### Check Order Processing
```
GET /api/debug/test-order?order_number=1234
```

## Testing Checklist

- [ ] Theme script installed in `theme.liquid`
- [ ] `TRACKING_API_URL` configured in script
- [ ] Affiliate exists with correct `affiliate_number`
- [ ] Affiliate has offer assigned
- [ ] Visit URL with `?ref=AFFILIATE_NUMBER`
- [ ] Check browser console for success messages
- [ ] Check cookies are set
- [ ] Add product to cart
- [ ] Check cart attributes (via API or checkout)
- [ ] Complete checkout
- [ ] Check webhook logs for attribution
- [ ] Check commission created in database

## Next Steps

If orders still aren't being recorded:

1. **Check webhook logs** - Look for the detailed logs we added
2. **Use debug endpoint** - Check if affiliate/clicks exist
3. **Verify URL format** - Ensure using `?ref=30843` not appended to path
4. **Check theme script** - Ensure it's installed and `TRACKING_API_URL` is set
5. **Test with Pixel Test tool** - Verify script is active on pages
