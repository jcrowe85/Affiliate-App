import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * List pending affiliate applications for this shop, newest first.
 * Drives the Affiliates nav badge and the pending list in AffiliateManagement.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get('status') || 'pending';

    const applications = await prisma.affiliateApplication.findMany({
      where: { shopify_shop_id: admin.shopify_shop_id, status },
      orderBy: { created_at: 'desc' },
      // password_hash is deliberately excluded — the admin never needs it.
      select: {
        id: true,
        first_name: true,
        last_name: true,
        company: true,
        email: true,
        paypal_email: true,
        address_line1: true,
        address_line2: true,
        city: true,
        state: true,
        zip: true,
        phone: true,
        status: true,
        created_at: true,
      },
    });

    return NextResponse.json({ applications, count: applications.length });
  } catch (error) {
    console.error('[applications] Failed to list applications:', error);
    return NextResponse.json(
      { error: 'Failed to load applications' },
      { status: 500 }
    );
  }
}
