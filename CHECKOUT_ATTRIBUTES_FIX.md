# Checkout Attributes Persistence Fix

## The Problem

According to ChatGPT's insight:
- ✅ Cart attributes CAN persist through checkout **if set BEFORE checkout begins**
- ❌ If set AFTER checkout starts, they may not persist
- Cart attributes show up as `order.note_attributes` (not `order.attributes`)

## What I Fixed

### 1. Added Checkout Button Interception

Added listeners to catch checkout button clicks and form submissions **before** checkout begins:

```javascript
// Intercept checkout button clicks
document.addEventListener('click', function(e) {
  const checkoutButton = target.closest('a[href*="/checkout"], button[type="submit"], ...');
  if (checkoutButton) {
    // Set attributes IMMEDIATELY before checkout
    // Uses sendBeacon for reliable delivery
  }
}, true); // Capture phase - catches early
```

### 2. Uses `sendBeacon` API

Uses `navigator.sendBeacon()` which:
- ✅ Doesn't block page navigation
- ✅ More reliable than fetch for page unloads
- ✅ Guaranteed to send even if page closes

### 3. Already Checking `note_attributes`

The webhook handler already checks `order.note_attributes` (where cart attributes appear):

```typescript
const clickIdFromNoteAttributes = order.note_attributes?.find(
  (attr: any) => attr.name === 'affiliate_click_id'
)?.value;
```

## How It Works

1. **Page Load**: Sets attributes on cart
2. **Cart Updates**: Updates attributes when cart changes
3. **Checkout Click**: **CRITICAL** - Sets attributes RIGHT BEFORE checkout begins
4. **Checkout Form**: Also sets on form submission
5. **Webhook**: Reads from `order.note_attributes`

## Testing

1. Visit: `https://tryfleur.com/?ref=30484`
2. Add product to cart
3. Click checkout button
4. Check browser console - should see: `"Checkout button clicked - ensuring cart attributes are set"`
5. Complete checkout
6. Check webhook logs - should see `note_attributes` populated

## Summary

- ✅ **Intercepts checkout clicks** - Sets attributes before checkout begins
- ✅ **Uses sendBeacon** - More reliable delivery
- ✅ **Checks note_attributes** - Where cart attributes appear in webhook
- ✅ **Multiple fallbacks** - Still has IP fingerprinting, recent click lookup, etc.

This should ensure attributes persist through checkout!
