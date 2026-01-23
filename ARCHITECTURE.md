# Architecture Decision: Standalone vs Shopify App Store

## Current Implementation: **Standalone Deployment (No App Store)**

**Note:** This app is configured for **standalone deployment** for your use only. No App Store approval needed!

## Why Standalone?

### ✅ Benefits

1. **No 14-Day Approval Wait**
   - Deploy immediately
   - No App Store review process
   - Faster iteration

2. **Full Control**
   - No App Store restrictions
   - Custom branding and domain
   - Single shop simplicity

3. **Simpler Architecture**
   - Standalone admin authentication
   - No embedded UI complexity
   - Direct API access

4. **Professional Setup**
   - Custom subdomain: `affiliate.ourstore.com`
   - Your own login page
   - Full control over user experience

Build this as a **Shopify embedded app** that can be installed from the Shopify App Store, but host it on your own infrastructure (Vercel, Fly.io, etc.).

## Why Shopify App?

### ✅ Benefits

1. **App Store Distribution**
   - Merchants can discover and install from Shopify App Store
   - Built-in trust and credibility
   - SEO and marketing benefits

2. **Seamless Integration**
   - Embedded admin UI inside Shopify (no context switching)
   - Native OAuth flow (Shopify handles authentication)
   - Access to Shopify Admin APIs and GraphQL
   - Webhook delivery system built-in

3. **Merchant Experience**
   - Installs with one click
   - Automatic updates via App Store
   - Integrated billing (if you use Shopify billing)

4. **Technical Advantages**
   - Shopify handles session management
   - Built-in HMAC verification for webhooks
   - App Bridge for embedded UI components
   - Access to Shopify's CDN and infrastructure

### ✅ External Hosting Benefits

1. **Full Control**
   - Choose your own stack (Next.js, PostgreSQL, etc.)
   - No Shopify runtime limitations
   - Deploy to Vercel, Fly.io, AWS, etc.
   - Use your own domain

2. **Scalability**
   - Scale independently from Shopify
   - Optimize for your specific workload
   - Use your own database and caching

3. **Flexibility**
   - Add features not tied to Shopify
   - Integrate with external services
   - Custom authentication for affiliates (magic links)

4. **Cost Control**
   - No per-store hosting fees
   - Optimize infrastructure costs
   - Use free tiers where possible

## Architecture

```
┌─────────────────────────────────────────┐
│     Shopify App Store / Admin          │
│  (Merchant installs your app)          │
└──────────────┬──────────────────────────┘
               │ OAuth
               ▼
┌─────────────────────────────────────────┐
│     Your App (Next.js on Vercel)       │
│  - Admin Dashboard (embedded)          │
│  - Affiliate Portal                    │
│  - API Routes                          │
│  - Webhook Handlers                    │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌─────────────┐   ┌─────────────┐
│ PostgreSQL  │   │  Shopify    │
│  Database   │   │  Storefront │
└─────────────┘   └─────────────┘
```

## Implementation Details

### 1. **App Type**: Embedded App
- Uses Shopify App Bridge for embedded UI
- Admin dashboard renders inside Shopify admin
- Affiliate portal can be separate (standalone page)

### 2. **OAuth Flow**
- Merchant clicks "Install" in App Store
- Redirects to your OAuth endpoint (`/api/auth/install`)
- Shopify handles authentication
- You store session in database

### 3. **Webhooks**
- Shopify sends webhooks to your endpoints
- You verify HMAC for security
- Process orders, refunds, etc.

### 4. **Embedded UI**
- Admin dashboard uses Polaris (Shopify's design system)
- Renders inside Shopify admin iframe
- Uses App Bridge for navigation

## Setup Steps

1. **Create Shopify Partner Account**
   - Go to partners.shopify.com
   - Create new app
   - Set app URL and redirect URLs

2. **Configure App Settings**
   - App URL: `https://your-domain.com/app`
   - Allowed redirection URLs:
     - `https://your-domain.com/api/auth/shopify`
   - Webhook endpoints:
     - `orders/create` → `https://your-domain.com/api/webhooks/orders`
     - `orders/paid` → `https://your-domain.com/api/webhooks/orders`
     - `refunds/create` → `https://your-domain.com/api/webhooks/refunds`

3. **Install Webhooks**
   - After OAuth install, register webhooks via Admin API
   - Store webhook subscriptions

4. **Deploy to Production**
   - Deploy Next.js app to Vercel/Fly.io
   - Set environment variables
   - Run database migrations
   - Test OAuth flow

5. **Submit to App Store** (optional)
   - Create app listing
   - Add screenshots and description
   - Submit for review
   - Merchants can then install from App Store

## Alternative: Standalone App

If you **don't** want to be in the App Store:

- Skip App Store submission
- Merchant installs via direct link
- Still use OAuth and webhooks
- Same technical implementation
- Just missing App Store distribution

## Recommendation

**Build as Shopify embedded app hosted externally.** This gives you:
- ✅ App Store distribution (optional)
- ✅ Native Shopify integration
- ✅ Full control over infrastructure
- ✅ Best of both worlds

The codebase is already set up for this architecture!