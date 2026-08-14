import crypto from 'crypto';
import { prisma } from './db';
import { createPayPalPayout, PayPalPayoutItem } from './paypal';

/**
 * Proves an affiliate controls the payout destination before real money is sent
 * there.
 *
 * A payout to a phone number is irreversible once claimed, and PayPal returns no
 * recipient name — a successful payment to a mistyped number looks exactly like
 * a successful payment to the right one. So the destination has to be proven
 * before it is trusted.
 *
 * The code is delivered *through the payout rail itself*: a one-cent Venmo
 * payment whose note carries the code. That proves more than an SMS code would —
 * not just that someone holds the phone, but that the number resolves to a Venmo
 * account which can actually receive money from us. It is the same path the real
 * payout will take.
 */

/** How long a code stays usable. Long enough to notice the payment, short enough to matter. */
const CODE_TTL_MINUTES = 60;
/** Guessing limit before a code is burned. Six digits, so brute force is the only attack. */
const MAX_ATTEMPTS = 5;
/** Cent-value carrier for the code. The $0.25 PayPal fee dominates either way. */
const VERIFICATION_AMOUNT = '0.01';

export type PayoutMethod = 'venmo';

export class PayoutVerificationError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'PayoutVerificationError';
  }
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/** Six digits, uniformly random — Math.random is not acceptable for this. */
function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Digits only, so formatting differences never look like a different number. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // Tolerate a leading US country code so "+1 760…" and "760…" are one number.
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export function isValidUsMobile(raw: string): boolean {
  return /^\d{10}$/.test(normalizePhone(raw));
}

/**
 * True when this affiliate's *current* payout destination has been proven.
 *
 * Deliberately compares against the identifier stored on the verification row
 * rather than trusting a flag: changing the number on the affiliate record
 * invalidates the old proof automatically, because the identifiers no longer
 * match.
 */
export async function isPayoutDestinationVerified(
  affiliateId: string,
  method: string,
  identifier: string,
): Promise<boolean> {
  const normalized = method === 'venmo' ? normalizePhone(identifier) : identifier.trim().toLowerCase();
  const hit = await prisma.payoutMethodVerification.findFirst({
    where: {
      affiliate_id: affiliateId,
      method,
      identifier: normalized,
      status: 'verified',
    },
    orderBy: { verified_at: 'desc' },
  });
  return Boolean(hit);
}

/**
 * Sends the one-cent payment carrying a fresh code and records the attempt.
 *
 * Any earlier pending attempt for this affiliate is expired first, so a code
 * from a previous number can never be used to verify a new one.
 */
export async function startVerification(opts: {
  affiliateId: string;
  method: PayoutMethod;
  identifier: string;
  shopifyShopId: string;
  initiatedBy: string;
  initiatedIp?: string | null;
}): Promise<{ verification_id: string; paypal_batch_id: string | null; sent_to: string }> {
  if (opts.method !== 'venmo') {
    throw new PayoutVerificationError(`Unsupported payout method: ${opts.method}`);
  }
  if (!isValidUsMobile(opts.identifier)) {
    throw new PayoutVerificationError(
      'Enter a 10-digit US mobile number. Venmo payouts are US-only.',
    );
  }

  const phone = normalizePhone(opts.identifier);

  if (await isPayoutDestinationVerified(opts.affiliateId, opts.method, phone)) {
    throw new PayoutVerificationError('This number is already verified.', 409);
  }

  // A stale pending code must not be usable against a different number.
  await prisma.payoutMethodVerification.updateMany({
    where: { affiliate_id: opts.affiliateId, status: 'pending' },
    data: { status: 'expired' },
  });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  const verification = await prisma.payoutMethodVerification.create({
    data: {
      affiliate_id: opts.affiliateId,
      method: opts.method,
      identifier: phone,
      code_hash: hashCode(code),
      status: 'pending',
      expires_at: expiresAt,
      initiated_by: opts.initiatedBy,
      initiated_ip: opts.initiatedIp ?? null,
      shopify_shop_id: opts.shopifyShopId,
    },
  });

  const items: PayPalPayoutItem[] = [
    {
      recipient_type: 'PHONE',
      recipient_wallet: 'VENMO',
      amount: { value: VERIFICATION_AMOUNT, currency: 'USD' },
      receiver: phone,
      note: `Fleur verification code ${code} — enter this to confirm your payout number.`,
      sender_item_id: verification.id,
    },
  ];

  try {
    // Keyed off the verification row, not the clock, so a retried request cannot
    // send a second cent.
    const result = await createPayPalPayout(
      items,
      `VERIFY_${verification.id}`,
      'Confirm your payout number',
      'Enter the code in this payment to confirm where your commissions should be sent.',
    );
    const updated = await prisma.payoutMethodVerification.update({
      where: { id: verification.id },
      data: { paypal_batch_id: result.batch_id },
    });
    return {
      verification_id: updated.id,
      paypal_batch_id: updated.paypal_batch_id,
      sent_to: phone,
    };
  } catch (err: any) {
    await prisma.payoutMethodVerification.update({
      where: { id: verification.id },
      data: { status: 'failed' },
    });
    throw new PayoutVerificationError(
      `Could not send the verification payment: ${err?.message ?? 'unknown error'}`,
      502,
    );
  }
}

/**
 * Checks a submitted code. Counts the attempt either way, so a wrong guess is
 * as much a matter of record as a right one.
 */
export async function confirmVerification(opts: {
  affiliateId: string;
  code: string;
}): Promise<{ verified: true; identifier: string }> {
  const verification = await prisma.payoutMethodVerification.findFirst({
    where: { affiliate_id: opts.affiliateId, status: 'pending' },
    orderBy: { created_at: 'desc' },
  });

  if (!verification) {
    throw new PayoutVerificationError(
      'No verification is in progress. Send a verification payment first.',
      404,
    );
  }

  if (verification.expires_at < new Date()) {
    await prisma.payoutMethodVerification.update({
      where: { id: verification.id },
      data: { status: 'expired' },
    });
    throw new PayoutVerificationError('That code has expired. Send a new verification payment.', 410);
  }

  if (verification.attempts >= MAX_ATTEMPTS) {
    await prisma.payoutMethodVerification.update({
      where: { id: verification.id },
      data: { status: 'failed' },
    });
    throw new PayoutVerificationError('Too many incorrect attempts. Send a new verification payment.', 429);
  }

  const submitted = opts.code.replace(/\D/g, '');
  const expected = verification.code_hash;
  const actual = hashCode(submitted);
  // Constant-time compare: the hashes are equal length, so this is safe.
  const matches =
    actual.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));

  if (!matches) {
    await prisma.payoutMethodVerification.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });
    const left = MAX_ATTEMPTS - (verification.attempts + 1);
    throw new PayoutVerificationError(
      left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code.',
    );
  }

  await prisma.payoutMethodVerification.update({
    where: { id: verification.id },
    data: { status: 'verified', verified_at: new Date(), attempts: { increment: 1 } },
  });

  return { verified: true, identifier: verification.identifier };
}
