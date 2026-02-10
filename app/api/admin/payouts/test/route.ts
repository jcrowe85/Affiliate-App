import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { firePostbacks } from '@/lib/postback';
import { createPayPalPayout, PayPalPayoutItem } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

/**
 * Create a test payout for a specific affiliate email
 * This will find the affiliate, create a test commission if needed, and process the payout
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find affiliate by email
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!affiliate) {
      return NextResponse.json({
        success: false,
        error: 'Affiliate not found',
        message: `No affiliate found with email: ${email}`,
        details: 'Please ensure the affiliate exists in the system.',
      }, { status: 404 });
    }

    // Check if affiliate has PayPal email
    if (!affiliate.paypal_email || affiliate.paypal_email.trim() === '') {
      return NextResponse.json({
        success: false,
        error: 'PayPal email not configured',
        message: `Affiliate "${affiliate.name || affiliate.email}" does not have a PayPal email address set.`,
        affiliate_name: affiliate.name || affiliate.email,
        affiliate_email: affiliate.email,
        details: 'Please add a PayPal email in the Affiliates tab before processing test payouts.',
      }, { status: 400 });
    }

    // Check for existing eligible commissions
    let commissions = await prisma.commission.findMany({
      where: {
        affiliate_id: affiliate.id,
        shopify_shop_id: admin.shopify_shop_id,
        status: { in: ['eligible', 'approved'] },
        eligible_date: {
          lte: new Date(),
        },
      },
      include: {
        order_attribution: {
          select: {
            shopify_order_number: true,
          },
        },
      },
      orderBy: {
        eligible_date: 'asc',
      },
      take: 5, // Limit to 5 commissions for testing
    });

    // If no eligible commissions exist, create a test commission
    if (commissions.length === 0) {
      // Create a test order attribution first (required for commission)
      const testOrderId = `TEST_${Date.now()}`;
      const testOrderNumber = `TEST-${Date.now()}`;
      
      const orderAttribution = await prisma.orderAttribution.create({
        data: {
          shopify_order_id: testOrderId,
          shopify_order_number: testOrderNumber,
          affiliate_id: affiliate.id,
          attribution_type: 'link',
          shopify_shop_id: admin.shopify_shop_id,
        },
      });

      // Create a test commission with the order attribution
      const testCommission = await prisma.commission.create({
        data: {
          affiliate_id: affiliate.id,
          order_attribution_id: orderAttribution.id,
          shopify_shop_id: admin.shopify_shop_id,
          shopify_order_id: testOrderId,
          amount: '1.00', // Test amount
          currency: 'USD',
          status: 'eligible',
          eligible_date: new Date(), // Eligible immediately
          rule_snapshot: {
            name: 'Test Commission',
            rule_type: 'flat',
            applies_to: 'one_time',
            value: 1.00,
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

      commissions = [testCommission];
    }

    // Calculate total amount
    const totalAmount = commissions.reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);
    const currency = commissions[0]?.currency || 'USD';

    // For test payouts, we just create eligible commissions WITHOUT processing them
    // This allows them to show up in the payouts screen for manual processing
    // The user can then use the "Pay" button to actually process the payout
    
    return NextResponse.json({
      success: true,
      message: `Test commission(s) created successfully. ${commissions.length} eligible commission(s) are now available in the Payouts screen.`,
      commission_count: commissions.length,
      total_amount: totalAmount.toFixed(2),
      currency,
      affiliate_name: affiliate.name || affiliate.email,
      affiliate_email: affiliate.email,
      paypal_email: affiliate.paypal_email,
      commissions: commissions.map(c => ({
        id: c.id,
        order_number: c.order_attribution?.shopify_order_number || c.shopify_order_id,
        amount: c.amount.toString(),
        status: c.status,
        eligible_date: c.eligible_date,
      })),
      note: 'These commissions are eligible and ready to be paid. Use the "Pay" button in the Payouts tab to process them.',
    });
  } catch (error: any) {
    console.error('Error creating test payout:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to create test payout',
        message: 'An unexpected error occurred while creating the test payout.',
      },
      { status: 500 }
    );
  }
}
