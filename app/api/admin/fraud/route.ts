import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Get fraud queue - unresolved fraud flags
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const fraudFlags = await prisma.fraudFlag.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        resolved: false,
      },
      include: {
        commission: {
          include: {
            affiliate: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            order_attribution: {
              select: {
                shopify_order_number: true,
              },
            },
          },
        },
      },
      orderBy: {
        score: 'desc', // Highest risk first
      },
      skip,
      take: limit,
    });

    const total = await prisma.fraudFlag.count({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        resolved: false,
      },
    });

    return NextResponse.json({
      fraudFlags: fraudFlags.map(f => ({
        id: f.id,
        commission_id: f.commission_id,
        flag_type: f.flag_type,
        score: f.score,
        reason: f.reason,
        created_at: f.created_at,
        commission: {
          id: f.commission.id,
          amount: f.commission.amount.toString(),
          currency: f.commission.currency,
          status: f.commission.status,
          order_number: f.commission.order_attribution.shopify_order_number,
        },
        affiliate: {
          id: f.commission.affiliate.id,
          name: f.commission.affiliate.name,
          email: f.commission.affiliate.email,
        },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching fraud flags:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch fraud flags' },
      { status: 500 }
    );
  }
}