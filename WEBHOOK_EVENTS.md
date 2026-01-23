# Shopify Webhook Events Configuration

## Available Webhook Events

Shopify's webhook event dropdown shows different names than the API topic names. Here's what to use:

### Recommended Webhook Events

**1. Order Creation**
- **In Dropdown:** Select `Order creation`
- **API Topic:** `orders/create` (what Shopify sends in webhook header)
- **When it fires:** When an order is first created
- **What we do:** Attribute order to affiliate (no commission yet)
- **If order is already paid:** Also creates commission immediately

**2. Order Update**
- **In Dropdown:** Select `Order update`
- **API Topic:** `orders/updated` (what Shopify sends in webhook header)
- **When it fires:** When order status changes, including when payment is received
- **What we do:** Check if `financial_status === 'paid'`, then create commission

**3. Order Payment (if available)**
- **In Dropdown:** Select `Order payment` (if this option exists)
- **API Topic:** `order/payment` (what Shopify sends in webhook header)
- **When it fires:** When payment is received
- **What we do:** Create commission (order is guaranteed to be paid)

## How the Code Handles Events

The webhook handler accepts multiple event types:

```typescript
// Accepted events:
- 'orders/create' → Attributes order (checks if paid, creates commission if already paid)
- 'orders/updated' → Checks financial_status, creates commission if paid
- 'order/payment' → Creates commission (if available in your Shopify version)
```

## Configuration in Shopify Admin

### Recommended Setup: "Order creation" + "Order update"

**Webhook 1: Order Creation**
- **Event (in dropdown):** `Order creation`
- **URL:** `https://yourdomain.com/api/webhooks/orders` (or ngrok URL for testing)
- **Format:** JSON
- **API Version:** 2026-01 latest (or 2025-10 for stability)

**Webhook 2: Order Update**
- **Event (in dropdown):** `Order update`
- **URL:** `https://yourdomain.com/api/webhooks/orders` (same URL as above)
- **Format:** JSON
- **API Version:** 2026-01 latest (or 2025-10 for stability)

**How it works:**
1. `Order creation` fires → System attributes order to affiliate
2. If order is already paid → System creates commission immediately
3. `Order update` fires when payment received → System checks `financial_status === 'paid'` → Creates commission

### Alternative: Use "Order payment" (if available in dropdown)

If your Shopify dropdown has `Order payment` option:

**Webhook 1: Order Creation**
- **Event:** `Order creation`
- **URL:** `https://yourdomain.com/api/webhooks/orders`
- **Format:** JSON
- **API Version:** 2026-01 latest

**Webhook 2: Order Payment**
- **Event:** `Order payment` (if this option exists)
- **URL:** `https://yourdomain.com/api/webhooks/orders`
- **Format:** JSON
- **API Version:** 2026-01 latest

**Note:** The code handles both event names automatically, so either setup works.

## Order Financial Status

The code checks `order.financial_status` to determine if order is paid:

- `'paid'` → Order is fully paid → Create commission ✅
- `'partially_paid'` → Order is partially paid → Create commission ✅
- `'pending'` → Payment pending → No commission ❌
- `'refunded'` → Order refunded → No commission ❌

## Testing

After setting up webhooks:

1. Create a test order in Shopify
2. Check webhook delivery logs in Shopify Admin
3. Check your server logs for: `Webhook received: [topic], Order: [number], Financial Status: [status]`
4. Verify commission is created when `financial_status === 'paid'`

## Troubleshooting

### Webhook Not Firing
- Check webhook is enabled in Shopify Admin
- Verify URL is correct and accessible
- Check webhook delivery logs in Shopify Admin

### Commission Not Created
- Check `financial_status` in order webhook payload
- Verify order is marked as `paid` in Shopify
- Check server logs for webhook receipt

### Duplicate Commissions
- Code has idempotency check (prevents duplicates)
- If duplicates occur, check if webhook is firing multiple times
- Verify `existingCommission` check is working
