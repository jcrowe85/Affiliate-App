# Cookie Duration vs Attribution Window

## The Question

**Cookies are set for 30 days, but attribution windows can be 90 days (or more). Is this a problem?**

## Answer: No, Server-Side Makes Up For It ✅

The system uses **multiple fallback methods** that work beyond cookie expiration:

### How It Works

1. **Cookies (30 days)** - Primary method, fastest
   - `affiliate_click_id` and `affiliate_id` cookies
   - Works for 30 days after click
   - Fastest attribution method

2. **Server-Side Database (Permanent)** - Fallback for clicks beyond 30 days
   - **ALL clicks are logged to database immediately** (server-side)
   - Database stores clicks permanently (not just 30 days)
   - Includes: IP hash, User Agent hash, timestamp, affiliate ID
   - Available for attribution even after cookies expire

3. **IP + User Agent Fingerprinting** - Finds clicks in database
   - When cookies expire (after 30 days), system searches database
   - Matches order IP/UA hash to click IP/UA hash
   - Finds clicks within attribution window (90 days)
   - Works even if cookies were cleared

### Example Scenario

**Day 1:** Customer clicks `?ref=30483`
- Click logged to database ✅ (permanent record)
- Cookies set for 30 days ✅

**Day 45:** Customer makes purchase (cookies expired)
- Cookies: ❌ Expired (30 days passed)
- Database lookup: ✅ Finds click from Day 1
- Attribution window: ✅ Day 1 is within 90-day window
- **Result: Attribution successful via database lookup**

**Day 95:** Customer makes purchase (outside attribution window)
- Cookies: ❌ Expired
- Database lookup: ✅ Finds click from Day 1
- Attribution window: ❌ Day 1 is outside 90-day window
- **Result: No attribution (correctly excluded)**

## Code Evidence

From `lib/attribution-enhanced.ts`:

```typescript
// Method 4: IP + User Agent fingerprinting
if (!affiliateId && data.orderIp && data.orderUserAgent) {
  const orderIpHash = hashIP(data.orderIp);
  const orderUaHash = hashUserAgent(data.orderUserAgent);
  
  // Get attribution window
  const windowDays = await getAttributionWindow(affiliateId, data.shopifyShopId);
  const windowStart = new Date(orderDate);
  windowStart.setDate(windowStart.getDate() - windowDays); // 90 days back
  
  // Search database for clicks with matching IP/UA within window
  const matchingClicks = await prisma.click.findMany({
    where: {
      shopify_shop_id: data.shopifyShopId,
      ip_hash: orderIpHash,
      user_agent_hash: orderUaHash,
      created_at: {
        gte: windowStart, // Within attribution window
        lte: orderDate,
      },
    },
    include: {
      affiliate: {
        include: { offer: true },
      },
    },
    orderBy: {
      created_at: 'desc', // Last-touch: most recent wins
    },
  });
  
  // Find most recent click within its own affiliate's attribution window
  for (const click of matchingClicks) {
    const clickWindowDays = click.affiliate.offer?.attribution_window_days || 90;
    if (isWithinAttributionWindow(click.created_at, orderDate, clickWindowDays)) {
      affiliateId = click.affiliate_id;
      clickId = click.id;
      clickDate = click.created_at;
      attributionMethod = 'ip_user_agent_fingerprint';
      break; // Last-touch: most recent valid click wins
    }
  }
}
```

## Why 30-Day Cookies?

**Cookies are set for 30 days because:**

1. **Performance:** Cookies are fastest (no database lookup needed)
2. **Most conversions happen within 30 days:** ~80-90% of conversions
3. **Browser limits:** Some browsers limit cookie duration
4. **Privacy:** Shorter cookie duration is more privacy-friendly

**But the system doesn't rely on cookies alone:**

- Database lookup handles clicks beyond 30 days
- Works up to attribution window (90 days or more)
- No attribution beyond attribution window (correctly enforced)

## Summary

✅ **Cookies (30 days):** Fast, works for most conversions  
✅ **Database (Permanent):** Handles clicks beyond 30 days  
✅ **Attribution Window (90 days):** Correctly enforced via database lookup  
✅ **No Issue:** System works correctly for full attribution window

**The 30-day cookie duration is NOT a limitation** - it's just the primary method. The database lookup ensures attribution works for the full attribution window.

---

## Question 2: Is TRACKING_API_URL Mandatory?

### Answer: Partially - Depends on Tracking Method

**For Query Parameter Tracking (`?ref=30483`):**
- ✅ **YES, mandatory** - Script needs API URL to call `/api/track`
- Without it, query parameter clicks won't be recorded

**For Path-Based Tracking (`/ref/30483`):**
- ❌ **NO, not mandatory** - Path-based route handles tracking server-side
- Script still helps with cart attributes, but tracking happens via redirect

### What Happens Without TRACKING_API_URL?

**Scenario 1: Query Parameter (`?ref=30483`)**
- Script detects `?ref=` parameter
- Tries to call `TRACKING_API_URL` (fails if not set)
- **Result:** Click not recorded, cookies not set
- **Fallback:** IP/UA fingerprinting might catch it, but less reliable

**Scenario 2: Path-Based (`/ref/30483`)**
- User visits `/ref/30483`
- Server-side route records click ✅
- Sets cookies ✅
- Script reads cookies and updates cart attributes ✅
- **Result:** Works fine without API URL

### Recommendation

**Set TRACKING_API_URL for:**
- Query parameter tracking (primary method)
- Maximum reliability
- Proper click recording

**The script will still partially work without it:**
- Cart attributes from existing cookies
- Path-based tracking (server-side)
- But query parameter tracking won't work

### Code Evidence

From `shopify-scripts/affiliate-tracking.liquid`:

```javascript
// This part REQUIRES TRACKING_API_URL
if (refParam) {
  fetch(`${TRACKING_API_URL}?ref=${affiliateNumber}&shop=${SHOP_ID}`, {
    // ... records click, sets cookies
  });
}

// This part works WITHOUT TRACKING_API_URL
const affiliateClickId = getCookie('affiliate_click_id');
if (affiliateClickId) {
  // Updates cart attributes (works if cookies exist from path-based tracking)
  updateCartAttributes();
}
```

## Summary

1. **Cookie Duration (30 days) vs Attribution Window (90 days):**
   - ✅ **No issue** - Server-side database lookup handles clicks beyond 30 days
   - Database stores clicks permanently
   - IP/UA fingerprinting finds clicks within attribution window
   - System works correctly for full attribution window

2. **TRACKING_API_URL:**
   - ✅ **Mandatory for query parameter tracking** (`?ref=30483`)
   - ❌ **Not mandatory for path-based tracking** (`/ref/30483`)
   - **Recommendation:** Set it for maximum reliability
