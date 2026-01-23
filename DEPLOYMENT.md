# Standalone Deployment Guide

This app is configured for **standalone deployment** - no Shopify App Store approval needed! 

## Architecture

- **Standalone admin login** at `affiliate.ourstore.com/login`
- **Shopify webhooks** for order/refund tracking (configured manually)
- **Single shop** - designed for your use only
- **No App Store** - bypasses 14-day approval process

## Setup Steps

### 1. Database Setup

```bash
# Run migrations
npx prisma db push

# Generate Prisma client
npx prisma generate
```

### 2. Create Admin User

**Option A: Using script**
```bash
npx tsx scripts/create-admin.ts
```

**Option B: Using API endpoint** (development only)
```bash
curl -X POST http://localhost:3000/api/admin/create-user \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourstore.com",
    "password": "secure_password",
    "name": "Admin Name",
    "shopifyShopId": "yourstore"
  }'
```

**Important:** Replace `yourstore` with your actual Shopify shop domain (without `.myshopify.com`)

### 3. Configure Environment Variables

```env
# Shopify API (for webhooks and API access)
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SCOPES=read_products,write_orders,read_orders,write_metaobjects,read_metaobjects
SHOPIFY_APP_URL=https://affiliate.ourstore.com

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/fleur_affiliates"

# Security
NEXTAUTH_SECRET=your_random_secret_here
MAGIC_LINK_SECRET=your_magic_link_secret

# Your Shopify Shop ID (without .myshopify.com)
SHOPIFY_SHOP_ID=yourstore
```

### 4. Shopify Webhook Configuration

Since we're not using App Store installation, configure webhooks manually:

1. Go to your Shopify admin → Settings → Notifications → Webhooks
2. Create webhooks pointing to your deployed app:

**Orders/Create**:
- URL: `https://affiliate.ourstore.com/api/webhooks/orders`
- Format: JSON
- API Version: Latest

**Orders/Paid**:
- URL: `https://affiliate.ourstore.com/api/webhooks/orders`
- Format: JSON
- API Version: Latest

**Refunds/Create**:
- URL: `https://affiliate.ourstore.com/api/webhooks/refunds`
- Format: JSON
- API Version: Latest

### 5. Deploy to Production

**Vercel:**
```bash
vercel --prod
```

**Fly.io:**
```bash
fly deploy
```

**Docker:**
```bash
docker build -t fleur-affiliates .
docker run -p 3000:3000 fleur-affiliates
```

### 6. Configure Subdomain

Point `affiliate.ourstore.com` to your deployed app:

**Vercel:**
1. Go to Project Settings → Domains
2. Add `affiliate.ourstore.com`
3. Update DNS records as instructed

**Cloudflare:**
1. Add CNAME record: `affiliate` → `your-app.vercel.app`

## Accessing the App

1. Visit `https://affiliate.ourstore.com/login`
2. Login with admin credentials
3. Access admin dashboard at `https://affiliate.ourstore.com/app`

## Security Notes

1. **Remove `/api/admin/create-user` route in production** or protect it with a secret token
2. **Use HTTPS** in production (required for cookies)
3. **Set strong passwords** for admin users
4. **Rotate secrets** regularly (`NEXTAUTH_SECRET`, `MAGIC_LINK_SECRET`)

## Shopify API Access

You can get API credentials from:
1. Shopify Admin → Settings → Apps and sales channels → Develop apps
2. Create a private app or custom app
3. Generate API credentials with required scopes

Or use Shopify Partners to create a private app (doesn't require App Store approval).

## Benefits of Standalone Deployment

✅ **No 14-day approval wait** - deploy immediately
✅ **Full control** - no App Store restrictions
✅ **Custom domain** - professional branding
✅ **Single shop** - simpler, more secure
✅ **Faster iteration** - no App Store review process

## Differences from App Store App

- ❌ No embedded Shopify admin UI
- ❌ No Shopify OAuth for admin (uses own auth)
- ✅ Webhooks still work (order tracking)
- ✅ Can still access Shopify API
- ✅ Simpler architecture
- ✅ Faster deployment