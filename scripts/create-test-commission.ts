import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Create an eligible $1 commission for jcrowe120485@gmail.com
 * This is for testing PayPal live integration and payout functionality
 */
async function createTestCommission() {
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
    console.log(`   Shopify Shop ID: ${affiliate.shopify_shop_id}`);

    // Check if there's already an eligible commission
    const existingCommission = await prisma.commission.findFirst({
      where: {
        affiliate_id: affiliate.id,
        shopify_shop_id: affiliate.shopify_shop_id,
        status: { in: ['eligible', 'approved'] },
        eligible_date: {
          lte: new Date(),
        },
      },
    });

    if (existingCommission) {
      console.log(`\n⚠️  Affiliate already has an eligible commission:`);
      console.log(`   Commission ID: ${existingCommission.id}`);
      console.log(`   Amount: $${existingCommission.amount}`);
      console.log(`   Status: ${existingCommission.status}`);
      console.log(`   Eligible Date: ${existingCommission.eligible_date}`);
      console.log(`\n✅ No action needed.`);
      return;
    }

    console.log(`\n📝 Creating a $1 test commission...`);
    
    // Create a test order attribution first (required for commission)
    const testOrderId = `TEST_${Date.now()}`;
    const testOrderNumber = `TEST-${Date.now()}`;
    
    const orderAttribution = await prisma.orderAttribution.create({
      data: {
        shopify_order_id: testOrderId,
        shopify_order_number: testOrderNumber,
        affiliate_id: affiliate.id,
        attribution_type: 'link',
        shopify_shop_id: affiliate.shopify_shop_id,
      },
    });

    console.log(`✅ Created order attribution: ${orderAttribution.id}`);

    // Create a $1 test commission with status 'eligible' and eligible_date set to now
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
          name: 'Test Commission',
          rule_type: 'flat',
          applies_to: 'one_time',
          value: 1.00,
        },
      },
    });

    console.log(`\n✅ Created test commission:`);
    console.log(`   Commission ID: ${testCommission.id}`);
    console.log(`   Amount: $${testCommission.amount}`);
    console.log(`   Status: ${testCommission.status}`);
    console.log(`   Eligible Date: ${testCommission.eligible_date}`);
    console.log(`   Order: ${testOrderNumber}`);
    console.log(`\n🎉 Commission is now eligible for payout!`);

  } catch (error: any) {
    console.error('❌ Error creating test commission:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestCommission();
