# Webhook 500 Error Fix

## The Problem

You're seeing 500 errors in Shopify app logs for webhook deliveries. The webhooks are being sent, but your server is returning 500 errors.

## What I Fixed

### 1. Added Null Checks

Added check for `attribution.affiliate` being null (in case affiliate was deleted):
```typescript
if (!attribution.affiliate) {
  console.log(`⚠️ Affiliate not found for attribution ${orderAttributionId} - skipping commission`);
  return NextResponse.json({ received: true });
}
```

### 2. Improved Error Handling

- Added order details to error logs for debugging
- Added Prisma error metadata logging
- Return 200 (not 500) for non-critical errors to stop Shopify retries
- Return 500 only for critical errors that should be retried

### 3. Non-Critical vs Critical Errors

**Non-Critical (Return 200 - Stop Retries):**
- Missing attribution
- Affiliate not found
- Affiliate not active
- No offer assigned

**Critical (Return 500 - Allow Retries):**
- Database connection errors
- Data validation errors
- Unexpected errors

## How to Debug

### Check Your Server Logs

When a 500 error occurs, you'll now see:
```
❌ Order webhook error: [error details]
   Error name: [error type]
   Error message: [error message]
   Error stack: [stack trace]
   Order ID: [order id]
   Order Number: [order number]
   Financial Status: [status]
   Prisma error code: [if database error]
   Prisma error meta: [error metadata]
```

### Common Causes

1. **Missing Attribution** - Order not from affiliate (returns 200 now, not 500)
2. **Database Error** - Connection issue or constraint violation
3. **Missing Affiliate** - Affiliate was deleted but attribution still exists
4. **Missing Offer** - Affiliate has no offer assigned

## Next Steps

1. **Restart your server** to apply the fixes
2. **Check server logs** when the next webhook arrives
3. **Look for the detailed error messages** to identify the exact issue
4. **The errors should now be more informative** and stop retrying for non-critical issues

## Summary

- ✅ Added null checks for deleted affiliates
- ✅ Improved error logging with order details
- ✅ Return 200 for non-critical errors (stops retries)
- ✅ Return 500 only for critical errors (allows retries)
- ✅ Better debugging information

The 500 errors should now be resolved, or at least you'll get better error messages to identify the issue!
