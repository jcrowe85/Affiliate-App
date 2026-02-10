import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin, verifyPassword, hashPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to verify password for an affiliate
 * SECURITY: Admin only
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { affiliateId, testPassword } = await request.json();

    if (!affiliateId || !testPassword) {
      return NextResponse.json(
        { error: 'affiliateId and testPassword are required' },
        { status: 400 }
      );
    }

    const affiliate = await prisma.affiliate.findFirst({
      where: {
        id: affiliateId,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    const result = {
      affiliate_id: affiliate.id,
      email: affiliate.email,
      has_password_hash: !!affiliate.password_hash,
      password_hash_length: affiliate.password_hash?.length || 0,
      password_hash_preview: affiliate.password_hash ? affiliate.password_hash.substring(0, 20) + '...' : null,
      test_password: testPassword,
      test_password_length: testPassword.length,
      verification_result: null as boolean | null,
    };

    if (affiliate.password_hash) {
      result.verification_result = await verifyPassword(testPassword, affiliate.password_hash);
    }

    // Also test with trimmed password
    const trimmedTest = testPassword.trim();
    let trimmedVerification = null;
    if (affiliate.password_hash && trimmedTest !== testPassword) {
      trimmedVerification = await verifyPassword(trimmedTest, affiliate.password_hash);
    }

    return NextResponse.json({
      ...result,
      trimmed_verification: trimmedVerification,
    });
  } catch (error: any) {
    console.error('Test password error:', error);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}
