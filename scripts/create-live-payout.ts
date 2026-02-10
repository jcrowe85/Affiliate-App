import { PrismaClient } from '@prisma/client';
import { createPayPalPayout, PayPalPayoutItem } from '../lib/paypal';
import { firePostbacks } from '../lib/postback';

const prisma = new PrismaClient();

/**
 * Create a $1 payout for jcrowe120485@gmail.com
 * This script will:
 * 1. Find the affiliate
 * 2. Create a $1 commission if needed
 * 3. Process the actual PayPal payout
 */
async function createLivePayout() {
  const affiliateEmail = 'jcrowe120485@gmail.com';
  
  try {
    console.log(`\n🔍 Looking for affiliate: ${affiliateEmail}`);
    
    // Find affiliate
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        email: affiliateEmail.toLowerCase().trim(),
      },
    });

    if (!affiliate) {
      console.error(`❌ Affiliate not found: ${affiliateEmail}`);
      process.exit(1);
    }

    console.log(`✅ Found affiliate: ${affiliate.name || affiliate.email}`);
    console.log(`   ID: ${affiliate.id}`);
    console.log(`   PayPal Email: ${affiliate.paypal_email || 'NOT SET'}`);

    if (!affiliate.paypal_email || affiliate.paypal_email.trim() === '') {
      console.error(`❌ Affiliate does not have a PayPal email configured!`);
      process.exit(1);
    }

    // Check for existing eligible commissions
    let commissions = await prisma.commission.findMany({
      where: {
        affiliate_id: affiliate.id,
        shopify_shop_id: affiliate.shopify_shop_id,
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
      take: 1, // Only need one for $1 payout
    });

    // If no eligible commissions exist, create a $1 test commission
    if (commissions.length === 0) {
      console.log(`\n📝 No eligible commissions found. Creating a $1 test commission...`);
      
      // Create a test order attribution first (required for commission)
      const testOrderId = `LIVE_TEST_${Date.now()}`;
      const testOrderNumber = `LIVE-TEST-${Date.now()}`;
      
      const orderAttribution = await prisma.orderAttribution.create({
        data: {
          shopify_order_id: testOrderId,
          shopify_order_number: testOrderNumber,
          affiliate_id: affiliate.id,
          attribution_type: 'link',
          shopify_shop_id: affiliate.shopify_shop_id,
        },
      });

      // Create a $1 test commission
      const testCommission = await prisma.commission.create({
        data: {
          affiliate_id: affiliate.id,
          order_attribution_id: orderAttribution.id,
          shopify_shop_id: affiliate.shopify_shop_id,
          shopify_order_id: testOrderId,
          amount: '1.00',
          currency: 'USD',
          status: 'eligible',
          eligible_date: new Date(), // Eligible immediately
          rule_snapshot: {
            name: 'Live Test Commission',
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
      console.log(`✅ Created test commission: ${testCommission.id}`);
    }

    const commission = commissions[0];
    const totalAmount = parseFloat(commission.amount.toString());
    const currency = commission.currency || 'USD';

    console.log(`\n💰 Processing $${totalAmount.toFixed(2)} ${currency} payout...`);
    console.log(`   Commission ID: ${commission.id}`);
    console.log(`   Order: ${commission.order_attribution?.shopify_order_number || commission.shopify_order_id}`);
    console.log(`   PayPal Email: ${affiliate.paypal_email}`);

    // Process PayPal payout
    const payoutItems: PayPalPayoutItem[] = [{
      recipient_type: 'EMAIL',
      amount: {
        value: commission.amount.toString(),
        currency: currency,
      },
      receiver: affiliate.paypal_email!,
      note: `Commission for order ${commission.order_attribution?.shopify_order_number || commission.shopify_order_id}`,
      sender_item_id: commission.id,
    }];

    // Create unique batch ID
    const batchId = `LIVE_PAYOUT_${affiliate.id}_${Date.now()}`;
    
    console.log(`\n📤 Sending PayPal payout...`);
    console.log(`   Batch ID: ${batchId}`);
    console.log(`   Mode: ${process.env.PAYPAL_MODE || 'sandbox'} (check your .env file)`);
    
    const payoutResult = await createPayPalPayout(
      payoutItems,
      batchId,
      'Your Affiliate Commission Payment',
      `You have received a commission payment of $${totalAmount.toFixed(2)} ${currency} from Fleur & Blossom.`
    );

    console.log(`\n✅ PayPal payout created successfully!`);
    console.log(`   Batch ID: ${payoutResult.batch_id}`);
    console.log(`   Status: ${payoutResult.batch_status}`);

    // Mark commission as paid
    await prisma.commission.update({
      where: { id: commission.id },
      data: { status: 'paid' },
    });

    // Create payout run record
    const payoutRun = await prisma.payoutRun.create({
      data: {
        affiliate_id: affiliate.id,
        period_start: commission.created_at,
        period_end: commission.created_at,
        status: 'paid',
        payout_reference: payoutResult.batch_id,
        shopify_shop_id: affiliate.shopify_shop_id,
        commissions: {
          create: {
            commission_id: commission.id,
          },
        },
      },
    });

    console.log(`\n✅ Commission marked as paid`);
    console.log(`   Payout Run ID: ${payoutRun.id}`);

    // Fire postbacks
    try {
      await firePostbacks(commission.id, 'payment', affiliate.shopify_shop_id);
      console.log(`✅ Postbacks fired`);
    } catch (error) {
      console.warn(`⚠️  Postback error (non-critical):`, error);
    }

    console.log(`\n🎉 Payout completed successfully!`);
    console.log(`\n📋 Summary:`);
    console.log(`   Affiliate: ${affiliate.name || affiliate.email}`);
    console.log(`   Amount: $${totalAmount.toFixed(2)} ${currency}`);
    console.log(`   PayPal Batch ID: ${payoutResult.batch_id}`);
    console.log(`   PayPal Status: ${payoutResult.batch_status}`);
    console.log(`   Commission ID: ${commission.id}`);
    console.log(`   Payout Run ID: ${payoutRun.id}`);
    console.log(`\n💡 Check your PayPal account to verify the payment was received.`);

  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
    if (error.paypalError) {
      console.error(`   PayPal Error:`, JSON.stringify(error.paypalError, null, 2));
    }
    if (error.stack) {
      console.error(`\nStack trace:`, error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createLivePayout();
