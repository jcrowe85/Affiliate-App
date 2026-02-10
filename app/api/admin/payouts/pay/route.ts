import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { firePostbacks } from '@/lib/postback';
import { createPayPalPayout, PayPalPayoutItem } from '@/lib/paypal';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Process payout for an affiliate - mark eligible commissions as paid
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { affiliate_id, commission_ids, payout_reference } = await request.json();

    if (!affiliate_id || !commission_ids || !Array.isArray(commission_ids) || commission_ids.length === 0) {
      return NextResponse.json(
        { error: 'affiliate_id and commission_ids array are required' },
        { status: 400 }
      );
    }

    // Verify commissions belong to this affiliate and shop, and are eligible
    const commissions = await prisma.commission.findMany({
      where: {
        id: { in: commission_ids },
        affiliate_id: affiliate_id,
        shopify_shop_id: admin.shopify_shop_id,
        status: { in: ['eligible', 'approved'] },
        eligible_date: {
          lte: new Date(), // Only pay commissions that are past their eligible date
        },
      },
      include: {
        order_attribution: {
          select: {
            shopify_order_number: true,
          },
        },
      },
    });

    if (commissions.length !== commission_ids.length) {
      return NextResponse.json(
        { error: 'Some commissions not found, not eligible, or not ready for payout' },
        { status: 400 }
      );
    }

    // Check for unresolved fraud flags
    const fraudFlags = await prisma.fraudFlag.findMany({
      where: {
        commission_id: { in: commission_ids },
        shopify_shop_id: admin.shopify_shop_id,
        resolved: false,
      },
    });

    if (fraudFlags.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot pay commissions with unresolved fraud flags',
          fraud_commission_ids: fraudFlags.map(f => f.commission_id),
        },
        { status: 400 }
      );
    }

    // Get affiliate details to check for PayPal email
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliate_id },
      select: { 
        paypal_email: true, 
        email: true, 
        name: true,
        shopify_shop_id: true,
      },
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found' },
        { status: 404 }
      );
    }

    // Verify affiliate belongs to this shop
    if (affiliate.shopify_shop_id !== admin.shopify_shop_id) {
      return NextResponse.json(
        { error: 'Unauthorized - affiliate does not belong to your shop' },
        { status: 403 }
      );
    }

    // Check if affiliate has PayPal email before processing
    if (!affiliate.paypal_email || affiliate.paypal_email.trim() === '') {
      return NextResponse.json({
        success: false,
        error: 'PayPal email not configured',
        message: `Affiliate "${affiliate.name || affiliate.email}" does not have a PayPal email address set. Please add a PayPal email in the Affiliates tab before processing payments.`,
        affiliate_name: affiliate.name || affiliate.email,
        affiliate_email: affiliate.email,
        details: 'To process PayPal payouts, the affiliate must have a PayPal email address configured in their profile.',
      }, { status: 400 });
    }

    // Calculate total amount
    const totalAmount = commissions.reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);
    const currency = commissions[0]?.currency || 'USD';

    // Process PayPal payout FIRST - only mark as paid if PayPal succeeds
    let paypalBatchId: string | null = null;
    let paypalStatus: string | null = null;
    let payoutMethod = 'paypal';
    let paypalError: string | null = null;
    let paypalErrorDetails: any = null;

    try {
      const payoutItems: PayPalPayoutItem[] = commissions.map(c => ({
        recipient_type: 'EMAIL',
        amount: {
          value: c.amount.toString(),
          currency: c.currency || 'USD',
        },
        receiver: affiliate.paypal_email!,
        note: `Commission for order ${c.order_attribution?.shopify_order_number || c.shopify_order_id}`,
        sender_item_id: c.id,
      }));

      // Create unique batch ID
      const batchId = `PAYOUT_${affiliate_id}_${Date.now()}`;
      
      const payoutResult = await createPayPalPayout(
        payoutItems,
        batchId,
        'Your Affiliate Commission Payment',
        `You have received a commission payment of ${totalAmount.toFixed(2)} ${currency} from Fleur & Blossom.`
      );

      paypalBatchId = payoutResult.batch_id;
      paypalStatus = payoutResult.batch_status;
      
      // Only proceed to mark as paid if PayPal batch was created successfully
      if (!paypalBatchId) {
        throw new Error('PayPal batch ID not returned - payout may have failed');
      }

    } catch (paypalErrorCaught: any) {
      console.error('❌ PayPal payout error:', paypalErrorCaught);
      
      // Parse PayPal error to provide user-friendly messages
      const errorMessageString = paypalErrorCaught.message || 'Unknown PayPal error';
      paypalError = errorMessageString;
      paypalErrorDetails = paypalErrorCaught;
      
      // Check for specific error types
      let errorReason = 'Unknown error';
      const errorMessage = errorMessageString.toLowerCase();
      const errorString = JSON.stringify(paypalErrorCaught).toLowerCase();
      
      // Check status code first (most reliable indicator)
      const statusCode = paypalErrorCaught.statusCode || (paypalErrorCaught.paypalError?.statusCode);
      
      if (statusCode === 401 || errorString.includes('401') || errorMessage.includes('unauthorized')) {
        errorReason = 'PayPal API credentials are invalid OR the Payouts API permission is not enabled. Please verify: 1) Your Client ID and Secret are correct, and 2) The "Payouts" permission is enabled in your PayPal Developer Dashboard under App Settings > Permissions.';
      } else if (statusCode === 403 || errorString.includes('403') || errorMessage.includes('forbidden')) {
        errorReason = 'PayPal API access forbidden. Your app does not have permission to send payouts. Please enable the "Payouts" permission in your PayPal Developer Dashboard: Dashboard > My Apps & Credentials > [Your App] > Permissions tab.';
      } else if (errorMessage.includes('invalid') && errorMessage.includes('email')) {
        errorReason = `The PayPal email "${affiliate.paypal_email}" is invalid or does not exist. Please verify the email address is correct and the PayPal account is active.`;
      } else if (errorMessage.includes('authentication')) {
        errorReason = 'PayPal authentication failed. Please check your PayPal API credentials in the environment variables.';
      } else if (errorMessage.includes('connection') || errorMessage.includes('network') || errorMessage.includes('timeout')) {
        errorReason = 'Failed to connect to PayPal. Please check your internet connection and try again.';
      } else if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
        errorReason = 'Insufficient funds in PayPal account to process this payout.';
      } else if (errorMessage.includes('limit') || errorMessage.includes('exceeded')) {
        errorReason = 'PayPal payout limit exceeded. Please check your PayPal account limits.';
      } else if (statusCode === 400 || errorString.includes('400') || errorString.includes('bad request')) {
        errorReason = `PayPal rejected the payout request. Error: ${errorMessageString}`;
      } else if (errorString.includes('404')) {
        errorReason = 'PayPal API endpoint not found. This may indicate a configuration issue.';
      } else if (statusCode === 500 || errorString.includes('500') || errorString.includes('server error')) {
        errorReason = 'PayPal server error. Please try again in a few minutes.';
      } else {
        errorReason = `PayPal error: ${errorMessageString}`;
      }

      // Return error - DO NOT mark commissions as paid
      return NextResponse.json({
        success: false,
        error: 'PayPal payout failed',
        error_reason: errorReason,
        paypal_error: paypalError,
        paypal_error_details: process.env.NODE_ENV === 'development' ? paypalErrorDetails : undefined,
        message: 'Commissions were NOT marked as paid. Please resolve the issue and try again.',
        affiliate_name: affiliate.name || affiliate.email,
        affiliate_email: affiliate.email,
        paypal_email: affiliate.paypal_email,
        total_amount: totalAmount.toFixed(2),
        currency,
      }, { status: 500 });
    }

    // Only reach here if PayPal payout succeeded
    // Now mark commissions as paid
    await prisma.commission.updateMany({
      where: {
        id: { in: commission_ids },
      },
      data: {
        status: 'paid',
      },
    });

    // Create a payout run record for tracking
    const payoutRun = await prisma.payoutRun.create({
      data: {
        period_start: commissions.reduce((min, c) => (c.created_at < min ? c.created_at : min), new Date()),
        period_end: commissions.reduce((max, c) => (c.created_at > max ? c.created_at : max), new Date()),
        status: 'paid',
        payout_reference: paypalBatchId || payout_reference || null,
        shopify_shop_id: admin.shopify_shop_id,
        commissions: {
          create: commissions.map(c => ({
            commission_id: c.id,
          })),
        },
      },
    });

    // Fire postbacks for payment event
    for (const commissionId of commission_ids) {
      try {
        await firePostbacks(commissionId, 'payment', admin.shopify_shop_id);
      } catch (error) {
        console.error(`Error firing postback for commission ${commissionId}:`, error);
        // Continue even if postback fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payout processed and sent via PayPal successfully',
      paid_count: commissions.length,
      total_amount: totalAmount.toFixed(2),
      currency,
      payout_run_id: payoutRun.id,
      payout_method: payoutMethod,
      paypal_batch_id: paypalBatchId,
      paypal_status: paypalStatus,
      commissions: commissions.map(c => ({
        id: c.id,
        order_number: c.order_attribution?.shopify_order_number || c.shopify_order_id,
        amount: c.amount.toString(),
        eligible_date: c.eligible_date,
      })),
    });
  } catch (error: any) {
    console.error('Error processing payout:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process payout' },
      { status: 500 }
    );
  }
}
