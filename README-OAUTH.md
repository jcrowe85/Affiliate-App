# OAuth Installation Guide

This guide explains how to complete the Shopify OAuth installation to get your admin and storefront access tokens.

## Prerequisites

1. ✅ You've created a Shopify app in the Shopify Partners Dashboard
2. ✅ You have your `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` in your `.env` file
3. ✅ Your app is running (locally or deployed)

## Step-by-Step Installation

### 1. Configure App Settings in Shopify Partners

1. Go to [Shopify Partners Dashboard](https://partners.shopify.com/)
2. Select your app
3. Go to **App setup** → **App URL**

Set these URLs:

**App URL:**
```
https://affiliate.ourstore.com/app
```
(or your actual domain)

**Allowed redirection URL(s):**
```
https://affiliate.ourstore.com/api/auth/shopify
```
(or your actual domain)

### 2. Start OAuth Flow

Install your app by visiting:

```
http://localhost:3000/api/auth/install?shop=163bfa-5f.myshopify.com
```

**Replace:**
- `localhost:3000` with your actual domain in production
- `163bfa-5f.myshopify.com` with your actual shop domain

Or for production:
```
https://affiliate.ourstore.com/api/auth/install?shop=163bfa-5f.myshopify.com
```

### 3. Complete OAuth Flow

1. **You'll be redirected to Shopify** to authorize the app
2. **Click "Install app"** in Shopify
3. **Shopify redirects back** to `/api/auth/shopify` with an authorization code
4. **Our app exchanges the code** for access tokens
5. **Tokens are stored** in the database
6. **You'll be redirected** to `/api/auth/shopify/success` showing confirmation

### 4. Verify Tokens Were Stored

After successful installation, you should see:

```json
{
  "success": true,
  "message": "OAuth authentication successful! Tokens have been stored.",
  "shop": "163bfa-5f.myshopify.com",
  "admin_token_preview": "shpat_cf56fed...",
  "storefront_token_preview": "3a5402ed31...",
  "scope": "read_products,write_orders,read_orders,write_metaobjects,read_metaobjects"
}
```

### 5. Get Storefront Access Token

The **Storefront API access token** needs to be generated separately:

1. Go to your Shopify Admin → **Settings** → **Apps and sales channels**
2. Click **Develop apps** → Select your app
3. Go to **API credentials** tab
4. Under **Storefront API**, click **Configure**
5. Copy the **Storefront API access token**

Then add it to your `.env`:
```env
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_storefront_token_here
```

### 6. Update Your .env File

After OAuth installation, update your `.env` with the tokens from the database:

```env
# These are automatically stored during OAuth
# You can retrieve them from the ShopifySession table or use them from the API
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxx  # From OAuth callback
SHOPIFY_STOREFRONT_ACCESS_TOKEN=xxxxx   # From Shopify Admin → App → API Credentials
```

## Troubleshooting

### Error: "Missing shop or code parameter"
- Make sure you're accessing the callback URL with proper query parameters
- Check that your redirect URL is correctly configured in Shopify Partners

### Error: "Failed to obtain access token"
- Verify your `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` are correct
- Check that the authorization code hasn't expired (codes expire quickly)
- Ensure your app has the required scopes configured

### Error: "Invalid HMAC"
- Webhook HMAC verification uses `SHOPIFY_API_SECRET`
- Make sure this matches your app's secret key

### Tokens Not Stored
- Check database connection
- Verify Prisma migrations have run: `npx prisma db push`
- Check server logs for detailed error messages

## What Gets Stored

After successful OAuth, the following is stored in the `ShopifySession` table:

- `shop`: Your shop domain
- `access_token`: Admin API access token (from OAuth)
- `storefront_access_token`: Storefront API access token (from .env or manual)
- `scope`: Permissions granted
- `expires`: Token expiration date

## Next Steps

After completing OAuth:

1. ✅ Verify tokens are stored
2. ✅ Configure webhooks (see `DEPLOYMENT.md`)
3. ✅ Test affiliate link tracking
4. ✅ Create your first commission rule
5. ✅ Set up affiliate accounts

## Production Notes

- Use HTTPS in production (required for OAuth)
- Keep `SHOPIFY_API_SECRET` secure (never commit to git)
- Rotate tokens periodically if needed
- Monitor token expiration dates