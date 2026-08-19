/**
 * Orchestration across the three stages.
 *
 * Each function is safe to run repeatedly and safe to interrupt: state lives in
 * the database between stages, never in a long-lived in-process list. A killed
 * send run resumes where it stopped, and nobody gets a second email because of
 * it.
 */

import { prisma } from '@/lib/db';
import { randomBytes } from 'crypto';
import type { SourcedCreator } from './trybe';
import { resolveProfiles, chunk } from './instagram';
import { normalizeEmail } from './email-extract';
import { defaultCopy, sendOutreach, type OutreachCopy } from './outreach-email';

/** Cheap, unguessable token for unsubscribe links. */
function unsubToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Resolves the shop these leads belong to.
 *
 * Scripts run outside a request, so there is no admin session to read it from.
 * SHOPIFY_SHOP_ID wins; otherwise we take the only shop on record and refuse
 * to guess when there is more than one.
 */
export async function resolveShopId(): Promise<string> {
  const configured = process.env.SHOPIFY_SHOP_ID?.trim();
  if (configured) return configured;

  const shops = await prisma.adminUser.findMany({
    select: { shopify_shop_id: true },
    distinct: ['shopify_shop_id'],
  });

  if (shops.length === 1) return shops[0].shopify_shop_id;
  if (shops.length === 0) throw new Error('No admin user found — cannot determine the shop.');
  throw new Error(
    `Several shops on record (${shops.map((s) => s.shopify_shop_id).join(', ')}). ` +
      'Set SHOPIFY_SHOP_ID to pick one.'
  );
}

async function logEvent(
  leadId: string,
  type: string,
  detail?: string,
  providerMessageId?: string | null
) {
  await prisma.creatorOutreachEvent.create({
    data: { lead_id: leadId, type, detail: detail?.slice(0, 2000), provider_message_id: providerMessageId ?? null },
  });
}

/** Handles and emails we must never contact, for one shop. */
async function suppressionSets(shopId: string) {
  const [rows, affiliates] = await Promise.all([
    prisma.creatorSuppression.findMany({
      where: { shopify_shop_id: shopId },
      select: { email: true, instagram_handle: true },
    }),
    // Existing affiliates are already ours. Cold-pitching someone who is
    // signed up reads as incompetence and is the single most likely way this
    // pipeline embarrasses the brand.
    prisma.affiliate.findMany({
      where: { shopify_shop_id: shopId },
      select: { email: true },
    }),
  ]);

  const emails = new Set<string>();
  const handles = new Set<string>();
  for (const row of rows) {
    if (row.email) emails.add(normalizeEmail(row.email));
    if (row.instagram_handle) handles.add(row.instagram_handle.toLowerCase());
  }
  for (const affiliate of affiliates) emails.add(normalizeEmail(affiliate.email));

  return { emails, handles };
}

export type IngestSummary = {
  seen: number;
  created: number;
  alreadyKnown: number;
  suppressed: number;
};

/**
 * Stage 1 output -> leads.
 *
 * Upserts on (shop, handle) so re-running a filter, or running two overlapping
 * filters, converges on one row per creator instead of duplicating them.
 */
export async function ingestSourced(
  shopId: string,
  creators: SourcedCreator[],
  label: string | null
): Promise<IngestSummary> {
  const { handles } = await suppressionSets(shopId);
  const summary: IngestSummary = { seen: creators.length, created: 0, alreadyKnown: 0, suppressed: 0 };

  for (const creator of creators) {
    if (handles.has(creator.instagramHandle)) {
      summary.suppressed++;
      continue;
    }

    const existing = await prisma.creatorLead.findUnique({
      where: {
        shopify_shop_id_instagram_handle: {
          shopify_shop_id: shopId,
          instagram_handle: creator.instagramHandle,
        },
      },
      select: { id: true },
    });

    if (existing) {
      summary.alreadyKnown++;
      continue;
    }

    const lead = await prisma.creatorLead.create({
      data: {
        shopify_shop_id: shopId,
        instagram_handle: creator.instagramHandle,
        trybe_creator_id: creator.trybeCreatorId,
        full_name: creator.fullName,
        followers: creator.followers,
        source_filter: label,
        unsubscribe_token: unsubToken(),
        status: 'sourced',
      },
    });
    await logEvent(lead.id, 'sourced', label ? `filter: ${label}` : undefined);
    summary.created++;
  }

  return summary;
}

export type ResolveSummary = {
  attempted: number;
  withEmail: number;
  withoutEmail: number;
  failed: number;
};

/**
 * Stage 2 — fills in profile data and a contact email.
 *
 * Only touches leads that haven't been resolved and haven't already burned
 * through `maxAttempts` tries, so a permanently private account can't consume
 * scraper credits forever.
 */
export async function resolvePending(
  shopId: string,
  options: { limit?: number; batchSize?: number; maxAttempts?: number; onBatch?: (done: number, total: number) => void } = {}
): Promise<ResolveSummary> {
  const limit = options.limit ?? 200;
  const batchSize = options.batchSize ?? 50;
  const maxAttempts = options.maxAttempts ?? 2;

  const pending = await prisma.creatorLead.findMany({
    where: { shopify_shop_id: shopId, status: 'sourced', resolve_attempts: { lt: maxAttempts } },
    select: { id: true, instagram_handle: true },
    orderBy: { sourced_at: 'asc' },
    take: limit,
  });

  const summary: ResolveSummary = { attempted: pending.length, withEmail: 0, withoutEmail: 0, failed: 0 };
  if (pending.length === 0) return summary;

  const byHandle = new Map(pending.map((lead) => [lead.instagram_handle, lead.id]));
  const { emails } = await suppressionSets(shopId);
  let done = 0;

  for (const batch of chunk(pending.map((l) => l.instagram_handle), batchSize)) {
    const outcomes = await resolveProfiles(batch);

    for (const outcome of outcomes) {
      const leadId = byHandle.get(outcome.ok ? outcome.profile.handle : outcome.handle);
      if (!leadId) continue;

      if (!outcome.ok) {
        const lead = await prisma.creatorLead.update({
          where: { id: leadId },
          data: {
            resolve_attempts: { increment: 1 },
            resolve_error: outcome.reason.slice(0, 500),
          },
          select: { resolve_attempts: true },
        });
        // Only give up once the retry budget is spent — a transient scraper
        // error shouldn't permanently retire an otherwise good lead.
        if (lead.resolve_attempts >= maxAttempts) {
          await prisma.creatorLead.update({ where: { id: leadId }, data: { status: 'unresolvable' } });
        }
        await logEvent(leadId, 'resolve_failed', outcome.reason);
        summary.failed++;
        continue;
      }

      const { profile } = outcome;
      const contact = profile.contact;
      const alreadyContacted = contact ? emails.has(contact.email) : false;

      await prisma.creatorLead.update({
        where: { id: leadId },
        data: {
          full_name: profile.fullName ?? undefined,
          bio: profile.bio,
          followers: profile.followers ?? undefined,
          is_business: profile.isBusiness,
          profile_url: profile.profileUrl,
          email: contact?.email ?? null,
          email_source: contact?.source ?? null,
          resolved_at: new Date(),
          resolve_attempts: { increment: 1 },
          resolve_error: null,
          status: alreadyContacted ? 'suppressed' : contact ? 'resolved' : 'unresolvable',
        },
      });

      if (alreadyContacted) {
        await logEvent(leadId, 'suppressed', 'email already belongs to an affiliate or suppression entry');
        summary.withoutEmail++;
      } else if (contact) {
        await logEvent(leadId, 'resolved', `${contact.email} (via ${contact.source})`);
        summary.withEmail++;
      } else {
        await logEvent(leadId, 'resolved', 'no public email found');
        summary.withoutEmail++;
      }
    }

    done += batch.length;
    options.onBatch?.(done, pending.length);
  }

  return summary;
}

/** How many outreach emails went out in the last 24 hours. */
export async function sentInLast24h(shopId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.creatorLead.count({
    where: { shopify_shop_id: shopId, emailed_at: { gte: since } },
  });
}

export type SendSummary = {
  sent: number;
  failed: number;
  skipped: number;
  capRemaining: number;
};

/**
 * Stage 3 — sends to resolved leads, newest sourcing first.
 *
 * Two throttles apply. The rolling 24h cap protects sender reputation across
 * runs; the per-send delay spreads the batch out within a run. Both default
 * conservative — a domain that gets burned takes weeks to recover, and there
 * is no rush that justifies that risk.
 */
export async function sendBatch(
  shopId: string,
  options: {
    limit?: number;
    dailyCap?: number;
    delayMs?: number;
    dryRun?: boolean;
    copy?: OutreachCopy;
    onSend?: (email: string, ok: boolean, reason?: string) => void;
  } = {}
): Promise<SendSummary> {
  const dailyCap = options.dailyCap ?? parseInt(process.env.CREATOR_OUTREACH_DAILY_CAP || '100', 10);
  const delayMs = options.delayMs ?? parseInt(process.env.CREATOR_OUTREACH_SEND_DELAY_MS || '15000', 10);
  const joinUrl = process.env.TRYBE_JOIN_URL || '';
  const copy = options.copy ?? defaultCopy(joinUrl);

  const alreadySent = await sentInLast24h(shopId);
  const capRemaining = Math.max(0, dailyCap - alreadySent);
  const limit = Math.min(options.limit ?? capRemaining, capRemaining);

  const summary: SendSummary = { sent: 0, failed: 0, skipped: 0, capRemaining };
  if (limit <= 0) return summary;

  if (!joinUrl && !options.copy) {
    throw new Error('TRYBE_JOIN_URL is not set — the email would go out without a join link.');
  }

  const candidates = await prisma.creatorLead.findMany({
    where: {
      shopify_shop_id: shopId,
      status: 'resolved',
      email: { not: null },
      emailed_at: null,
      unsubscribed_at: null,
    },
    select: {
      id: true,
      email: true,
      instagram_handle: true,
      full_name: true,
      unsubscribe_token: true,
    },
    orderBy: { sourced_at: 'asc' },
    take: limit,
  });

  // Re-checked here rather than trusted from resolve time: someone may have
  // unsubscribed or been added to the suppression list in between.
  const { emails, handles } = await suppressionSets(shopId);

  for (const lead of candidates) {
    const email = lead.email!;
    if (emails.has(normalizeEmail(email)) || handles.has(lead.instagram_handle)) {
      await prisma.creatorLead.update({ where: { id: lead.id }, data: { status: 'suppressed' } });
      await logEvent(lead.id, 'suppressed', 'on suppression list at send time');
      summary.skipped++;
      continue;
    }

    if (options.dryRun) {
      options.onSend?.(email, true, 'dry run');
      summary.sent++;
      continue;
    }

    const result = await sendOutreach(
      {
        email,
        instagram_handle: lead.instagram_handle,
        full_name: lead.full_name,
        unsubscribe_token: lead.unsubscribe_token,
      },
      copy
    );

    if (result.ok) {
      await prisma.creatorLead.update({
        where: { id: lead.id },
        data: { status: 'emailed', emailed_at: new Date() },
      });
      await logEvent(lead.id, 'emailed', email, result.messageId);
      summary.sent++;
      options.onSend?.(email, true);
    } else {
      await logEvent(lead.id, 'send_failed', result.reason);
      summary.failed++;
      options.onSend?.(email, false, result.reason);
      // A misconfiguration fails identically for every lead. Stop rather than
      // marching through the whole batch writing the same error 200 times.
      if (/not set|API key|refusing/i.test(result.reason)) break;
    }

    if (delayMs > 0) {
      // Jittered, because a send exactly every 15.000s is a machine signature.
      const jitter = delayMs * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  return summary;
}

/** Adds a permanent do-not-contact entry and marks any matching lead. */
export async function suppress(
  shopId: string,
  target: { email?: string | null; instagramHandle?: string | null; reason: string }
): Promise<void> {
  const email = target.email ? normalizeEmail(target.email) : null;
  const handle = target.instagramHandle ? target.instagramHandle.toLowerCase() : null;
  if (!email && !handle) return;

  await prisma.creatorSuppression.create({
    data: {
      shopify_shop_id: shopId,
      email,
      instagram_handle: handle,
      reason: target.reason,
    },
  });

  const leads = await prisma.creatorLead.findMany({
    where: {
      shopify_shop_id: shopId,
      OR: [...(email ? [{ email }] : []), ...(handle ? [{ instagram_handle: handle }] : [])],
    },
    select: { id: true },
  });

  for (const lead of leads) {
    await prisma.creatorLead.update({
      where: { id: lead.id },
      data: {
        status: 'suppressed',
        unsubscribed_at: target.reason === 'unsubscribed' ? new Date() : undefined,
      },
    });
    await logEvent(lead.id, target.reason === 'unsubscribed' ? 'unsubscribed' : 'suppressed', target.reason);
  }
}

/** Counts by status, for the admin view and the CLI summary. */
export async function statusCounts(shopId: string): Promise<Record<string, number>> {
  const rows = await prisma.creatorLead.groupBy({
    by: ['status'],
    where: { shopify_shop_id: shopId },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}
