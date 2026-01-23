# How Attribution Works - Simple Explanation

## 📍 Step-by-Step Flow

### 1. Customer Clicks Affiliate Link

**Example:** Customer clicks `yoursite.com/ref/30483`

**What Happens:**
- System finds affiliate by `affiliate_number` (30483)
- Generates unique `click_id` (e.g., `abc123xyz`)
- **Logs click to database** (server-side, permanent record):
  ```
  Click Record:
  - click_id: "abc123xyz"
  - affiliate_id: "affiliate-uuid"
  - created_at: "2024-01-01 10:00:00"
  - ip_hash: "hashed-ip"
  - user_agent_hash: "hashed-ua"
  ```
- Sets cookies (30 days): `affiliate_click_id=abc123xyz`
- Adds URL parameters: `?ref=30483&click_id=abc123xyz`
- Redirects customer to site

**Key Point:** The click is **immediately logged to database** - this is permanent, server-side tracking.

### 2. Customer Browses Site (Days 1-89)

- Cookies persist (30 days)
- URL parameters may persist if customer shares link
- **Database still has the click record** (permanent)

### 3. Customer Purchases (Order Created)

**Example:** Customer purchases on Day 30

**What Happens:**
- Shopify sends `orders/create` webhook
- System extracts tracking data:
  - From cookie: `affiliate_click_id=abc123xyz`
  - From cart attribute: `affiliate_click_id=abc123xyz`
  - From URL referrer: `?click_id=abc123xyz`
- Looks up click in database: `click_id = "abc123xyz"`
- **Checks attribution window:**
  ```
  order_date = Day 30
  click_date = Day 1
  window = 90 days
  
  window_start = Day 30 - 90 = Day -60 (90 days before order)
  window_end = Day 30 (order date)
  
  Is click_date (Day 1) within window?
  Day 1 >= Day -60 AND Day 1 <= Day 30
  ✅ YES - Within window
  ```
- Attributes order to affiliate
- Creates `OrderAttribution` record

### 4. Order Paid (Commission Created)

**What Happens:**
- Shopify sends `orders/paid` webhook
- System gets `OrderAttribution` for this order
- Gets affiliate's `Offer`
- Calculates commission
- Creates `Commission` record (status: `pending`)

## 🎯 Attribution Window Logic

### The Rule
**Commission is paid ONLY if:**
```
click_date >= (order_date - attribution_window_days)
AND
click_date <= order_date
```

### Examples

**Example 1: Within Window ✅**
- Click: Day 1
- Order: Day 30
- Window: 90 days
- Calculation: Day 1 >= (Day 30 - 90) = Day 1 >= Day -60 ✅
- Result: **Commission paid**

**Example 2: Outside Window ❌**
- Click: Day 1
- Order: Day 91
- Window: 90 days
- Calculation: Day 1 >= (Day 91 - 90) = Day 1 >= Day 1 ✅ BUT...
- Wait, let's check: Day 1 is exactly 90 days before Day 91
- Actually: Day 91 - 90 = Day 1, so Day 1 >= Day 1 ✅
- But the window is 90 days, so Day 1 to Day 91 is 90 days
- **Actually, this IS within window** (90 days inclusive)

**Example 3: Outside Window ❌**
- Click: Day 1
- Order: Day 92
- Window: 90 days
- Calculation: Day 1 >= (Day 92 - 90) = Day 1 >= Day 2 ❌
- Result: **NO commission** (click is 91 days old, outside 90-day window)

**Example 4: Edge Case - Exactly 90 Days**
- Click: Day 1 at 10:00 AM
- Order: Day 91 at 9:00 AM
- Window: 90 days
- Calculation: Day 1 >= (Day 91 - 90) = Day 1 >= Day 1 ✅
- But: Order is at 9:00 AM, click was at 10:00 AM
- If using timestamps: Click is 90 days + 1 hour old
- Result: **NO commission** (slightly over 90 days)

## 🔄 Multiple Attribution Methods

The system doesn't rely on just URL parameters. It uses multiple methods:

### Method 1: Cookie/Cart Attribute
- Customer clicks link → cookie set
- Cookie persists for 30 days
- On checkout, theme script reads cookie → sets cart attribute
- Webhook receives cart attribute → looks up click by `click_id`

### Method 2: URL Parameter
- Customer clicks link → URL has `?ref=30483&click_id=abc123`
- If customer shares link or bookmark, URL params persist
- On order, system checks referrer URL for `click_id`
- Looks up click in database

### Method 3: IP + User Agent Fingerprinting
- If cookies fail, system uses IP + User Agent
- Hashes IP and User Agent
- Searches for recent clicks (within window) with matching hash
- Finds most recent click → attributes

### Method 4: Last-Touch Logic
- If multiple clicks exist (from different affiliates):
  - System finds ALL clicks within attribution window
  - Sorts by `created_at DESC` (most recent first)
  - **Most recent click wins** (last-touch attribution)

## 📊 Database Records

### Click Record (Permanent)
```sql
Click {
  id: "abc123xyz"
  affiliate_id: "affiliate-uuid"
  created_at: "2024-01-01 10:00:00"
  ip_hash: "hashed-ip"
  user_agent_hash: "hashed-ua"
  landing_url: "/"
}
```

### Order Attribution Record
```sql
OrderAttribution {
  shopify_order_id: "12345"
  affiliate_id: "affiliate-uuid"
  click_id: "abc123xyz"  -- Links to Click record
  attribution_type: "link"
  created_at: "2024-01-30 15:00:00"
}
```

### Commission Record
```sql
Commission {
  affiliate_id: "affiliate-uuid"
  order_attribution_id: "attribution-uuid"
  amount: 50.00
  status: "pending"
  created_at: "2024-01-30 15:05:00"
}
```

## ✅ Key Points

1. **Every click is logged server-side** - permanent database record
2. **Attribution window is strict** - clicks outside 90 days are ignored
3. **Last-touch wins** - most recent click within window gets credit
4. **Multiple fallback methods** - not just URL parameters
5. **Window check happens on order** - not on click

## 🚨 Important Clarifications

### Window Calculation
The window is: **90 days BEFORE the order date**
- Not "90 days from click"
- Not "90 days after click"
- It's: "order date minus 90 days"

### Click Date vs Order Date
- Click date: When customer clicked affiliate link
- Order date: When customer placed order
- Window: Order date - 90 days <= Click date <= Order date

### Multiple Clicks
If customer clicks multiple affiliate links:
- All clicks are logged
- On order, system finds ALL clicks within window
- **Most recent click wins** (last-touch)
- Older clicks are ignored

## 📝 Summary

**Your Understanding:**
> "System tracks every click with URL parameter affiliate ref id, logs them, compares using attribution window, only pays if click is less than 90 days from order date"

**Corrected Understanding:**
1. ✅ System tracks every click (not just URL params - also cookies, fingerprinting)
2. ✅ Logs them to database (server-side, permanent)
3. ✅ Compares using attribution window (90 days BEFORE order date)
4. ✅ Only pays if click is within 90 days BEFORE order date (not "less than 90 days from order" - it's "within 90 days before order")
5. ✅ Last-touch: most recent click within window wins

**The Key Difference:**
- Window is: `order_date - 90 days <= click_date <= order_date`
- Not: `click_date + 90 days >= order_date`
- Both are mathematically equivalent, but the first is clearer: "click must be within 90 days before order"
