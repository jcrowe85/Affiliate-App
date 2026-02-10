# Enabling PayPal Payouts API Permission

## Problem
You're seeing the error: **"PayPal API credentials are invalid"** or **"PayPal API access forbidden"**, but your credentials are correct. This is because the **Payouts API permission** is not enabled for your PayPal app.

## Solution: Enable Payouts Permission

### Step 1: Log into PayPal Developer Dashboard
1. Go to [https://developer.paypal.com/](https://developer.paypal.com/)
2. Log in with your PayPal business account credentials

### Step 2: Navigate to Your App
1. Click on **"Dashboard"** in the top navigation
2. Under **"My Apps & Credentials"**, find your app (or create a new one if needed)
3. Click on your app name to open it

### Step 3: Enable Payouts Permission
1. Click on the **"Permissions"** tab (or look for "Features" or "APIs" tab)
2. Find **"Payouts"** in the list of available permissions
3. Click the toggle or checkbox to **enable** it
4. You may need to:
   - Accept terms and conditions
   - Complete identity verification (if required)
   - Wait for approval (can take a few minutes to 24 hours)

### Step 4: Verify Permission is Enabled
1. Check that **"Payouts"** shows as **"Enabled"** or **"Granted"** (not "Denied")
2. The status should change from:
   - ❌ **Denied** → ✅ **Enabled/Granted**

### Step 5: Test Again
1. Wait a few minutes for the permission to propagate
2. Try processing a payout again from your dashboard
3. The error should be resolved

## Important Notes

### Sandbox vs Live
- **Sandbox**: Payouts permission is usually enabled by default for testing
- **Live**: Requires explicit approval and may need business verification

### Business Account Required
- Payouts API requires a **PayPal Business Account** (not Personal)
- You may need to upgrade your account if you're using a Personal account

### Approval Time
- Sandbox: Usually instant
- Live: Can take a few minutes to 24 hours depending on account verification status

## Troubleshooting

### If Permission is Still Denied After Enabling
1. **Check Account Status**: Ensure your PayPal business account is fully verified
2. **Contact PayPal Support**: If the permission won't enable, contact PayPal Developer Support
3. **Verify App Type**: Ensure you're using a "REST API" app, not a "Classic" app

### If You Don't See the Permissions Tab
1. Make sure you're viewing the **Live** app (not Sandbox)
2. Some older apps may need to be recreated
3. Try creating a new app and enabling permissions from the start

### Alternative: Check via API
You can verify permissions by checking your app's scopes:
```bash
curl -X POST https://api.paypal.com/v1/oauth2/token \
  -H "Accept: application/json" \
  -H "Accept-Language: en_US" \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -d "grant_type=client_credentials"
```

Look for `"scope"` in the response - it should include something like `"https://api.paypal.com/v1/payments/payouts"`

## Verification Checklist
- [ ] Logged into PayPal Developer Dashboard
- [ ] Found your app under "My Apps & Credentials"
- [ ] Opened the "Permissions" tab
- [ ] Enabled "Payouts" permission
- [ ] Status shows "Enabled" or "Granted" (not "Denied")
- [ ] Waited a few minutes for propagation
- [ ] Tested a payout and it works

## Still Having Issues?
If you've completed all steps and still see errors:
1. Double-check your `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env`
2. Verify `PAYPAL_MODE=live` (not `sandbox`)
3. Check server logs for the exact PayPal error response
4. Contact PayPal Developer Support with your app ID and error details
