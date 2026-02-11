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
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get paid payout runs
    const payoutRuns = await prisma.payoutRun.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: 'paid',
      },
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
          // Don't filter - get all PayoutRunCommission records even if commission is null
        },
        _count: {
          select: {
            commissions: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Debug: Check if PayoutRunCommission records exist but commissions aren't loading
    if (payoutRuns.length > 0) {
      const sampleRunId = payoutRuns[0].id;
      const payoutRunCommissions = await prisma.payoutRunCommission.findMany({
        where: {
          payout_run_id: sampleRunId,
        },
        select: {
          id: true,
          commission_id: true,
        },
      });
      console.log('[Paid Payouts] Direct PayoutRunCommission query:', {
        payoutRunId: sampleRunId,
        commissionRecords: payoutRunCommissions.length,
        commissionIds: payoutRunCommissions.map(prc => prc.commission_id),
      });
      
      // Check if these commission IDs exist
      if (payoutRunCommissions.length > 0) {
        const commissionIds = payoutRunCommissions.map(prc => prc.commission_id);
        const actualCommissions = await prisma.commission.findMany({
          where: {
            id: { in: commissionIds },
          },
          select: {
            id: true,
            affiliate_id: true,
            amount: true,
          },
        });
        console.log('[Paid Payouts] Commission existence check:', {
          expectedCount: commissionIds.length,
          actualCount: actualCommissions.length,
          missingIds: commissionIds.filter(id => !actualCommissions.find(c => c.id === id)),
        });
      }
    }

    // Debug: Log payout runs to see what data we're getting
    console.log('[Paid Payouts] Fetched payout runs:', {
      count: payoutRuns.length,
      sample: payoutRuns[0] ? {
        id: payoutRuns[0].id,
        commissionCount: payoutRuns[0].commissions.length,
        firstCommission: payoutRuns[0].commissions[0] ? {
          commissionId: payoutRuns[0].commissions[0].commission.id,
          hasAffiliate: !!payoutRuns[0].commissions[0].commission.affiliate,
          affiliateId: payoutRuns[0].commissions[0].commission.affiliate_id,
          affiliateName: payoutRuns[0].commissions[0].commission.affiliate?.name,
          amount: payoutRuns[0].commissions[0].commission.amount.toString(),
        } : null,
      } : null,
    });

    // If commissions aren't loading via relation, fetch them directly
    // This handles cases where PayoutRunCommission exists but commission relation is null
    const runsWithMissingCommissions = payoutRuns.filter(run => run.commissions.length === 0);
    if (runsWithMissingCommissions.length > 0) {
      console.log('[Paid Payouts] Found runs with missing commissions, fetching directly...');
      for (const run of runsWithMissingCommissions) {
        const payoutRunCommissions = await prisma.payoutRunCommission.findMany({
          where: {
            payout_run_id: run.id,
          },
          select: {
            commission_id: true,
          },
        });
        
        if (payoutRunCommissions.length > 0) {
          const commissionIds = payoutRunCommissions.map(prc => prc.commission_id);
          const commissions = await prisma.commission.findMany({
            where: {
              id: { in: commissionIds },
              shopify_shop_id: admin.shopify_shop_id,
            },
            include: {
              affiliate: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  paypal_email: true,
                },
              },
              order_attribution: {
                select: {
                  shopify_order_number: true,
                },
              },
            },
          });
          
          // Manually attach commissions to the run
          (run as any).commissions = commissions.map(c => ({
            commission: c,
          }));
          
          console.log('[Paid Payouts] Fetched commissions directly for run:', {
            payoutRunId: run.id,
            commissionCount: commissions.length,
            hasAffiliate: commissions[0]?.affiliate ? true : false,
          });
        }
      }
    }

    // Collect affiliate IDs that need to be fetched (where relation didn't load)
    const missingAffiliateIds = new Set<string>();
    payoutRuns.forEach(run => {
      if (run.commissions.length > 0) {
        const hasAffiliate = run.commissions.some(pc => pc.commission && pc.commission.affiliate);
        if (!hasAffiliate) {
          const firstCommission = run.commissions[0]?.commission;
          if (firstCommission && firstCommission.affiliate_id) {
            missingAffiliateIds.add(firstCommission.affiliate_id);
          }
        }
      }
    });

    // Fetch missing affiliates in one query
    const missingAffiliates = missingAffiliateIds.size > 0
      ? await prisma.affiliate.findMany({
          where: { id: { in: Array.from(missingAffiliateIds) } },
          select: {
            id: true,
            name: true,
            email: true,
            paypal_email: true,
          },
        })
      : [];
    const affiliateMap = new Map(missingAffiliates.map(a => [a.id, a]));

    const paidPayouts = payoutRuns.map(run => {
      // Check if commissions array is empty
      if (run.commissions.length === 0) {
        console.warn('[Paid Payouts] Payout run has no commissions:', {
          payoutRunId: run.id,
          commissionCountFromCount: run._count.commissions,
          actualCommissionCount: run.commissions.length,
        });
        return {
          id: run.id,
          affiliate_id: '',
          affiliate_name: 'Unknown',
          affiliate_email: '',
          paypal_email: null,
          total_amount: '0.00',
          currency: 'USD',
          commission_count: run._count.commissions,
          payout_reference: run.payout_reference,
          paypal_batch_id: (run as any).paypal_batch_id || null,
          paypal_status: (run as any).paypal_status || null,
          payout_method: (run as any).payout_method || 'manual',
          period_start: run.period_start.toISOString(),
          period_end: run.period_end.toISOString(),
          created_at: run.created_at.toISOString(),
          updated_at: run.updated_at.toISOString(),
          commissions: [],
        };
      }

      // Filter out any null commissions (in case commission was deleted)
      const validCommissions = run.commissions.filter(pc => pc.commission !== null);
      
      if (validCommissions.length === 0) {
        console.warn('[Paid Payouts] Payout run has no valid commissions (all null):', {
          payoutRunId: run.id,
          totalCommissions: run.commissions.length,
          commissionCountFromCount: run._count.commissions,
        });
        return {
          id: run.id,
          affiliate_id: '',
          affiliate_name: 'Unknown',
          affiliate_email: '',
          paypal_email: null,
          total_amount: '0.00',
          currency: 'USD',
          commission_count: run._count.commissions,
          payout_reference: run.payout_reference,
          paypal_batch_id: (run as any).paypal_batch_id || null,
          paypal_status: (run as any).paypal_status || null,
          payout_method: (run as any).payout_method || 'manual',
          period_start: run.period_start.toISOString(),
          period_end: run.period_end.toISOString(),
          created_at: run.created_at.toISOString(),
          updated_at: run.updated_at.toISOString(),
          commissions: [],
        };
      }

      // Calculate total amount and get currency from all valid commissions
      const totalAmount = validCommissions.reduce(
        (sum, pc) => {
          if (!pc.commission) return sum;
          const amount = parseFloat(pc.commission.amount.toString());
          if (isNaN(amount)) {
            console.warn('[Paid Payouts] Invalid amount in commission:', {
              commissionId: pc.commission.id,
              amount: pc.commission.amount,
              amountType: typeof pc.commission.amount,
            });
            return sum;
          }
          return sum + amount;
        },
        0
      );
      const currency = validCommissions[0]?.commission.currency || 'USD';
      
      // Get affiliate from commissions - try to find one with affiliate data
      // If multiple affiliates in one payout (shouldn't happen but handle it), use the first one
      let affiliate = null;
      for (const pc of validCommissions) {
        if (pc.commission && pc.commission.affiliate) {
          affiliate = pc.commission.affiliate;
          break;
        }
      }
      
      // Fallback: If affiliate relation didn't load, use the map we fetched
      if (!affiliate && validCommissions.length > 0) {
        const firstCommission = validCommissions[0].commission;
        if (firstCommission && firstCommission.affiliate_id) {
          affiliate = affiliateMap.get(firstCommission.affiliate_id) || null;
        }
        
        // Log for debugging if still no affiliate
        if (!affiliate) {
          console.warn('[Paid Payouts] No affiliate found for payout run:', {
            payoutRunId: run.id,
            commissionCount: validCommissions.length,
            firstCommissionId: firstCommission?.id,
            firstCommissionAffiliateId: firstCommission?.affiliate_id,
            hasCommissions: validCommissions.length > 0,
            affiliateMapSize: affiliateMap.size,
            missingAffiliateIds: Array.from(missingAffiliateIds),
          });
        }
      }

      // Log if amount is 0 but we have commissions
      if (totalAmount === 0 && run.commissions.length > 0) {
        console.warn('[Paid Payouts] Total amount is 0 but commissions exist:', {
          payoutRunId: run.id,
          commissionCount: run.commissions.length,
          firstCommissionAmount: run.commissions[0]?.commission.amount?.toString(),
          allAmounts: run.commissions.map(pc => pc.commission.amount?.toString()),
        });
      }

      return {
        id: run.id,
        affiliate_id: affiliate?.id || '',
        affiliate_name: affiliate?.name || 'Unknown',
        affiliate_email: affiliate?.email || '',
        paypal_email: affiliate?.paypal_email || null,
        total_amount: totalAmount > 0 ? totalAmount.toFixed(2) : '0.00',
        currency,
        commission_count: run._count.commissions,
        payout_reference: run.payout_reference,
        paypal_batch_id: (run as any).paypal_batch_id || null,
        paypal_status: (run as any).paypal_status || null,
        payout_method: (run as any).payout_method || 'manual',
        period_start: run.period_start.toISOString(),
        period_end: run.period_end.toISOString(),
        created_at: run.created_at.toISOString(),
        updated_at: run.updated_at.toISOString(),
        commissions: validCommissions
          .filter(pc => pc.commission !== null)
          .map(pc => ({
            id: pc.commission!.id,
            order_number: pc.commission!.order_attribution?.shopify_order_number || pc.commission!.shopify_order_id,
            amount: pc.commission!.amount.toString(),
            currency: pc.commission!.currency,
            created_at: pc.commission!.created_at.toISOString(),
          })),
      };
    });

    // Get total count for pagination
    const totalCount = await prisma.payoutRun.count({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: 'paid',
      },
    });

    return NextResponse.json({
      payouts: paidPayouts,
      total: totalCount,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('Error fetching paid payouts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch paid payouts' },
      { status: 500 }
    );
  }
}
