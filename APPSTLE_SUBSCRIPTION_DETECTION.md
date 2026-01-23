# Appstle Subscription Rebill Detection

## Current Implementation

The system currently detects Appstle subscription renewals using line item properties and tags:

### Detection Methods

**1. Line Item Properties**
```typescript
// Check for Appstle selling plan property
item.properties?.some((prop: any) => 
  prop.name === '__appstle-selected-selling-plan'
)
```

**2. Line Item Tags**
```typescript
// Check for Appstle subscription tag
item.tags?.includes('appstle_subscription_recurring_order')
```

**3. Selling Plan ID Extraction**
```typescript
// Extract selling plan ID from line item properties
const planProp = item.properties?.find((prop: any) => 
  prop.name === '__appstle-selected-selling-plan'
);
const sellingPlanId = planProp?.value;
```

## What Data is Available in Order Webhook?

### Order Object Structure

When Appstle processes a subscription renewal, the order webhook includes:

**Line Items:**
- `line_items[].properties[]` - Custom properties including:
  - `__appstle-selected-selling-plan` - The selling plan ID
  - Other Appstle-specific properties

**Order Metafields (Potential):**
- Appstle may add metafields to identify:
  - Original order ID
  - Subscription ID
  - Renewal number
  - Parent order reference

**Order Tags:**
- Order-level tags may include subscription identifiers

**Order Notes/Attributes:**
- Appstle may add notes or attributes with subscription info

## Current Limitations

### Problem: Finding Original Subscription

The current code uses a **fallback method** to find the original subscription:

```typescript
// Find by affiliate and selling plan (most recent active subscription)
const subscription = await prisma.subscriptionAttribution.findFirst({
  where: {
    affiliate_id: attribution.affiliate_id,
    selling_plan_id: sellingPlanId,
    active: true,
  },
  orderBy: {
    created_at: 'desc', // Get most recent subscription
  },
});
```

**Issues:**
1. If an affiliate has multiple subscriptions with the same selling plan, this may match the wrong one
2. No direct link to the original order ID
3. Relies on Appstle's internal logic to match renewals

## Recommended Solution: Appstle API Integration

### Option 1: Use Appstle API (Recommended)

Appstle provides an API to fetch subscription data. This would allow us to:

1. **Get Original Order ID** - Query Appstle API with renewal order ID to get original subscription order
2. **Verify Subscription** - Confirm the subscription exists and is active
3. **Get Payment History** - Track which payments have been made

**Appstle API Endpoints:**
- `GET /api/v1/subscriptions` - List subscriptions
- `GET /api/v1/subscriptions/{id}` - Get subscription details
- `GET /api/v1/orders/{order_id}/subscription` - Get subscription for an order

**Implementation:**
```typescript
// When renewal order arrives, query Appstle API
const appstleResponse = await fetch(
  `https://api.appstle.com/api/v1/orders/${order.id}/subscription`,
  {
    headers: {
      'Authorization': `Bearer ${APPSTLE_API_KEY}`,
    },
  }
);

const subscriptionData = await appstleResponse.json();
const originalOrderId = subscriptionData.original_order_id;
```

### Option 2: Enhanced Order Metafield Detection

Check for Appstle metafields in the order object:

```typescript
// Check order metafields for Appstle subscription data
const appstleMetafields = order.metafields?.filter(
  (m: any) => m.namespace === 'appstle' || m.namespace === 'appstle_subscription'
);

// Look for:
// - appstle.original_order_id
// - appstle.subscription_id
// - appstle.renewal_number
// - appstle.parent_order_id
```

### Option 3: Order Notes/Attributes

Appstle may add subscription info to order notes or attributes:

```typescript
// Check order notes
const orderNote = order.note;
// May contain: "Appstle Subscription Renewal #12345"

// Check order attributes
const appstleAttr = order.attributes?.find(
  (attr: any) => attr.key === 'appstle_subscription_id' || 
                 attr.key === 'original_order_id'
);
```

## What to Check in Order Object

When a renewal order arrives, inspect the full order object for:

1. **Order Metafields:**
   ```json
   {
     "metafields": [
       {
         "namespace": "appstle",
         "key": "subscription_id",
         "value": "12345"
       },
       {
         "namespace": "appstle",
         "key": "original_order_id",
         "value": "67890"
       }
     ]
   }
   ```

2. **Order Tags:**
   ```json
   {
     "tags": [
       "appstle_subscription",
       "appstle_renewal",
       "appstle_subscription_12345"
     ]
   }
   ```

3. **Order Note:**
   ```json
   {
     "note": "Appstle Subscription Renewal - Original Order: #1234"
   }
   ```

4. **Line Item Properties:**
   ```json
   {
     "line_items": [
       {
         "properties": [
           {
             "name": "__appstle-selected-selling-plan",
             "value": "gid://shopify/SellingPlan/12345"
           },
           {
             "name": "__appstle-original-order-id",
             "value": "67890"
           },
           {
             "name": "__appstle-subscription-id",
             "value": "12345"
           }
         ]
       }
     ]
   }
   ```

## Testing Steps

1. **Create a test subscription order** in Shopify
2. **Wait for Appstle to process** the first renewal
3. **Inspect the renewal order webhook payload**:
   ```typescript
   console.log('Full order object:', JSON.stringify(order, null, 2));
   console.log('Order metafields:', order.metafields);
   console.log('Order tags:', order.tags);
   console.log('Order note:', order.note);
   console.log('Line items:', order.line_items);
   ```
4. **Look for Appstle identifiers** in the payload
5. **Update detection logic** based on what's actually available

## Next Steps

1. **Add logging** to capture full order object for renewal orders
2. **Inspect actual webhook payloads** from Appstle renewals
3. **Update detection logic** based on real data
4. **Integrate Appstle API** if metafields/properties aren't sufficient
5. **Store original order ID** in subscription attribution for direct lookup

## Current Workaround

Until we have Appstle API integration or better metafield detection:

- The system uses **affiliate + selling plan + most recent** subscription
- This works if:
  - Each affiliate only has one active subscription per selling plan
  - Renewals happen in order (no skipped payments)
- **Risk:** May match wrong subscription if affiliate has multiple subscriptions

## Recommended Immediate Action

Add detailed logging to see what Appstle actually sends:

```typescript
// In webhook handler, when order is paid
if (isRenewal) {
  console.log('=== APSTLE RENEWAL ORDER DEBUG ===');
  console.log('Order ID:', order.id);
  console.log('Order Number:', order.order_number);
  console.log('Order Metafields:', JSON.stringify(order.metafields, null, 2));
  console.log('Order Tags:', order.tags);
  console.log('Order Note:', order.note);
  console.log('Order Attributes:', JSON.stringify(order.attributes, null, 2));
  console.log('Line Items:', JSON.stringify(order.line_items, null, 2));
  console.log('==================================');
}
```

This will show us exactly what data Appstle provides, allowing us to improve the detection logic.
