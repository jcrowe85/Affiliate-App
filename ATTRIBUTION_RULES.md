# Attribution Rules & Window Enforcement

## ✅ Critical Rules Implemented

### 1. Attribution Window Enforcement (90 Days Default)

**Rule:** Clicks outside the attribution window are **ignored**. If a customer purchases on day 91, the affiliate does NOT get credit.

**Implementation:**
- Every click lookup checks if `click.created_at` is within the offer's `attribution_window_days`
- Window is calculated as: `order_date - attribution_window_days <= click_date <= order_date`
- If click is outside window, attribution fails (no commission)

**Example:**
- Day 1: Customer clicks affiliate link (click recorded)
- Day 91: Customer purchases
- Result: **NO commission** (click is outside 90-day window)

### 2. Last-Touch Attribution

**Rule:** The **most recent** affiliate click within the attribution window gets credit. If multiple affiliates send traffic, only the last one is paid.

**Implementation:**
- When multiple clicks exist, system finds the **most recent click** within attribution window
- Uses `orderBy: { created_at: 'desc' }` to get latest click
- Only the most recent click's affiliate gets commission

**Example:**
- Day 1: Affiliate A sends traffic (click recorded)
- Day 5: Customer abandons cart
- Day 10: Affiliate B sends traffic (click recorded)
- Day 15: Customer purchases
- Result: **Affiliate B gets commission** (last-touch wins)

### 3. No Double Payment

**Rule:** If an order is re-attributed to a different affiliate, any existing unpaid commissions from the old affiliate are **reversed**.

**Implementation:**
- Before creating new attribution, system checks if order already attributed
- If attribution changed:
  - All unpaid commissions (`pending`, `eligible`, `approved`) are reversed
  - New commission is created for new affiliate
  - Old affiliate's commissions marked as `reversed`

**Example:**
- Order #123 initially attributed to Affiliate A
- Commission created for Affiliate A (status: `pending`)
- Later, order re-attributed to Affiliate B (e.g., more recent click found)
- Result:
  - Affiliate A's commission → `reversed`
  - Affiliate B's commission → `pending` (new)

## 🔍 Attribution Methods (Priority Order)

1. **Coupon Code** (Highest Priority)
   - If customer uses affiliate coupon, that affiliate gets credit
   - Overrides all other methods
   - No attribution window check (coupon is explicit action)

2. **URL Parameter Click ID** (`?click_id=abc123`)
   - Most reliable server-side method
   - Checks attribution window
   - Last-touch: if multiple clicks, most recent wins

3. **Cookie/Cart Attribute Click ID**
   - From `affiliate_click_id` cookie or cart attribute
   - Checks attribution window
   - **Important:** System checks for MOST RECENT click from ANY affiliate
   - If more recent click found, that affiliate wins (last-touch)

4. **IP + User Agent Fingerprinting**
   - Fallback when cookies fail
   - Finds most recent click from same IP/UA within window
   - Last-touch: most recent click wins

## 📊 Attribution Window Logic

### Window Calculation
```
window_start = order_date - attribution_window_days
window_end = order_date

valid_click = click_date >= window_start AND click_date <= window_end
```

### Per-Offer Windows
- Each offer can have different `attribution_window_days`
- Default: 90 days
- System uses the affiliate's current offer's window
- If affiliate has no offer, defaults to 90 days

### Example Scenarios

**Scenario 1: Within Window**
- Click: Day 1
- Purchase: Day 30
- Window: 90 days
- Result: ✅ **Attributed** (30 - 90 = -60, click is within window)

**Scenario 2: Outside Window**
- Click: Day 1
- Purchase: Day 91
- Window: 90 days
- Result: ❌ **NOT attributed** (91 - 90 = 1, click is before window start)

**Scenario 3: Multiple Clicks, Last-Touch**
- Click A: Day 1 (Affiliate A)
- Click B: Day 50 (Affiliate B)
- Purchase: Day 60
- Window: 90 days
- Result: ✅ **Affiliate B** (most recent click within window)

## 🛡️ Re-Attribution Protection

### When Re-Attribution Happens
1. Order initially attributed via cookie (older click)
2. Later, more recent click found (e.g., from URL parameter)
3. System re-attributes to new affiliate

### Commission Reversal
- Only **unpaid** commissions are reversed:
  - `pending` → `reversed`
  - `eligible` → `reversed`
  - `approved` → `reversed`
- **Paid** commissions are NOT reversed (would require clawback)
- Reversal is logged for audit trail

### Audit Trail
All re-attributions are logged:
```
Order #123 re-attributed from affiliate A to affiliate B
Reversed commission ABC123 due to re-attribution
```

## ⚠️ Important Notes

1. **Attribution Window is Strict**
   - No exceptions for clicks outside window
   - Even if cookie exists, if click is >90 days old, no commission

2. **Last-Touch Always Wins**
   - System always finds MOST RECENT click
   - Even if cookie has older click, newer click wins

3. **No Double Payment**
   - Re-attribution automatically reverses old commissions
   - Only one affiliate gets paid per order

4. **Coupon Overrides Everything**
   - If customer uses coupon, that affiliate wins
   - No last-touch check for coupons (explicit action)

## 📋 Testing Scenarios

### Test 1: Attribution Window
1. Create click on Day 1
2. Create order on Day 91
3. Expected: No attribution (outside window)

### Test 2: Last-Touch
1. Affiliate A click on Day 1
2. Affiliate B click on Day 10
3. Order on Day 15
4. Expected: Affiliate B attributed

### Test 3: Re-Attribution
1. Order attributed to Affiliate A
2. Commission created (pending)
3. Re-attribute to Affiliate B
4. Expected: Affiliate A commission reversed, Affiliate B commission created
