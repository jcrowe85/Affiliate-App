# Refersion URL Format: Query Parameters vs Path-Based

## Why Refersion Uses Query Parameters

Refersion uses the format: `https://tryfleur.com/?rfsn=8967748.5l04n41&rf_test=1`

### Advantages of Query Parameters (`?rfsn=...`)

1. **Works on Any Page**
   - Can add `?rfsn=...` to any existing URL
   - Example: `https://tryfleur.com/products/serum?rfsn=8967748.5l04n41`
   - No need to create new routes for each page

2. **Easier Implementation**
   - No server-side routing required
   - Just read URL parameters on any page
   - Works with existing Shopify theme without route changes

3. **More Flexible**
   - Can track multiple parameters:
     - `rfsn` = Refersion affiliate ID
     - `rf_test=1` = Test mode
     - `rf_campaign=summer2024` = Campaign tracking
     - `rf_source=email` = Source tracking

4. **Universal Tracking**
   - Works on product pages, blog posts, landing pages
   - Affiliates can add `?rfsn=...` to any URL they share
   - No need to generate specific links for each page

5. **Backward Compatible**
   - Doesn't break existing URLs
   - Can be added to any existing link
   - Works with existing marketing campaigns

### Disadvantages of Query Parameters

1. **Less Clean URLs**
   - `https://tryfleur.com/?rfsn=8967748.5l04n41` vs `/ref/30483`
   - Longer, less memorable
   - Can look "spammy" to users

2. **Requires JavaScript**
   - Need client-side script to read parameters
   - Must be present on every page
   - Can be blocked by ad blockers

3. **Parameter Pollution**
   - URLs can get long with multiple parameters
   - Harder to share in some contexts (SMS, print)

## Our Current System: Path-Based (`/ref/30483`)

### Advantages

1. **Cleaner URLs**
   - Short, memorable: `https://tryfleur.com/ref/30483`
   - Professional looking
   - Easy to share

2. **Server-Side Tracking**
   - Route handler processes tracking server-side
   - More reliable (doesn't depend on JavaScript)
   - Can set cookies and redirect immediately

3. **Better SEO**
   - Path-based URLs are more SEO-friendly
   - Can be indexed by search engines
   - Cleaner URL structure

4. **More Control**
   - Can redirect to any destination
   - Can add URL parameters as backup
   - Can implement custom logic per affiliate

### Disadvantages

1. **Requires Route Setup**
   - Need to create `/ref/[affiliateNumber]` route
   - Must handle redirects server-side
   - More complex implementation

2. **Single Entry Point**
   - All affiliates use same route pattern
   - Can't easily track different pages
   - Less flexible for campaign tracking

## Recommendation: Support Both Formats

### Option 1: Keep Path-Based, Add Query Parameter Support

**Path-Based (Primary):**
- `https://tryfleur.com/ref/30483` → Redirects to homepage with tracking
- `https://tryfleur.com/ref/30483?url=/products/serum` → Redirects to specific page

**Query Parameter (Secondary):**
- `https://tryfleur.com/?ref=30483` → Works on any page
- `https://tryfleur.com/products/serum?ref=30483` → Tracks on product page

**Implementation:**
1. Keep `/ref/[affiliateNumber]` route (current)
2. Add client-side script to read `?ref=30483` parameter
3. Set cookies when `ref` parameter is detected
4. Works on any page without redirect

### Option 2: Switch to Query Parameters Only

**Benefits:**
- More flexible (works on any page)
- Easier for affiliates (just add `?ref=30483` to any URL)
- Matches Refersion format (familiar to users)

**Implementation:**
1. Remove `/ref/[affiliateNumber]` route
2. Add client-side script to all pages
3. Read `ref` parameter and set cookies
4. Record click via API call

### Option 3: Hybrid Approach (Recommended)

**Support Both:**
- Path-based: `https://tryfleur.com/ref/30483` (clean, memorable)
- Query parameter: `https://tryfleur.com/?ref=30483` (flexible, works anywhere)

**How It Works:**
1. **Path-based** (`/ref/30483`):
   - Server-side route handler
   - Records click immediately
   - Sets cookies
   - Redirects to destination (or homepage)

2. **Query parameter** (`?ref=30483`):
   - Client-side script on all pages
   - Detects `ref` parameter
   - Records click via API
   - Sets cookies
   - Works on current page (no redirect)

**Benefits:**
- Affiliates can use either format
- Path-based for clean sharing
- Query parameter for flexibility
- Both methods tracked the same way

## Refersion's Format Breakdown

Looking at: `https://tryfleur.com/?rfsn=8967748.5l04n41&rf_test=1`

- `rfsn=8967748.5l04n41`:
  - `8967748` = Affiliate ID
  - `5l04n41` = Unique identifier/hash (prevents guessing other affiliate IDs)
  
- `rf_test=1`:
  - Test mode flag
  - Allows testing without creating real conversions

## Our Format Options

### Current (Path-Based):
```
https://tryfleur.com/ref/30483
```

### Query Parameter Option:
```
https://tryfleur.com/?ref=30483
https://tryfleur.com/?ref=30483&test=1
```

### Hybrid (Both):
```
https://tryfleur.com/ref/30483          (path-based)
https://tryfleur.com/?ref=30483         (query parameter)
https://tryfleur.com/products/serum?ref=30483  (query on any page)
```

## Recommendation

**Implement Hybrid Approach:**

1. **Keep path-based** (`/ref/30483`) for:
   - Clean, shareable links
   - Primary affiliate links
   - Marketing materials

2. **Add query parameter support** (`?ref=30483`) for:
   - Flexibility (works on any page)
   - Affiliates who want to add tracking to existing URLs
   - Campaign tracking

3. **Both methods:**
   - Record clicks the same way
   - Set same cookies
   - Use same attribution logic
   - Track in same database

This gives affiliates the flexibility of Refersion while maintaining clean URLs for marketing.
