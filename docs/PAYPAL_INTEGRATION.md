# PayPal Integration Guide

## Overview
This guide outlines the steps to integrate PayPal Payouts API to automatically pay affiliates using their PayPal email addresses on file.

## Prerequisites
1. PayPal Business Account
2. PayPal API credentials (Client ID and Secret)
3. Access to PayPal Developer Dashboard

## Step 1: Set Up PayPal Developer Account

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Log in with your PayPal Business account
3. Navigate to **Dashboard** > **My Apps & Credentials**
4. Create a new app or use an existing one
5. Note your **Client ID** and **Secret** (for Sandbox or Live)

## Step 2: Install PayPal SDK

```bash
npm install @paypal/payouts-sdk
```

## Step 3: Environment Variables

Add to your `.env` file:

```env
# PayPal Configuration
PAYPAL_CLIENT_ID=your_client_id_here
PAYPAL_CLIENT_SECRET=your_client_secret_here
PAYPAL_MODE=sandbox  # or 'live' for production
PAYPAL_BATCH_SIZE=500  # Max items per batch (PayPal limit)
```

## Step 4: Create PayPal Service

Create `/lib/paypal.ts`:

```typescript
import paypal from '@paypal/payouts-sdk';

const environment = process.env.PAYPAL_MODE === 'live'
  ? new paypal.core.LiveEnvironment(
      process.env.PAYPAL_CLIENT_ID!,
      process.env.PAYPAL_CLIENT_SECRET!
    )
  : new paypal.core.SandboxEnvironment(
      process.env.PAYPAL_CLIENT_ID!,
      process.env.PAYPAL_CLIENT_SECRET!
    );

const client = new paypal.core.PayPalHttpClient(environment);

export interface PayPalPayoutItem {
  recipient_type: 'EMAIL';
  amount: {
    value: string;
    currency: string;
  };
  receiver: string; // PayPal email
  note?: string;
  sender_item_id?: string; // Commission ID or order number
}

export interface PayPalPayoutBatch {
  sender_batch_id: string; // Unique batch ID
  email_subject: string;
  email_message: string;
  items: PayPalPayoutItem[];
}

/**
 * Create a PayPal payout batch
 */
export async function createPayPalPayout(
  items: PayPalPayoutItem[],
  batchId: string,
  emailSubject: string = 'Your Affiliate Commission Payment',
  emailMessage: string = 'You have received a commission payment from Fleur & Blossom.'
): Promise<{ batch_id: string; batch_status: string }> {
  const request = new paypal.payouts.PayoutsPostRequest();
  request.requestBody({
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: emailSubject,
      email_message: emailMessage,
    },
    items: items,
  });

  const response = await client.execute(request);
  
  if (response.statusCode !== 201) {
    throw new Error(`PayPal API error: ${response.statusCode} - ${JSON.stringify(response.result)}`);
  }

  return {
    batch_id: response.result.batch_header?.payout_batch_id || '',
    batch_status: response.result.batch_header?.batch_status || 'PENDING',
  };
}

/**
 * Get payout batch status
 */
export async function getPayPalPayoutStatus(batchId: string) {
  const request = new paypal.payouts.PayoutsGetRequest(batchId);
  const response = await client.execute(request);
  return response.result;
}
```

## Step 5: Update Payout Pay Endpoint

Modify `/app/api/admin/payouts/pay/route.ts` to integrate PayPal:

```typescript
import { createPayPalPayout, PayPalPayoutItem } from '@/lib/paypal';

// In the POST handler, after marking commissions as paid:
// ... existing code ...

// If affiliate has PayPal email, process PayPal payout
const affiliate = await prisma.affiliate.findUnique({
  where: { id: affiliate_id },
  select: { paypal_email: true, email: true, name: true },
});

if (affiliate?.paypal_email) {
  try {
    const payoutItems: PayPalPayoutItem[] = commissions.map(c => ({
      recipient_type: 'EMAIL',
      amount: {
        value: c.amount.toString(),
        currency: c.currency || 'USD',
      },
      receiver: affiliate.paypal_email,
      note: `Commission for order ${c.order_attribution?.shopify_order_number || c.shopify_order_id}`,
      sender_item_id: c.id,
    }));

    const batchId = `PAYOUT_${affiliate_id}_${Date.now()}`;
    const payoutResult = await createPayPalPayout(
      payoutItems,
      batchId,
      'Your Affiliate Commission Payment',
      `You have received a commission payment of ${totalAmount.toFixed(2)} ${currency} from Fleur & Blossom.`
    );

    // Update payout_reference with PayPal batch ID
    await prisma.payoutRun.update({
      where: { id: payoutRun.id },
      data: {
        payout_reference: payoutResult.batch_id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payout processed and sent via PayPal',
      paid_count: commissions.length,
      total_amount: totalAmount.toFixed(2),
      currency,
      payout_run_id: payoutRun.id,
      paypal_batch_id: payoutResult.batch_id,
      paypal_status: payoutResult.batch_status,
    });
  } catch (paypalError: any) {
    console.error('PayPal payout error:', paypalError);
    // Still mark as paid in database, but log PayPal error
    return NextResponse.json({
      success: true,
      warning: 'Commissions marked as paid, but PayPal payout failed',
      error: paypalError.message,
      paid_count: commissions.length,
      total_amount: totalAmount.toFixed(2),
      currency,
      payout_run_id: payoutRun.id,
    }, { status: 207 }); // 207 Multi-Status
  }
}

// If no PayPal email, just mark as paid (manual payment)
return NextResponse.json({
  success: true,
  message: 'Commissions marked as paid (manual payment required)',
  // ... rest of response
});
```

## Step 6: Add PayPal Status Webhook (Optional)

To track PayPal payout status updates, set up a webhook:

1. In PayPal Developer Dashboard, go to **Webhooks**
2. Create a new webhook with URL: `https://yourdomain.com/api/webhooks/paypal`
3. Subscribe to events: `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTSBATCH.DENIED`

Create `/app/api/webhooks/paypal/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPayPalPayoutStatus } from '@/lib/paypal';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType = body.event_type;
    const resource = body.resource;

    if (eventType === 'PAYMENT.PAYOUTSBATCH.SUCCESS' || 
        eventType === 'PAYMENT.PAYOUTSBATCH.DENIED') {
      const batchId = resource.batch_header?.payout_batch_id;
      
      // Find payout run by PayPal batch ID
      const payoutRun = await prisma.payoutRun.findFirst({
        where: {
          payout_reference: batchId,
        },
      });

      if (payoutRun) {
        // Update payout run status based on PayPal status
        await prisma.payoutRun.update({
          where: { id: payoutRun.id },
          data: {
            status: eventType.includes('SUCCESS') ? 'paid' : 'draft',
          },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('PayPal webhook error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

## Step 7: Testing

1. Use PayPal Sandbox for testing
2. Create test PayPal accounts at [PayPal Sandbox](https://developer.paypal.com/dashboard/accounts)
3. Test with small amounts first
4. Verify payouts appear in test PayPal accounts

## Step 8: Production Checklist

- [ ] Switch `PAYPAL_MODE` to `live`
- [ ] Update PayPal Client ID and Secret to production credentials
- [ ] Set up production webhook endpoint
- [ ] Test with real PayPal account (small amount)
- [ ] Monitor PayPal transaction fees (typically 2% per payout)
- [ ] Set up error alerting for failed payouts
- [ ] Document manual payout process for affiliates without PayPal

## Fees & Limits

- **PayPal Fees**: ~2% per payout (check current rates)
- **Minimum Payout**: $0.01 USD
- **Maximum per Batch**: 15,000 items
- **Daily Limit**: Varies by account (contact PayPal to increase)

## Alternative: PayPal Mass Payments (Legacy)

If you prefer the older Mass Payments API:
- Requires different SDK: `paypal-rest-sdk`
- Different authentication method
- Still supported but being phased out

## Support

- [PayPal Payouts API Docs](https://developer.paypal.com/docs/api/payments.payouts-batch/v1/)
- [PayPal Developer Support](https://developer.paypal.com/support/)
