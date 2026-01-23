# Implementation Summary - Affiliate Tracking System

## ✅ Completed Implementations

### 1. One Offer Per Affiliate ✅
- **Changed:** Removed many-to-many `affiliate_offers` relationship from UI
- **Now:** Each affiliate has a single `offer_id`
- **Behavior:** 
  - When affiliate's offer is changed, existing customers keep their original offer rules
  - New customers get the new offer rules
  - Offer rules are "snapshotted" in commission records for historical accuracy

### 2. Offer-Based Commission System ✅
- **Changed:** Replaced `CommissionRule` logic with `Offer` model
- **New File:** `lib/offer-commission.ts` with Offer-based calculation functions
- **How it works:**
  - Gets affiliate's current offer
  - For initial payments: Uses offer's main commission (flat_rate or percentage)
  - For rebill payments: Uses offer's rebill commission settings
  - Handles subscription limits (`subscription_max_payments`)

### 3. Automatic Referral Links ✅
- **Route:** `/ref/[affiliateNumber]` (e.g., `/ref/30483`)
- **Features:**
  - Single URL per affiliate (no need to specify destination)
  - Automatically sets tracking cookies (30-day session)
  - Redirects to homepage (or optional `?url=/products/serum`)

### 4. Payment Confirmation Requirement ✅
- **Changed:** Commissions only created on `orders/paid` webhook
- **Behavior:**
  - `orders/create`: Only creates OrderAttribution (no commission)
  - `orders/paid`: Creates commission (payment confirmed)

### 5. Shopify Cookie Tracking Scripts ✅
- **Created:** Scripts in `shopify-scripts/` directory
- **Method:** Uses cart attributes (simplest approach)
- **How:** Theme script captures cookies and sets cart attributes, which are included in order webhooks

## 🔄 How Tracking Works

### Initial Customer Visit
1. Customer clicks: `yoursite.com/ref/30483`
2. System sets cookies:
   - `affiliate_click_id`: "abc123"
   - `affiliate_id`: "affiliate-uuid"
3. Cookies persist for 30 days

### During Checkout
1. Shopify theme script reads cookies
2. Sets cart attributes:
   - `affiliate_click_id`: "abc123"
   - `affiliate_id`: "affiliate-uuid"
3. Cart attributes are included in order webhook

### Order Creation (orders/create webhook)
1. System receives webhook
2. Extracts `affiliate_click_id` from `order.attributes`
3. Looks up Click record → gets `affiliate_id`
4. Creates `OrderAttribution` (links order to affiliate)
5. **No commission created yet** (waiting for payment)

### Order Payment (orders/paid webhook)
1. System receives payment confirmation
2. Gets `OrderAttribution` for this order
3. Gets affiliate's current `Offer`
4. Determines payment type:
   - **Initial payment**: Uses offer's main commission rate
   - **Rebill payment**: Uses offer's rebill commission rate (if within limit)
5. Calculates commission amount
6. Creates `Commission` record with status `pending`
7. For subscriptions: Updates `payments_made` counter

### Subsequent Payments (Rebills)
1. Appstle creates renewal order
2. System detects it's a renewal (Appstle tags)
3. Finds original `SubscriptionAttribution`
4. Gets the `Offer` that was active at original order time (from commission snapshot)
5. Checks `payments_made` vs `subscription_max_payments`
6. If within limit: Creates commission at rebill rate
7. If exceeded: No commission
8. Increments `payments_made` counter

## 📋 Commission Calculation Examples

### Example 1: One-Time Purchase
- **Offer:** $50 flat rate
- **Customer purchases:** $100 product
- **Commission:** $50 (flat rate, regardless of order total)

### Example 2: Subscription - Initial + Rebill
- **Offer:** 
  - Initial: $50 flat
  - Rebill: 15% for 6 payments
- **Customer purchases:** $58/month subscription
- **Payment 1 (initial):** $50 commission
- **Payments 2-7 (rebills):** $8.70 each (15% of $58)
- **Payment 8:** No commission (exceeded 6 rebill limit)

## 🚧 Next Steps (Pending)

1. **Customer Conversion UI** - Payment series visualization
2. **Appstle API Integration** - Better subscription tracking
3. **Order Details Storage** - Store order total/product info for AOV

## 📝 Important Notes

### Cookie → Order Attribution
- **Critical:** You MUST add the Shopify theme script to capture cookies
- Without it, affiliate tracking won't work
- See `shopify-scripts/README.md` for installation instructions

### Offer Changes
- Changing an affiliate's offer only affects **new customers**
- Existing customers keep their original offer rules (stored in commission snapshots)
- This ensures fairness and prevents retroactive changes

### Subscription Tracking
- Current system uses Appstle tags to detect renewals
- For better accuracy, integrate Appstle API to get original order references
- Fallback: Finds most recent subscription for affiliate/plan combination
