# How to Reverse a Paid Payout

## Quick Fix: Reverse Paid Commissions

If you accidentally marked commissions as "paid" and need to reverse them, you can use the reverse endpoint.

### Option 1: Using the API Directly (Quick Fix)

You can call the reverse endpoint directly. First, find the commission IDs that were paid:

```bash
# Find the commission IDs (you'll need to query your database or check the payout run)
# Then call the reverse endpoint:

curl -X POST https://yourdomain.com/api/admin/payouts/reverse \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_session=your_session_cookie" \
  -d '{
    "commission_ids": ["commission_id_1", "commission_id_2"],
    "reason": "Payment failed, need to retry"
  }'
```

### Option 2: Using Database Query (If you know the affiliate)

If you know which affiliate was paid, you can find their commission IDs:

```sql
-- Find paid commissions for a specific affiliate
SELECT id, amount, status, shopify_order_id, created_at
FROM Commission
WHERE affiliate_id = 'affiliate_id_here'
  AND status = 'paid'
  AND created_at > '2024-01-01'  -- Adjust date as needed
ORDER BY created_at DESC;
```

Then use those IDs in the reverse endpoint.

### Option 3: Add Reverse Button to UI (Recommended)

The reverse endpoint is ready at `/api/admin/payouts/reverse`. You can add a reverse button to the Payout Runs tab or create a simple admin tool.

## What the Reverse Endpoint Does

1. Verifies commissions are in "paid" status
2. Changes status back to "eligible" (so they appear in payouts again)
3. Deletes PayoutRunCommission records
4. Returns details of what was reversed

## Example Response

```json
{
  "success": true,
  "message": "Commissions reversed successfully",
  "reversed_count": 2,
  "total_amount": "83.00",
  "currency": "USD",
  "reason": "Reversed by admin",
  "commissions": [
    {
      "id": "commission_id_1",
      "affiliate_name": "John Doe",
      "affiliate_email": "john@example.com",
      "amount": "41.50",
      "order_id": "12345"
    }
  ]
}
```

## Next Steps After Reversing

1. The commissions will now appear in the "Payouts" tab again
2. You can retry the payment
3. If integrating PayPal, the commissions will be ready for automatic payment
