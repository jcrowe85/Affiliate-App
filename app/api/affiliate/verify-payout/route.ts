import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  confirmVerification,
  PayoutVerificationError,
  startVerification,
} from '@/lib/payout-verification';
import { getTrustedClientIp, isPlatformHosted, resolveShopId } from '@/lib/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startSchema = z.object({
  action: z.literal('start'),
  method: z.enum(['venmo', 'paypal']),
  identifier: z.string().min(1),
  /** The email on the application, used to group and rate-limit attempts. */
  applicant_email: z.string().email(),
});

const confirmSchema = z.object({
  action: z.literal('confirm'),
  verification_id: z.string().min(1),
  code: z.string().min(1),
});

/**
 * Payout verification for applicants who have no account yet.
 *
 * Public and unauthenticated by necessity — the applicant is proving where to
 * pay them before they exist as an affiliate. Each `start` spends $0.25 in
 * PayPal fees, so the spend caps in lib/payout-verification are what stand
 * between this endpoint and an expensive afternoon.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = z.union([startSchema, confirmSchema]).safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Invalid request' },
        { status: 400 },
      );
    }

    if (parsed.data.action === 'start') {
      // Only a platform-set header is trusted here. x-forwarded-for is
      // caller-controlled, so a cap keyed on it caps nothing — and treating a
      // missing value as "unlimited" turned the cap off entirely for anyone who
      // simply omitted the header. Refuse instead.
      const ip = getTrustedClientIp(request);
      if (!ip && isPlatformHosted()) {
        return NextResponse.json(
          { error: 'Could not verify the origin of this request. Please try again.' },
          { status: 400 },
        );
      }

      const shopId = await resolveShopId();
      if (!shopId) {
        return NextResponse.json(
          { error: 'Applications are not available right now. Please contact support.' },
          { status: 503 },
        );
      }

      const result = await startVerification({
        applicantEmail: parsed.data.applicant_email,
        method: parsed.data.method,
        identifier: parsed.data.identifier,
        shopifyShopId: shopId,
        initiatedBy: 'applicant',
        initiatedIp: ip,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const confirmed = await confirmVerification({
      verificationId: parsed.data.verification_id,
      code: parsed.data.code,
    });
    return NextResponse.json({ ok: true, ...confirmed });
  } catch (error: any) {
    if (error instanceof PayoutVerificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Applicant payout verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
