# Internal Traffic Detection - Preventing Affiliate Attribution

## Problem

If a prospect:
1. Clicks affiliate link (within 90-day window)
2. Abandons cart
3. Returns via your internal marketing (Meta ads, Google ads, etc.)
4. Purchases

**Without protection:** Affiliate gets paid even though you drove the final conversion.

## Solution: Internal Traffic Detection

The system now detects internal traffic and **skips affiliate attribution** for:
- Your own paid ads (Meta, Google, etc.)
- Organic search (Google, Bing, etc.)
- Direct URL entry
- Internal navigation

## How It Works

### 1. URL Parameter Detection

**Add to all internal marketing URLs:**
- Meta ads: `yoursite.com?ref=internal&source=meta`
- Google ads: `yoursite.com?ref=internal&source=google`
- Email campaigns: `yoursite.com?ref=internal&source=email`
- Social posts: `yoursite.com?ref=internal&source=social`
- Direct entry: `yoursite.com?ref=direct` (optional)

**System checks:**
- If `ref=internal` or `ref=direct` → No affiliate attribution
- If `ref=30483` (affiliate number) → Normal affiliate attribution

### 2. Organic Search Detection

**Automatically detected:**
- If referrer is from search engine (Google, Bing, Yahoo, etc.)
- AND no affiliate `click_id` present
- → Treated as internal traffic (no affiliate attribution)

**Search engines detected:**
- google.com, google.co.uk, google.ca, etc.
- bing.com
- yahoo.com
- duckduckgo.com
- yandex.com
- baidu.com
- ask.com

### 3. Cart Attribute Detection

**Theme script can set:**
```javascript
attributes: {
  'ref': 'internal',
  'source': 'meta'
}
```

**System checks cart attributes:**
- If `ref=internal` or `ref=direct` → No affiliate attribution
- Even if old affiliate cookie exists, internal traffic wins

## Implementation

### Attribution Logic Flow

1. **Check for internal traffic FIRST**
   - URL parameter: `ref=internal` or `ref=direct`
   - Cart attribute: `ref=internal` or `ref=direct`
   - Organic search: Referrer from search engine + no affiliate click_id
   
2. **If internal traffic detected:**
   - Return `null` (no affiliate attribution)
   - Log: "Order detected as internal traffic - skipping affiliate attribution"
   - No commission created

3. **If NOT internal traffic:**
   - Proceed with normal affiliate attribution
   - Check attribution window
   - Apply last-touch logic

## Examples

### Example 1: Internal Marketing (Meta Ads)

**Timeline:**
- Day 1: Affiliate A click (within 90-day window)
- Day 10: Customer abandons cart
- Day 20: Customer clicks Meta ad → `yoursite.com?ref=internal&source=meta`
- Day 20: Customer purchases

**Result:**
- System detects `ref=internal` → Internal traffic
- No affiliate attribution → No commission
- ✅ You don't pay affiliate for your own marketing

### Example 2: Organic Google Search

**Timeline:**
- Day 1: Affiliate A click (within 90-day window)
- Day 10: Customer abandons cart
- Day 20: Customer Googles your brand → Clicks organic result
- Day 20: Customer purchases

**Result:**
- System detects referrer from `google.com`
- No affiliate `click_id` present → Organic search
- Treated as internal traffic → No commission
- ✅ You don't pay affiliate for organic search

### Example 3: Direct URL Entry

**Timeline:**
- Day 1: Affiliate A click (within 90-day window)
- Day 10: Customer abandons cart
- Day 20: Customer types URL directly → `yoursite.com`
- Day 20: Customer purchases

**Result:**
- No referrer, no affiliate params → Direct entry
- System checks for affiliate clicks (IP/UA fingerprinting)
- If found within window → Could attribute to affiliate
- **Recommendation:** Add `?ref=direct` to your homepage links if you want to explicitly block

### Example 4: Affiliate Link (Normal Flow)

**Timeline:**
- Day 1: Affiliate A click → `yoursite.com/ref/30483`
- Day 10: Customer purchases

**Result:**
- System detects affiliate number `30483`
- No `ref=internal` → Not internal traffic
- Proceeds with affiliate attribution
- ✅ Affiliate gets commission

## Setup Requirements

### 1. Add URL Parameters to Internal Marketing

**Meta Ads:**
```
yoursite.com?ref=internal&source=meta
```

**Google Ads:**
```
yoursite.com?ref=internal&source=google
```

**Email Campaigns:**
```
yoursite.com?ref=internal&source=email
```

### 2. Update Theme Script (Optional)

Add to your theme script to set cart attribute:
```javascript
// Check for internal traffic
const urlParams = new URLSearchParams(window.location.search);
const refParam = urlParams.get('ref');

if (refParam === 'internal' || refParam === 'direct') {
  // Set cart attribute
  fetch('/cart/update.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attributes: {
        'ref': refParam,
        'source': urlParams.get('source') || 'unknown'
      }
    })
  });
}
```

### 3. Organic Search (Automatic)

No setup needed - automatically detected if:
- Referrer is from search engine
- No affiliate `click_id` present

## Important Notes

### What Gets Blocked

✅ **Internal marketing** (with `ref=internal`)
✅ **Organic search** (automatically detected)
✅ **Direct entry** (if you add `ref=direct`)

### What Still Works

✅ **Affiliate links** (`/ref/30483` or `?ref=30483`)
✅ **Affiliate coupons** (still work normally)
✅ **Affiliate tracking** (if not marked as internal)

### Edge Cases

**Scenario:** Customer clicks affiliate link, then later clicks your Meta ad
- If Meta ad has `ref=internal` → No commission (internal wins)
- If Meta ad has no params → Could still attribute to affiliate (last-touch)

**Recommendation:** Always add `ref=internal` to all internal marketing URLs

## Summary

- ✅ **Internal traffic detection implemented**
- ✅ **Organic search automatically detected**
- ✅ **URL parameters: `ref=internal` or `ref=direct`**
- ✅ **Cart attributes: `ref=internal` or `ref=direct`**
- ✅ **Prevents paying affiliates for your own marketing**
- ✅ **Legal compliance: You only pay for actual affiliate conversions**

**Action Required:** Add `?ref=internal&source=[channel]` to all internal marketing URLs.
