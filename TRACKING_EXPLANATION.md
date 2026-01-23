# Affiliate Tracking System - How It Works

## Current Tracking Flow

### 1. Initial Click (Customer Visits via Affiliate Link)
```
Customer clicks: yoursite.com/ref/30483
↓
System sets cookies:
  - affiliate_click_id: "abc123"
  - affiliate_id: "affiliate-uuid"
↓
Cookies persist for 30 days
```

### 2. Order Creation (orders/create webhook)
```
Shopify sends order webhook
↓
System looks for click_id in order.metafields
  (This requires Shopify script to pass cookies → metafields)
↓
If found:
  - Looks up Click record → gets affiliate_id
  - Creates OrderAttribution (links order to affiliate)
  - NO commission created yet (waiting for payment)
```

### 3. Order Payment (orders/paid webhook)
```
Shopify sends payment confirmation
↓
System:
  1. Finds OrderAttribution for this order
  2. Gets affiliate_id from attribution
  3. Checks if subscription renewal:
     - If renewal: Finds SubscriptionAttribution
     - Checks payment count vs max_payments
  4. Gets affiliate's current Offer (or CommissionRule)
  5. Calculates commission based on:
     - Initial payment: Use initial commission rate
     - Rebill payment: Use rebill rate (if within limit)
  6. Creates Commission record
```

## Critical Issue: Cookie → Metafield Conversion

**Problem:** Cookies set by your site won't automatically appear in Shopify order metafields. You need a Shopify script to capture cookies and pass them as metafields.

**Solution Required:** Add a Shopify script (checkout.liquid or theme script) that:
1. Reads `affiliate_click_id` cookie
2. Sets it as an order metafield during checkout
3. Shopify will then include it in webhook payload

## Recommendation: One Offer Per Affiliate

**Why:**
- Simple URL tracking (`/ref/30483`) can't specify which offer
- Multiple offers would require product-specific links
- One offer per affiliate = clear attribution

**Implementation:**
- Use `affiliate.offer_id` (single offer) instead of `affiliate_offers` (many-to-many)
- When affiliate's offer changes:
  - Existing customers: Keep old offer rules (stored in OrderAttribution/Commission)
  - New customers: Use new offer rules

## Subscription Payment Tracking

**For Subsequent Payments:**
1. System identifies original order (from SubscriptionAttribution)
2. Gets the affiliate_id from original OrderAttribution
3. Gets affiliate's offer at time of original order (snapshot)
4. Checks payment number:
   - Payment 1: Initial commission rate
   - Payments 2-7: Rebill commission rate (if within max_payments)
5. Creates commission for that specific payment

**Key Point:** The offer rules are "snapshotted" at the time of the original order, so changing an affiliate's offer doesn't affect existing subscriptions.
