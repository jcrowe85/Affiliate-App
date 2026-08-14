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

export type PayoutMethod = 'venmo' | 'paypal';

/**
 * Spend caps for the public application form.
 *
 * Every send costs a $0.25 PayPal fee, so an unauthenticated endpoint that
 * triggers one is a way to spend our money at will. These bound the damage: a
 * scripted attack can burn a few dollars, not a few thousand.
 */
const MAX_SENDS_PER_IP_PER_HOUR = 5;
const MAX_SENDS_PER_IDENTIFIER_PER_DAY = 3;
const MAX_SENDS_PER_APPLICANT_PER_DAY = 5;

/** Normalises a destination for the given rail so formatting never masks a match. */
export function normalizeIdentifier(method: PayoutMethod, raw: string): string {
  return method === 'venmo' ? normalizePhone(raw) : raw.trim().toLowerCase();
}

export function isValidIdentifier(method: PayoutMethod, raw: string): boolean {
  return method === 'venmo'
    ? isValidUsMobile(raw)
    : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

async function assertWithinSpendLimits(opts: {
  identifier: string;
  ip?: string | null;
  applicantEmail?: string | null;
}): Promise<void> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (opts.ip) {
    const fromIp = await prisma.payoutMethodVerification.count({
      where: { initiated_ip: opts.ip, created_at: { gte: hourAgo } },
    });
    if (fromIp >= MAX_SENDS_PER_IP_PER_HOUR) {
      throw new PayoutVerificationError(
        'Too many verification attempts from this connection. Try again in an hour.',
        429,
      );
    }
  }

  const forIdentifier = await prisma.payoutMethodVerification.count({
    where: { identifier: opts.identifier, created_at: { gte: dayAgo } },
  });
  if (forIdentifier >= MAX_SENDS_PER_IDENTIFIER_PER_DAY) {
    throw new PayoutVerificationError(
      'This destination has been sent too many verification payments today. Try again tomorrow.',
      429,
    );
  }

  if (opts.applicantEmail) {
    const forApplicant = await prisma.payoutMethodVerification.count({
      where: { applicant_email: opts.applicantEmail, created_at: { gte: dayAgo } },
    });
    if (forApplicant >= MAX_SENDS_PER_APPLICANT_PER_DAY) {
      throw new PayoutVerificationError(
        'Too many verification attempts for this application. Try again tomorrow.',
        429,
      );
    }
  }
}

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
  /** Set for an existing affiliate; omitted while an applicant is still applying. */
  affiliateId?: string | null;
  /** Ties a pre-signup verification to the application being filled in. */
  applicantEmail?: string | null;
  method: PayoutMethod;
  identifier: string;
  shopifyShopId: string;
  initiatedBy: string;
  initiatedIp?: string | null;
}): Promise<{ verification_id: string; paypal_batch_id: string | null; sent_to: string }> {
  if (opts.method !== 'venmo' && opts.method !== 'paypal') {
    throw new PayoutVerificationError(`Unsupported payout method: ${opts.method}`);
  }
  if (!isValidIdentifier(opts.method, opts.identifier)) {
    throw new PayoutVerificationError(
      opts.method === 'venmo'
        ? 'Enter a 10-digit US mobile number. Venmo payouts are US-only.'
        : 'Enter a valid PayPal email address.',
    );
  }

  const identifier = normalizeIdentifier(opts.method, opts.identifier);
  const applicantEmail = opts.applicantEmail?.trim().toLowerCase() || null;

  if (
    opts.affiliateId &&
    (await isPayoutDestinationVerified(opts.affiliateId, opts.method, identifier))
  ) {
    throw new PayoutVerificationError('This destination is already verified.', 409);
  }

  await assertWithinSpendLimits({
    identifier,
    ip: opts.initiatedIp,
    applicantEmail,
  });

  // A stale pending code must not be usable against a different destination.
  await prisma.payoutMethodVerification.updateMany({
    where: {
      status: 'pending',
      ...(opts.affiliateId
        ? { affiliate_id: opts.affiliateId }
        : { applicant_email: applicantEmail }),
    },
    data: { status: 'expired' },
  });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  const verification = await prisma.payoutMethodVerification.create({
    data: {
      affiliate_id: opts.affiliateId ?? null,
      applicant_email: applicantEmail,
      method: opts.method,
      identifier,
      code_hash: hashCode(code),
      status: 'pending',
      expires_at: expiresAt,
      initiated_by: opts.initiatedBy,
      initiated_ip: opts.initiatedIp ?? null,
      shopify_shop_id: opts.shopifyShopId,
    },
  });

  // Both rails carry the code in the note the recipient sees; only the
  // addressing differs.
  const items: PayPalPayoutItem[] =
    opts.method === 'venmo'
      ? [
          {
            recipient_type: 'PHONE',
            recipient_wallet: 'VENMO',
            amount: { value: VERIFICATION_AMOUNT, currency: 'USD' },
            receiver: identifier,
            note: `Fleur verification code ${code} — enter this to confirm your payout number.`,
            sender_item_id: verification.id,
          },
        ]
      : [
          {
            recipient_type: 'EMAIL',
            amount: { value: VERIFICATION_AMOUNT, currency: 'USD' },
            receiver: identifier,
            note: `Fleur verification code ${code} — enter this to confirm your payout email.`,
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
      sent_to: identifier,
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
  /** Either identifies an affiliate's attempt, or the specific pre-signup row. */
  affiliateId?: string | null;
  verificationId?: string | null;
  code: string;
}): Promise<{ verified: true; identifier: string; method: string; verification_id: string }> {
  // A pre-signup applicant has no session, so the unguessable row id is what
  // proves the code being answered is theirs.
  const verification = opts.verificationId
    ? await prisma.payoutMethodVerification.findFirst({
        where: { id: opts.verificationId, status: 'pending' },
      })
    : await prisma.payoutMethodVerification.findFirst({
        where: { affiliate_id: opts.affiliateId ?? undefined, status: 'pending' },
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

  return {
    verified: true,
    identifier: verification.identifier,
    method: verification.method,
    verification_id: verification.id,
  };
}

/**
 * Confirms a pre-signup verification really is verified and matches what the
 * application claims, before the choice is written to the application.
 *
 * The client hands back the row id it was given; trusting the submitted method
 * and identifier without rechecking would let anyone claim a verified
 * destination they never proved.
 */
export async function assertApplicantVerification(opts: {
  verificationId: string;
  method: PayoutMethod;
  identifier: string;
  applicantEmail: string;
}): Promise<void> {
  const row = await prisma.payoutMethodVerification.findUnique({
    where: { id: opts.verificationId },
  });

  const expected = normalizeIdentifier(opts.method, opts.identifier);
  if (
    !row ||
    row.status !== 'verified' ||
    row.method !== opts.method ||
    row.identifier !== expected ||
    row.applicant_email !== opts.applicantEmail.trim().toLowerCase()
  ) {
    throw new PayoutVerificationError(
      'Your payout destination has not been verified. Send a verification payment and enter the code.',
      403,
    );
  }
}
