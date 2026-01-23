# Pre-Testing Checklist

## ✅ Completed Items

1. ✅ **One offer per affiliate** - Implemented
2. ✅ **Offer-based commission system** - Implemented
3. ✅ **Attribution window enforcement** - Implemented (90 days, per-offer)
4. ✅ **Last-touch attribution** - Implemented
5. ✅ **No double payment** - Implemented (reverses old commissions)
6. ✅ **Internal traffic detection** - Implemented
7. ✅ **Organic search detection** - Implemented
8. ✅ **Redundant attribution methods** - Implemented (cart attributes, URL params, IP/UA fingerprinting)
9. ✅ **Theme script** - You've added this ✅

## 🔍 Pre-Testing Requirements

### 1. Database Setup

**Check if schema is synced:**
```bash
# Check if database is up to date
npx prisma db push

# Or if using migrations
npx prisma migrate deploy
```

**Verify these fields exist:**
- `Affiliate.affiliate_number` (for `/ref/30483` links)
- `Affiliate.offer_id` (one offer per affiliate)
- `Offer.offer_number` (short IDs starting at 29332)
- `Offer.attribution_window_days` (default 90)
- `Click` table with `ip_hash` and `user_agent_hash`

### 2. Shopify Webhook Configuration

**Required webhooks in Shopify Admin:**
1. Go to: **Settings → Notifications → Webhooks**
2. Create these webhooks:

**Webhook 1: Order Creation**
- **Event (in dropdown):** `Order creation`
- URL: `https://yourdomain.com/api/webhooks/orders` (or ngrok URL for localhost testing)
- Format: JSON
- API Version: **2026-01 latest** (or 2025-10 for stability)
- **Note:** Shopify sends this as `orders/create` in the webhook header

**Webhook 2: Order Update**
- **Event (in dropdown):** `Order update` (or `Order payment` if available)
- URL: `https://yourdomain.com/api/webhooks/orders` (same URL as above)
- Format: JSON
- API Version: **2026-01 latest** (or 2025-10 for stability)
- **Note:** Shopify sends this as `orders/updated` or `order/payment` in the webhook header
- **How it works:** System checks `order.financial_status === 'paid'` to create commission

**Webhook 3: Refunds/Create**
- **Event (in dropdown):** `Refund creation` (or similar)
- URL: `https://yourdomain.com/api/webhooks/refunds` (or ngrok URL for localhost testing)
- Format: JSON
- API Version: **2026-01 latest** (or 2025-10 for stability)

**For Localhost Testing:**
- Use ngrok: `ngrok http 3000` → Use the HTTPS URL provided
- See `LOCALHOST_TESTING.md` for detailed instructions

**Important:** 
- Use your actual deployed domain (not localhost)
- Webhooks must be HTTPS
- HMAC verification is required (uses `SHOPIFY_API_SECRET`)

### 3. Environment Variables

**Required in `.env` or production environment:**

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# Shopify API (for webhook HMAC verification)
SHOPIFY_API_SECRET=your_shopify_api_secret

# Your Shopify Shop ID (without .myshopify.com)
SHOPIFY_SHOP_ID=yourstore

# Security
NEXTAUTH_SECRET=your_random_secret
MAGIC_LINK_SECRET=your_magic_link_secret
```

**Verify:**
- `SHOPIFY_API_SECRET` matches your Shopify app's API secret
- `SHOPIFY_SHOP_ID` is your shop domain (e.g., `yourstore` not `yourstore.myshopify.com`)

### 4. Theme Script Verification

**Check that script is in `theme.liquid`:**
- Script should be before `</body>` tag
- Should read `affiliate_click_id` and `affiliate_id` cookies
- Should set cart attributes: `affiliate_click_id` and `affiliate_id`

**Test script:**
1. Click an affiliate link: `yoursite.com/ref/30483`
2. Open browser DevTools → Application → Cookies
3. Verify cookies are set: `affiliate_click_id` and `affiliate_id`
4. Add product to cart
5. Check cart attributes (in console or via API):
   ```javascript
   fetch('/cart.js').then(r => r.json()).then(console.log)
   ```
6. Should see `attributes.affiliate_click_id` in response

### 5. Internal Marketing URLs

**Add parameters to all internal marketing:**
- Meta ads: `?ref=internal&source=meta`
- Google ads: `?ref=internal&source=google`
- Email: `?ref=internal&source=email`
- Social: `?ref=internal&source=social`

**Verify:**
- All internal marketing URLs have `ref=internal`
- Organic search is automatically detected (no action needed)

### 6. Test Data Setup

**Create test data:**
1. **Create an Offer:**
   - Name: "Test Offer"
   - Commission: $50 flat rate
   - Attribution window: 90 days
   - Should get `offer_number` starting at 29332

2. **Create an Affiliate:**
   - First name, last name, email
   - Assign the test offer
   - Should get `affiliate_number` starting at 30483
   - Password for affiliate login (if needed)

3. **Verify affiliate link:**
   - Should be: `yoursite.com/ref/30483`
   - Clicking should set cookies and redirect

## 🧪 Testing Checklist

### Test 1: Basic Attribution Flow
- [ ] Click affiliate link: `/ref/30483`
- [ ] Verify cookies are set
- [ ] Add product to cart
- [ ] Verify cart attributes are set
- [ ] Complete checkout
- [ ] Check webhook logs for attribution
- [ ] Verify commission is created (status: `pending`)

### Test 2: Attribution Window
- [ ] Click affiliate link
- [ ] Wait 91 days (or manually adjust order date in test)
- [ ] Complete checkout
- [ ] Verify NO commission created (outside window)

### Test 3: Last-Touch Attribution
- [ ] Affiliate A click on Day 1
- [ ] Affiliate B click on Day 10
- [ ] Order on Day 15
- [ ] Verify Affiliate B gets commission (last-touch)

### Test 4: Internal Traffic Blocking
- [ ] Click affiliate link
- [ ] Later, click internal marketing link: `?ref=internal&source=meta`
- [ ] Complete checkout
- [ ] Verify NO commission created (internal traffic)

### Test 5: Organic Search Blocking
- [ ] Click affiliate link
- [ ] Later, search Google for your brand
- [ ] Click organic result
- [ ] Complete checkout
- [ ] Verify NO commission created (organic search)

### Test 6: Subscription Commissions
- [ ] Create offer with subscription rebill commission
- [ ] Click affiliate link
- [ ] Purchase subscription
- [ ] Verify initial commission created
- [ ] Verify rebill commissions created (up to max_payments)

### Test 7: Re-Attribution Protection
- [ ] Order attributed to Affiliate A
- [ ] Commission created (pending)
- [ ] Re-attribute to Affiliate B (via more recent click)
- [ ] Verify Affiliate A commission is reversed
- [ ] Verify Affiliate B commission is created

## ⚠️ Common Issues

### Issue 1: Webhooks Not Receiving Data
**Check:**
- Webhook URL is correct and accessible
- HMAC verification is working (check `SHOPIFY_API_SECRET`)
- Webhook is enabled in Shopify admin
- Check webhook delivery logs in Shopify admin

### Issue 2: Cart Attributes Not Set
**Check:**
- Theme script is in `theme.liquid` (before `</body>`)
- Script is executing (check browser console for errors)
- Cookies are set (check DevTools → Application → Cookies)
- Cart update API is working (check network tab)

### Issue 3: No Attribution Found
**Check:**
- Click was logged to database (check `Click` table)
- Attribution window hasn't expired
- Affiliate is active (status = 'active')
- Internal traffic not detected (check for `ref=internal`)

### Issue 4: Commission Not Created
**Check:**
- Order is marked as `paid` (not just `created`)
- Attribution was successful (check `OrderAttribution` table)
- Affiliate has an offer assigned
- Offer commission rules are valid

## 📋 Quick Verification Commands

```bash
# Check database connection
npx prisma db push

# Check Prisma client is generated
npx prisma generate

# View database in browser
npx prisma studio

# Type check
npm run type-check

# Build (should succeed)
npm run build
```

## 🚀 Ready to Test?

**Before testing, ensure:**
1. ✅ Database is synced
2. ✅ Webhooks are configured in Shopify
3. ✅ Environment variables are set
4. ✅ Theme script is added
5. ✅ Internal marketing URLs have `ref=internal`
6. ✅ Test affiliate and offer are created

**Then proceed with testing checklist above.**
