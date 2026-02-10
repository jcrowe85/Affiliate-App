import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const affiliateId = searchParams.get('affiliate_id');
    const format = searchParams.get('format') || 'json'; // json or csv

    // Build where clause
    const where: any = {
      shopify_shop_id: admin.shopify_shop_id,
      status: 'paid',
    };

    if (startDate) {
      where.created_at = { ...where.created_at, gte: new Date(startDate) };
    }

    if (endDate) {
      where.created_at = { ...where.created_at, lte: new Date(endDate) };
    }

    if (affiliateId) {
      where.affiliate_id = affiliateId;
    }

    // Get paid payout runs with full details
    const payoutRuns = await prisma.payoutRun.findMany({
      where,
      include: {
        commissions: {
          include: {
            commission: {
              include: {
                affiliate: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    paypal_email: true,
                    affiliate_number: true,
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
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Calculate summary statistics
    const totalPayouts = payoutRuns.length;
    const totalAmount = payoutRuns.reduce((sum, run) => {
      const runTotal = run.commissions.reduce(
        (s, pc) => s + parseFloat(pc.commission.amount.toString()),
        0
      );
      return sum + runTotal;
    }, 0);
    const totalCommissions = payoutRuns.reduce(
      (sum, run) => sum + run.commissions.length,
      0
    );

    // Format payout data
    const payouts = payoutRuns.map(run => {
      const runTotal = run.commissions.reduce(
        (sum, pc) => sum + parseFloat(pc.commission.amount.toString()),
        0
      );
      const currency = run.commissions[0]?.commission.currency || 'USD';
      const affiliate = run.commissions[0]?.commission.affiliate;

      return {
        payout_id: run.id,
        payout_date: run.created_at.toISOString(),
        affiliate_id: affiliate?.id || '',
        affiliate_number: affiliate?.affiliate_number || null,
        affiliate_name: affiliate?.name || 'Unknown',
        affiliate_email: affiliate?.email || '',
        paypal_email: affiliate?.paypal_email || null,
        total_amount: runTotal.toFixed(2),
        currency,
        commission_count: run.commissions.length,
        payout_reference: run.payout_reference,
        paypal_batch_id: (run as any).paypal_batch_id || null,
        paypal_status: (run as any).paypal_status || null,
        payout_method: (run as any).payout_method || 'manual',
        period_start: run.period_start.toISOString(),
        period_end: run.period_end.toISOString(),
        commissions: run.commissions.map(pc => ({
          commission_id: pc.commission.id,
          order_number: pc.commission.order_attribution?.shopify_order_number || pc.commission.shopify_order_id,
          amount: pc.commission.amount.toString(),
          currency: pc.commission.currency,
          commission_date: pc.commission.created_at.toISOString(),
        })),
      };
    });

    // If CSV format requested, return CSV
    if (format === 'csv') {
      const csvRows: string[] = [];
      
      // Header row
      csvRows.push([
        'Payout ID',
        'Payout Date',
        'Affiliate Number',
        'Affiliate Name',
        'Affiliate Email',
        'PayPal Email',
        'Total Amount',
        'Currency',
        'Commission Count',
        'Payout Reference',
        'PayPal Batch ID',
        'PayPal Status',
        'Payout Method',
        'Period Start',
        'Period End',
      ].join(','));

      // Data rows
      payouts.forEach(payout => {
        csvRows.push([
          payout.payout_id,
          payout.payout_date,
          payout.affiliate_number || '',
          `"${payout.affiliate_name.replace(/"/g, '""')}"`,
          payout.affiliate_email,
          payout.paypal_email || '',
          payout.total_amount,
          payout.currency,
          payout.commission_count.toString(),
          payout.payout_reference || '',
          payout.paypal_batch_id || '',
          payout.paypal_status || '',
          payout.payout_method,
          payout.period_start,
          payout.period_end,
        ].join(','));
      });

      const csv = csvRows.join('\n');
      
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="payout-report-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Return JSON format
    return NextResponse.json({
      summary: {
        total_payouts: totalPayouts,
        total_amount: totalAmount.toFixed(2),
        total_commissions: totalCommissions,
        currency: payouts[0]?.currency || 'USD',
        date_range: {
          start: startDate || null,
          end: endDate || null,
        },
      },
      payouts,
    });
  } catch (error: any) {
    console.error('Error generating payout report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate payout report' },
      { status: 500 }
    );
  }
}
