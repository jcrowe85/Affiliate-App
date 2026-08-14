import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import {
  confirmVerification,
  isPayoutDestinationVerified,
  normalizePhone,
  PayoutVerificationError,
  startVerification,
} from '@/lib/payout-verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startSchema = z.object({
  action: z.literal('start'),
  method: z.literal('venmo'),
  identifier: z.string().min(1),
});

const confirmSchema = z.object({
  action: z.literal('confirm'),
  code: z.string().min(1),
});

const bodySchema = z.union([startSchema, confirmSchema]);

/**
 * Verification state for this affiliate's payout destination — enough for the
 * UI to decide whether to prompt for a code, and to show the audit trail.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const affiliate = await prisma.affiliate.findFirst({
    where: { id: params.id, shopify_shop_id: admin.shopify_shop_id },
  });
  if (!affiliate) return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });

  const history = await prisma.payoutMethodVerification.findMany({
    where: { affiliate_id: affiliate.id },
    orderBy: { created_at: 'desc' },
    take: 10,
    select: {
      id: true,
      method: true,
      identifier: true,
      status: true,
      attempts: true,
      created_at: true,
      verified_at: true,
      expires_at: true,
      paypal_batch_id: true,
      initiated_by: true,
    },
  });

  const verified =
    affiliate.payout_method && affiliate.payout_identifier
      ? await isPayoutDestinationVerified(
          affiliate.id,
          affiliate.payout_method,
          affiliate.payout_identifier,
        )
      : false;

  return NextResponse.json({
    payout_method: affiliate.payout_method,
    payout_identifier: affiliate.payout_identifier,
    verified,
    pending: history.find((h) => h.status === 'pending') ?? null,
    history,
  });
}

/**
 * `start` sends a one-cent Venmo payment whose note carries a code.
 * `confirm` checks the code the affiliate read off that payment.
 *
 * Verifying the destination this way proves the number resolves to a Venmo
 * account that can receive our money — which a text message cannot.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Invalid request' },
        { status: 400 },
      );
    }

    const affiliate = await prisma.affiliate.findFirst({
      where: { id: params.id, shopify_shop_id: admin.shopify_shop_id },
    });
    if (!affiliate) return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });

    if (parsed.data.action === 'start') {
      const result = await startVerification({
        affiliateId: affiliate.id,
        method: parsed.data.method,
        identifier: parsed.data.identifier,
        shopifyShopId: admin.shopify_shop_id,
        initiatedBy: admin.id,
        initiatedIp:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      });

      // Record the destination being verified so the affiliate row and the
      // verification refer to the same number.
      await prisma.affiliate.update({
        where: { id: affiliate.id },
        data: {
          payout_method: 'venmo',
          payout_identifier: normalizePhone(parsed.data.identifier),
        },
      });

      return NextResponse.json({ ok: true, ...result });
    }

    const confirmed = await confirmVerification({
      affiliateId: affiliate.id,
      code: parsed.data.code,
    });
    return NextResponse.json({ ok: true, ...confirmed });
  } catch (error: any) {
    if (error instanceof PayoutVerificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Payout verification error:', error);
    return NextResponse.json(
      { error: error.message || 'Verification failed' },
      { status: 500 },
    );
  }
}
