# Cart Attributes Not Updating - Fix

## The Problem

You see:
- ✅ Affiliate tracking initialized successfully
- ❌ Cart attributes not updating when items are added
- ❌ No `affiliate_click_id` in webhook

## What I Fixed

### 1. Enhanced Cart Attribute Updates

Added multiple event listeners to catch cart updates from different themes:
- `cart:updated` - Standard Shopify event
- `cart:change` - Some themes use this
- `cart:refresh` - Other themes use this
- `ajaxCart:updated` - AJAX cart updates
- `cart:build` - Cart rebuild events
- Form submission listeners - For add to cart forms
- Fetch/XHR interception - Catches AJAX cart updates
- Periodic fallback - Updates every 5 seconds as backup

### 2. Better Logging

Now logs when cart attributes are updated:
```javascript
console.log('✅ Cart attributes updated successfully:', attributes);
```

### 3. Improved Error Handling

Better error messages if cart update fails.

## How to Test

### Step 1: Update Theme Script

1. Go to **Shopify Admin** → **Online Store** → **Themes** → **Actions** → **Edit code**
2. Find your affiliate tracking script (in `theme.liquid` or a snippet)
3. **Replace it** with the updated version from `shopify-scripts/affiliate-tracking.liquid`
4. **Make sure** `TRACKING_API_URL` is set to your Cloudflare Tunnel URL
5. **Save**

### Step 2: Test Cart Attributes

1. Visit: `https://tryfleur.com/?ref=30484` (or Kasey's affiliate number)
2. Open browser console (F12)
3. You should see:
   - `Affiliate tracking initialized successfully`
   - `✅ Cart attributes updated successfully` (when cart is accessed)
4. **Add a product to cart**
5. You should see:
   - `✅ Cart attributes updated successfully` (after adding to cart)
6. **Check sessionStorage:**
   ```javascript
   sessionStorage.getItem('affiliate_click_id')
   sessionStorage.getItem('affiliate_id')
   ```
   Should have values!

### Step 3: Test Checkout

1. Complete checkout
2. Check webhook logs
3. Should see `affiliate_click_id` in cart attributes
4. Attribution should work!

## What to Look For in Console

**When page loads:**
```
✅ Cart attributes updated successfully: {affiliate_click_id: "...", affiliate_id: "..."}
```

**When adding to cart:**
```
✅ Cart attributes updated successfully: {affiliate_click_id: "...", affiliate_id: "..."}
```

**If you see errors:**
```
❌ Error setting cart attributes: [error details]
```

## Summary

- ✅ **Multiple event listeners** - Catches cart updates from any theme
- ✅ **Better logging** - See when attributes are updated
- ✅ **Periodic fallback** - Updates every 5 seconds as backup
- ✅ **AJAX interception** - Catches fetch/XHR cart updates

Update your theme script and test again. You should now see cart attributes being set!
