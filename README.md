# Fleur Affiliates - Shopify Affiliate Management Platform

A production-ready Shopify affiliate management application with subscription support, commission tracking, fraud detection, and payout management.

## Features

- **Affiliate Link Generation**: Per product, collection, or custom URL
- **Click Tracking & Attribution**: Last-click wins, coupon overrides link
- **Flexible Commission Rules**: Flat fees, percentages, subscription-aware
- **Subscription Support**: Appstle integration for recurring commission tracking
- **Net-30 Payouts**: Manual approval workflow with customizable terms
- **External Postbacks**: Server-to-server webhooks with customizable parameters
- **Refund Handling**: Automatic reversal and clawback tracking
- **Fraud Detection**: Self-referral detection, excessive clicks, high refund rates
- **Affiliate Dashboard**: Analytics, performance tracking, link management
- **Admin Dashboard**: Payout management, fraud queue, commission approvals

## Architecture

### Stack
- **Frontend**: Next.js 14 (App Router)
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: Standalone login (admin), Magic Link (affiliates)
- **Charts**: Recharts

### Deployment
**Standalone deployment** - No App Store approval needed! Deploy to your own domain (e.g., `affiliate.ourstore.com`) on Vercel or Fly.io.

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Shopify store with API access (private app or custom app)

### Installation

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Setup environment variables**:
Copy `env.example` to `.env` and fill in:
```env
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SCOPES=read_products,write_orders,read_orders,write_metaobjects,read_metaobjects
SHOPIFY_APP_URL=http://localhost:3000
SHOPIFY_SHOP_ID=yourstore
DATABASE_URL="postgresql://user:password@localhost:5432/fleur_affiliates"
NEXTAUTH_SECRET=your_random_secret
MAGIC_LINK_SECRET=your_magic_link_secret
```

3. **Setup database**:
```bash
npx prisma db push
# or
npx prisma migrate dev
```

4. **Generate Prisma client**:
```bash
npx prisma generate
```

5. **Create admin user**:
```bash
npx tsx scripts/create-admin.ts
```

6. **Run development server**:
```bash
npm run dev
```

7. **Login**: Visit `http://localhost:3000/login`

## Shopify Webhook Setup

Since this is standalone (not App Store), configure webhooks manually:

1. Go to Shopify Admin → Settings → Notifications → Webhooks
2. Create webhooks pointing to your deployed app:
   - `orders/create` → `https://affiliate.ourstore.com/api/webhooks/orders`
   - `orders/paid` → `https://affiliate.ourstore.com/api/webhooks/orders`
   - `refunds/create` → `https://affiliate.ourstore.com/api/webhooks/refunds`

See `DEPLOYMENT.md` for full deployment instructions.

## Core Domain Entities

- **Affiliate**: Affiliate accounts with payout settings
- **AffiliateLink**: Generated affiliate links
- **Click**: Click tracking with IP/user agent hashing
- **OrderAttribution**: Order-to-affiliate attribution
- **CommissionRule**: Commission calculation rules
- **Commission**: Individual commissions with status tracking
- **SubscriptionAttribution**: Subscription tracking for recurring commissions
- **PayoutRun**: Batch payout runs with manual approval
- **PostbackTemplate**: External partner webhook templates
- **FraudFlag**: Fraud detection flags

## Attribution Model

- **Last-click wins**: Most recent click attributes order
- **Coupon overrides link**: If coupon matches affiliate, it takes precedence
- **One order = one affiliate**: Each order attributed to single affiliate
- **Attribution stored in Shopify metafields**: Survives checkout

## Commission Rules

- **Flat fee**: Fixed dollar amount
- **Percentage**: Percentage of order subtotal
- **Applies to**: One-time, subscription initial, subscription rebill
- **Subscription limits**: Max payments or max months cutoff
- **Rule snapshot**: Commission stores rule at creation time

## Payout Logic

- **Default Net-30**: Commissions eligible 30 days after order
- **Manual approval required**: No auto-pay
- **Payout runs**: Group by affiliate, export CSV, mark as paid
- **Fraud flags block approval**: Must be resolved first

## Webhooks

Webhook handlers are idempotent, verify HMAC, and never double-create commissions.

### Order Webhooks
- Create order attribution
- Calculate commission
- Run fraud checks
- Handle subscription detection

### Refund Webhooks
- Reverse pending/approved commissions
- Flag paid commissions for clawback

## API Routes

- `GET /api/auth/install` - Shopify OAuth installation
- `GET /api/auth/shopify` - OAuth callback
- `GET /api/click` - Track affiliate click
- `POST /api/webhooks/orders` - Order webhook handler
- `POST /api/webhooks/refunds` - Refund webhook handler
- `GET /api/admin/stats` - Admin dashboard statistics

## Development

```bash
# Type checking
npm run type-check

# Database studio
npm run db:studio

# Migrations
npm run db:migrate
```

## Production Deployment

1. Set up PostgreSQL database (e.g., Supabase, Neon, Railway)
2. Deploy to Vercel or Fly.io
3. Configure environment variables
4. Run database migrations
5. Register app in Shopify Partners dashboard
6. Submit to Shopify App Store (optional)

## License

MIT