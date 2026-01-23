# Cookie Debugging Guide

## Why Cookies Might Not Appear

Cookies are **only set** when:
1. ✅ URL contains `?ref=30483` parameter
2. ✅ TRACKING_API_URL is configured correctly
3. ✅ API call succeeds
4. ✅ Affiliate exists and is active

## Common Issues

### Issue 1: Visiting Without `?ref=` Parameter

**Problem:** You're visiting `https://tryfleur.com/` (no `?ref=` parameter)

**Solution:** Visit with the parameter:
```
https://tryfleur.com/?ref=30483
```

**Check:** Open browser console - you should see:
```
No ref parameter and no existing cookies - normal visit (not from affiliate link)
```

### Issue 2: TRACKING_API_URL Not Configured

**Problem:** Script still has placeholder URL

**Check:** Open browser console - you'll see:
```
❌ Affiliate Tracking Error: TRACKING_API_URL is not configured
Current TRACKING_API_URL: https://your-app-domain.com/api/track
```

**Solution:** Update the script with your actual app URL:
```javascript
const TRACKING_API_URL = 'https://your-actual-app-url.com/api/track';
```

### Issue 3: API Call Failing

**Problem:** API call returns error (CORS, 404, 500, etc.)

**Check:** Open browser console - you'll see:
```
❌ Error tracking affiliate click: [error details]
```

**Common causes:**
- Wrong API URL
- CORS issues
- API endpoint not deployed
- Network error

### Issue 4: Affiliate Not Found

**Problem:** Affiliate number doesn't exist or is inactive

**Check:** Browser console will show API error:
```
API returned 404: Affiliate not found or inactive
```

**Solution:** Verify affiliate exists and is active in admin dashboard

## Step-by-Step Debugging

### Step 1: Check Browser Console

1. Open Chrome DevTools (F12)
2. Go to **Console** tab
3. Visit: `https://tryfleur.com/?ref=30483`
4. Look for messages:

**Success messages:**
```
Affiliate tracking: Detected ref parameter: 30483
Calling tracking API: https://...
Tracking API response status: 200
Tracking API response data: {success: true, clickId: "...", ...}
✅ Affiliate tracking initialized successfully
✅ Cookies set: affiliate_click_id, affiliate_id
```

**Error messages:**
```
❌ Affiliate Tracking Error: TRACKING_API_URL is not configured
❌ Error tracking affiliate click: [error]
```

### Step 2: Check Network Tab

1. Open Chrome DevTools (F12)
2. Go to **Network** tab
3. Visit: `https://tryfleur.com/?ref=30483`
4. Look for request to `/api/track`
5. Check:
   - **Status:** Should be 200 (not 404, 500, etc.)
   - **Response:** Should have `success: true`
   - **CORS:** Check for CORS errors

### Step 3: Check Cookies

1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Click **Cookies** → `https://tryfleur.com`
4. Look for:
   - `affiliate_click_id`
   - `affiliate_id`

**If cookies are missing:**
- Check console for errors
- Verify you visited with `?ref=` parameter
- Check API call succeeded

### Step 4: Verify Script is Loaded

1. Open Chrome DevTools (F12)
2. Go to **Sources** tab
3. Look for `affiliate-tracking` script
4. Or check **Elements** tab → Search for script tag

## Testing Checklist

✅ **Visit with ref parameter:**
```
https://tryfleur.com/?ref=30483
```

✅ **Check browser console for:**
- "Affiliate tracking: Detected ref parameter"
- "✅ Affiliate tracking initialized successfully"
- No error messages

✅ **Check Network tab:**
- Request to `/api/track` exists
- Status is 200
- Response has `success: true`

✅ **Check Application → Cookies:**
- `affiliate_click_id` exists
- `affiliate_id` exists
- Both have 30-day expiration

## Quick Test

1. **Visit:** `https://tryfleur.com/?ref=30483`
2. **Open Console:** F12 → Console tab
3. **Look for:** "✅ Affiliate tracking initialized successfully"
4. **Check Cookies:** F12 → Application → Cookies
5. **Verify:** Both cookies are present

## If Still Not Working

### Check These:

1. **Script is in theme.liquid?**
   - Go to Shopify Admin → Themes → Edit code
   - Check `theme.liquid` has the script

2. **TRACKING_API_URL is set?**
   - Check script has your actual app URL
   - Not the placeholder `your-app-domain.com`

3. **API endpoint is accessible?**
   - Try visiting: `https://your-app-url.com/api/track?ref=30483&shop=your-shop.myshopify.com`
   - Should return JSON (not 404)

4. **Affiliate exists?**
   - Check admin dashboard → Affiliates
   - Verify affiliate #30483 exists and is active

5. **CORS issues?**
   - Check Network tab for CORS errors
   - API should return `Access-Control-Allow-Origin: *`

## Enhanced Logging

The updated script now includes detailed logging:
- ✅ Detects when `?ref=` parameter is found
- ✅ Shows API URL being called
- ✅ Logs API response
- ✅ Shows success/error messages
- ✅ Indicates when cookies are set

Check the browser console for all these messages to debug issues.
