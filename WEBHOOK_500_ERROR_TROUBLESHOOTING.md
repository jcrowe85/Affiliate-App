# Webhook 500 Error Troubleshooting

## The Problem

You're seeing a **500 Internal Server Error** when testing the webhook endpoint. This means the request reached your server but something failed during processing.

## Common Causes

### 1. JSON Parse Error

**Symptoms:**
- Error in logs: `JSON Parse Error`
- Body might be malformed or empty

**Solution:**
- Check that the request body is valid JSON
- Verify ngrok isn't modifying the body
- Check server logs for the actual error

### 2. Database Connection Issues

**Symptoms:**
- Error: `PrismaClientKnownRequestError`
- Database queries failing

**Solution:**
- Check `DATABASE_URL` in `.env`
- Verify database is accessible
- Check Prisma client is generated: `npx prisma generate`

### 3. Missing Environment Variables

**Symptoms:**
- Error: `SHOPIFY_API_SECRET not set`
- Functions expecting env vars fail

**Solution:**
- Verify all required env vars are set
- Restart server after updating `.env`

### 4. Missing Required Fields in Order Object

**Symptoms:**
- Error accessing `order.order_number` or similar
- Order object structure doesn't match expected format

**Solution:**
- Check the test payload matches Shopify's format
- Verify all required fields are present

## How to Debug

### Step 1: Check Server Logs

Look for detailed error messages:
```
❌ Order webhook error: [error details]
   Error name: [error type]
   Error message: [specific message]
   Error stack: [full stack trace]
```

### Step 2: Test Locally First

Before testing with ngrok, test locally:

```bash
# Start your server
npm run dev

# In another terminal, test locally
npm run test:webhook http://localhost:3000/api/webhooks/orders
```

### Step 3: Check ngrok Status

The 404 error suggests ngrok might not be running or the URL is wrong:

```bash
# Check if ngrok is running
curl http://localhost:4040/api/tunnels

# Or check ngrok dashboard
# http://localhost:4040
```

### Step 4: Verify Request Format

Make sure your test script sends the request in the correct format. The webhook expects:
- `Content-Type: application/json`
- `X-Shopify-Hmac-Sha256` header
- `X-Shopify-Topic` header
- `X-Shopify-Shop-Domain` header
- Valid JSON body

## Enhanced Error Logging

The webhook handler now includes:
- ✅ JSON parse error handling
- ✅ Database error detection
- ✅ Validation error detection
- ✅ Detailed stack traces (in development)
- ✅ Safe field access (won't crash on missing fields)

## Next Steps

1. **Check your server logs** - Look for the detailed error messages
2. **Test locally first** - Verify it works without ngrok
3. **Check ngrok status** - Make sure tunnel is active
4. **Verify request format** - Ensure test script matches Shopify's format

## Common Error Messages

### "Invalid JSON in webhook body"
- **Cause:** Body is not valid JSON
- **Fix:** Check request body format

### "Database error: ..."
- **Cause:** Prisma/database issue
- **Fix:** Check database connection and schema

### "Validation error: ..."
- **Cause:** Data doesn't match expected format
- **Fix:** Check order object structure

### "Webhook secret not configured"
- **Cause:** `SHOPIFY_API_SECRET` missing
- **Fix:** Add to `.env` and restart server
