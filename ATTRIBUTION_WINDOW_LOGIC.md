# Attribution Window Logic - Per-Affiliate Windows

## Question: Different Attribution Windows

**Scenario:**
- Affiliate A: 90-day attribution window
- Affiliate B: 30-day attribution window
- Last touch: Affiliate B, 32 days ago
- Order: Today

**Who gets the sale?**

## Answer: Affiliate A (if they have a valid click)

### Logic

1. **Find all clicks** within maximum window (90 days)
2. **Sort by most recent** (last-touch priority)
3. **Check each click's OWN attribution window:**
   - Affiliate B's click (32 days ago):
     - Is 32 days <= 30 days? ❌ NO
     - **Result:** Invalid (outside Affiliate B's 30-day window)
   - Affiliate A's click (if exists, e.g., 50 days ago):
     - Is 50 days <= 90 days? ✅ YES
     - **Result:** Valid (within Affiliate A's 90-day window)
4. **Attribute to most recent VALID click:** Affiliate A

### Key Rule

**Each affiliate's click is validated against THEIR OWN attribution window.**

- Last-touch wins, BUT only if that click is within its affiliate's window
- If last-touch is outside its window, check next most recent click
- Continue until finding a click within its affiliate's window

## Examples

### Example 1: Last-Touch Outside Window

**Timeline:**
- Day 1: Affiliate A click (90-day window)
- Day 10: Affiliate B click (30-day window)
- Day 45: Order placed

**Calculation:**
- Affiliate B (last touch, 35 days ago):
  - 35 days <= 30 days? ❌ NO
  - Invalid
- Affiliate A (35 days ago):
  - 35 days <= 90 days? ✅ YES
  - Valid

**Result:** Affiliate A gets commission

### Example 2: Last-Touch Within Window

**Timeline:**
- Day 1: Affiliate A click (90-day window)
- Day 10: Affiliate B click (30-day window)
- Day 25: Order placed

**Calculation:**
- Affiliate B (last touch, 15 days ago):
  - 15 days <= 30 days? ✅ YES
  - Valid

**Result:** Affiliate B gets commission (last-touch wins)

### Example 3: Both Outside Windows

**Timeline:**
- Day 1: Affiliate A click (90-day window)
- Day 10: Affiliate B click (30-day window)
- Day 100: Order placed

**Calculation:**
- Affiliate B (last touch, 90 days ago):
  - 90 days <= 30 days? ❌ NO
  - Invalid
- Affiliate A (99 days ago):
  - 99 days <= 90 days? ❌ NO
  - Invalid

**Result:** No attribution (both clicks outside their windows)

## Implementation

The system:
1. Finds all clicks within maximum window (90 days default)
2. Sorts by `created_at DESC` (most recent first)
3. For each click, checks: `isWithinAttributionWindow(click_date, order_date, click.affiliate.offer.attribution_window_days)`
4. Uses first valid click (most recent valid click wins)

## Code Logic

```typescript
// Find all candidate clicks (within max window)
const candidateClicks = await prisma.click.findMany({
  where: {
    created_at: { gte: maxWindowStart, lte: orderDate },
  },
  orderBy: { created_at: 'desc' }, // Most recent first
});

// Check each click's OWN attribution window
for (const click of candidateClicks) {
  const windowDays = click.affiliate.offer?.attribution_window_days || 90;
  if (isWithinAttributionWindow(click.created_at, orderDate, windowDays)) {
    // Valid click - use it (most recent valid wins)
    return click;
  }
}
```

## Summary

- ✅ **Last-touch wins** (most recent click)
- ✅ **BUT only if within that affiliate's window**
- ✅ **If last-touch is outside window, check next most recent**
- ✅ **Each affiliate's window is checked independently**

This ensures:
- Fair attribution (affiliates with longer windows can still get credit)
- No double payment (only one affiliate wins)
- Window enforcement (affiliates can't claim sales outside their window)
