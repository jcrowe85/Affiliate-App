import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getTimeRangeMs(timeRange: string): number {
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };
  return ranges[timeRange] || ranges['30d'];
}

function getIntervalForRange(timeRange: string): { interval: string; format: string } {
  switch (timeRange) {
    case '1h':
      return { interval: 'minute', format: 'HH:mm' };
    case '24h':
      return { interval: 'hour', format: 'MMM dd HH:mm' };
    case '7d':
      return { interval: 'day', format: 'MMM dd' };
    case '30d':
    case '90d':
      return { interval: 'day', format: 'MMM dd' };
    default:
      return { interval: 'day', format: 'MMM dd' };
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shopifyShopId = admin.shopify_shop_id;
    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get('timeRange') || '30d';

    const timeRangeMs = getTimeRangeMs(timeRange);
    const startDate = new Date(Date.now() - timeRangeMs);
    const { interval, format } = getIntervalForRange(timeRange);

    // Fetch revenue data (order totals) grouped by date
    const revenueData = await prisma.orderAttribution.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
        created_at: {
          gte: startDate,
        },
        commissions: {
          some: {
            status: { not: 'reversed' },
          },
        },
      },
      select: {
        order_total: true,
        created_at: true,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    // Fetch commissions paid data grouped by date
    const commissionsData = await prisma.commission.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
        status: 'paid',
        created_at: {
          gte: startDate,
        },
      },
      select: {
        amount: true,
        created_at: true,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    // Group revenue by time interval
    const revenueByDate = new Map<string, number>();
    revenueData.forEach((order) => {
      const date = new Date(order.created_at);
      let key: string;
      
      if (interval === 'minute') {
        key = date.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
      } else if (interval === 'hour') {
        key = date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      } else {
        key = date.toISOString().slice(0, 10); // YYYY-MM-DD
      }
      
      const current = revenueByDate.get(key) || 0;
      revenueByDate.set(key, current + parseFloat(order.order_total?.toString() || '0'));
    });

    // Group commissions by time interval
    const commissionsByDate = new Map<string, number>();
    commissionsData.forEach((commission) => {
      const date = new Date(commission.created_at);
      let key: string;
      
      if (interval === 'minute') {
        key = date.toISOString().slice(0, 16);
      } else if (interval === 'hour') {
        key = date.toISOString().slice(0, 13);
      } else {
        key = date.toISOString().slice(0, 10);
      }
      
      const current = commissionsByDate.get(key) || 0;
      commissionsByDate.set(key, current + parseFloat(commission.amount.toString()));
    });

    // Generate all intervals in the range
    const allIntervals: string[] = [];
    const now = new Date();
    const step = interval === 'minute' ? 60 * 1000 : interval === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    
    // Create a Set to track unique intervals
    const intervalSet = new Set<string>();
    
    // Add intervals from actual data
    revenueByDate.forEach((_, key) => intervalSet.add(key));
    commissionsByDate.forEach((_, key) => intervalSet.add(key));
    
    // Fill in gaps to ensure continuous range
    for (let d = new Date(startDate); d <= now; d = new Date(d.getTime() + step)) {
      let key: string;
      if (interval === 'minute') {
        key = d.toISOString().slice(0, 16);
      } else if (interval === 'hour') {
        key = d.toISOString().slice(0, 13);
      } else {
        key = d.toISOString().slice(0, 10);
      }
      intervalSet.add(key);
    }
    
    // Convert to sorted array
    allIntervals.push(...Array.from(intervalSet).sort())

    // Format data for chart
    const chartData = allIntervals.map((key) => {
      const date = new Date(key + (interval === 'minute' ? ':00' : interval === 'hour' ? ':00:00' : 'T00:00:00'));
      const revenue = revenueByDate.get(key) || 0;
      const commissions = commissionsByDate.get(key) || 0;
      
      let dateLabel: string;
      if (format === 'HH:mm') {
        dateLabel = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      } else if (format === 'MMM dd HH:mm') {
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
      } else {
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

      return {
        date: dateLabel,
        revenue: Math.round(revenue * 100) / 100,
        commissions: Math.round(commissions * 100) / 100,
      };
    });

    return NextResponse.json({ data: chartData });
  } catch (error: any) {
    console.error('Chart data error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch chart data' },
      { status: 500 }
    );
  }
}
