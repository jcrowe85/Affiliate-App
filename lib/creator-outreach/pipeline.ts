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
import {
  defaultCopy,
  sendOutreach,
  copyForVariant,
  VARIANT_KEYS,
  type OutreachCopy,
} from './outreach-email';
import { assignVariants, compareVariants, type VariantStats, type Comparison } from './experiment';
import { effectiveDailyCap, type WarmupState } from './warmup';
import { planSendTimes, sendWindowFromEnv, describeWindow } from './schedule';

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
  /** Already known, but surfaced by a filter that hadn't found them before. */
  newFilterOverlap: number;
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
  const summary: IngestSummary = {
    seen: creators.length,
    created: 0,
    alreadyKnown: 0,
    newFilterOverlap: 0,
    suppressed: 0,
  };

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
      select: { id: true, source_filter: true },
    });

    if (existing) {
      summary.alreadyKnown++;
      // The lead keeps whichever filter found them first, but we record the
      // overlap. Filters are worth judging on reply rate later, and that means
      // knowing every filter a creator came through — not just the first.
      if (label && existing.source_filter !== label) {
        const seenBefore = await prisma.creatorOutreachEvent.findFirst({
          where: { lead_id: existing.id, type: 'sourced', detail: `filter: ${label}` },
          select: { id: true },
        });
        if (!seenBefore) {
          await logEvent(existing.id, 'sourced', `filter: ${label}`);
          summary.newFilterOverlap++;
        }
      }
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
        // Snapshot from before we made contact — see the schema comment.
        trybe_metrics: (creator.metrics.raw ?? undefined) as never,
        gmv_30d: creator.metrics.gmv30d,
        submissions_30d: creator.metrics.submissions30d,
        approval_rate: creator.metrics.approvalRate,
        brand_partnerships: creator.metrics.brandPartnerships,
        sample_score: creator.metrics.sampleScore,
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
  const dailyCap = options.dailyCap ?? effectiveDailyCap().cap;
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

// ---------------------------------------------------------------------------
// Scheduled batches
//
// sendBatch() above sends inside one process, sleeping between messages. That
// is fine for a CLI run and useless for anything else: a serverless request
// would time out long before a paced batch finished, and a UI has nothing to
// display while a script sleeps.
//
// So a batch is planned first — every lead gets a send time written to the
// database — and a worker sends whatever is due whenever it happens to run.
// The schedule outlives any single process, which is what lets the UI show a
// real countdown and lets a batch survive a deploy.
// ---------------------------------------------------------------------------

export type ScheduleSummary = {
  batchId: string;
  scheduled: number;
  firstAt: Date | null;
  lastAt: Date | null;
  capRemaining: number;
  /** e.g. "09:00–17:00 Chicago, weekdays only" */
  window: string;
};

/**
 * Plans a batch: picks resolved leads and stamps each with a send time.
 *
 * Spacing is jittered so the pattern doesn't read as machine-generated, and the
 * rolling 24h cap is applied here rather than at send time so the UI can show
 * an honest schedule the moment it is created.
 */
export async function scheduleBatch(
  shopId: string,
  options: { count?: number; startInSeconds?: number; dailyCap?: number; now?: Date } = {}
): Promise<ScheduleSummary> {
  const dailyCap = options.dailyCap ?? effectiveDailyCap().cap;

  // Anything already queued counts against the cap — it is spoken for.
  const [alreadySent, alreadyQueued] = await Promise.all([
    sentInLast24h(shopId),
    prisma.creatorLead.count({
      where: { shopify_shop_id: shopId, status: { in: ['queued', 'sending'] } },
    }),
  ]);
  const capRemaining = Math.max(0, dailyCap - alreadySent - alreadyQueued);
  const count = Math.min(options.count ?? capRemaining, capRemaining);

  const batchId = randomBytes(8).toString('hex');
  const windowLabel = describeWindow(sendWindowFromEnv());
  if (count <= 0) {
    return { batchId, scheduled: 0, firstAt: null, lastAt: null, capRemaining, window: windowLabel };
  }

  const { emails, handles } = await suppressionSets(shopId);

  const candidates = await prisma.creatorLead.findMany({
    where: {
      shopify_shop_id: shopId,
      status: 'resolved',
      email: { not: null },
      emailed_at: null,
      unsubscribed_at: null,
    },
    select: { id: true, email: true, instagram_handle: true },
    orderBy: { sourced_at: 'asc' },
    take: count,
  });

  const sendable = candidates.filter(
    (lead) => !emails.has(normalizeEmail(lead.email!)) && !handles.has(lead.instagram_handle)
  );

  let firstAt: Date | null = null;
  let lastAt: Date | null = null;

  // Continue the rotation from wherever the last batch left off, so a run of
  // small batches still ends up evenly split rather than every batch starting
  // on variant A.
  const alreadyAssigned = await prisma.creatorLead.count({
    where: { shopify_shop_id: shopId, copy_variant: { not: null } },
  });
  const variants = assignVariants(sendable.length, VARIANT_KEYS, alreadyAssigned);

  // Scattered across the sending window rather than fired off back to back —
  // see lib/creator-outreach/schedule.ts. A batch bigger than one day's cap
  // spills onto following days by itself.
  const times = planSendTimes({ count: sendable.length, perDay: dailyCap, now: options.now });

  for (let i = 0; i < sendable.length; i++) {
    const at = times[i];
    if (!at) break; // window couldn't hold the rest; the remainder stays ready
    if (i === 0) firstAt = at;
    lastAt = at;

    await prisma.creatorLead.update({
      where: { id: sendable[i].id },
      data: {
        status: 'queued',
        batch_id: batchId,
        scheduled_send_at: at,
        send_error: null,
        copy_variant: variants[i],
      },
    });
  }

  return {
    batchId,
    scheduled: times.length < sendable.length ? times.length : sendable.length,
    firstAt,
    lastAt,
    capRemaining,
    window: windowLabel,
  };
}

/**
 * Sends everything that is due. Safe to call from anywhere, at any frequency.
 *
 * Each lead is claimed with a conditional update before any mail goes out, so
 * two workers overlapping — a cron tick landing on top of a manual run — can't
 * both send the same message. The claim is the only thing standing between a
 * retry and a creator getting the same pitch twice.
 */
export async function sendDue(
  shopId: string,
  options: { limit?: number; copy?: OutreachCopy; now?: Date } = {}
): Promise<{ sent: number; failed: number; remaining: number }> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 10;
  const joinUrl = process.env.TRYBE_JOIN_URL || '';

  const due = await prisma.creatorLead.findMany({
    where: {
      shopify_shop_id: shopId,
      status: 'queued',
      scheduled_send_at: { lte: now },
    },
    select: { id: true },
    orderBy: { scheduled_send_at: 'asc' },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const candidate of due) {
    // Claim it. updateMany with the status in the filter is atomic, so exactly
    // one caller can move a given lead out of 'queued'.
    const claimed = await prisma.creatorLead.updateMany({
      where: { id: candidate.id, status: 'queued' },
      data: { status: 'sending' },
    });
    if (claimed.count === 0) continue; // someone else got there first

    const lead = await prisma.creatorLead.findUnique({
      where: { id: candidate.id },
      select: {
        id: true,
        email: true,
        instagram_handle: true,
        full_name: true,
        unsubscribe_token: true,
        copy_variant: true,
      },
    });
    if (!lead?.email) {
      await prisma.creatorLead.update({
        where: { id: candidate.id },
        data: { status: 'unresolvable', send_error: 'no email at send time' },
      });
      continue;
    }

    // Whatever variant this lead was assigned at planning time. An override
    // passed by the caller wins, which is how the CLI's one-off sends work.
    const copy = options.copy ?? copyForVariant(lead.copy_variant, joinUrl);

    const result = await sendOutreach(
      {
        email: lead.email,
        instagram_handle: lead.instagram_handle,
        full_name: lead.full_name,
        unsubscribe_token: lead.unsubscribe_token,
      },
      copy
    );

    if (result.ok) {
      await prisma.creatorLead.update({
        where: { id: lead.id },
        data: { status: 'emailed', emailed_at: new Date(), send_error: null },
      });
      await logEvent(lead.id, 'emailed', `${lead.email} (variant ${lead.copy_variant ?? 'A'})`, result.messageId);
      sent++;
    } else {
      // Back to 'queued' so the next tick retries — unless it is a
      // configuration fault, which will fail identically forever.
      const fatal = /not set|API key|refusing/i.test(result.reason);
      await prisma.creatorLead.update({
        where: { id: lead.id },
        data: { status: fatal ? 'resolved' : 'queued', send_error: result.reason.slice(0, 500) },
      });
      await logEvent(lead.id, 'send_failed', result.reason);
      failed++;
      if (fatal) break;
    }
  }

  const remaining = await prisma.creatorLead.count({
    where: { shopify_shop_id: shopId, status: { in: ['queued', 'sending'] } },
  });

  return { sent, failed, remaining };
}

/** Puts a batch's unsent leads back in the ready pool. */
export async function cancelBatch(shopId: string, batchId: string): Promise<number> {
  const result = await prisma.creatorLead.updateMany({
    where: { shopify_shop_id: shopId, batch_id: batchId, status: { in: ['queued', 'sending'] } },
    data: { status: 'resolved', scheduled_send_at: null, batch_id: null },
  });
  return result.count;
}

export type LiveLead = {
  id: string;
  instagram_handle: string;
  full_name: string | null;
  email: string | null;
  status: string;
  scheduled_send_at: Date | null;
  emailed_at: Date | null;
  send_error: string | null;
};

/**
 * The current batch, for the live view: everything queued or sending, plus what
 * has already gone out today so the list reads as one continuous run.
 */
export async function liveBatch(shopId: string): Promise<{
  batchId: string | null;
  leads: LiveLead[];
  sentToday: number;
  dailyCap: number;
  warmup: WarmupState;
  nextAt: Date | null;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const warmup = effectiveDailyCap();

  const leads = await prisma.creatorLead.findMany({
    where: {
      shopify_shop_id: shopId,
      OR: [
        { status: { in: ['queued', 'sending'] } },
        { status: 'emailed', emailed_at: { gte: since } },
      ],
    },
    select: {
      id: true,
      instagram_handle: true,
      full_name: true,
      email: true,
      status: true,
      scheduled_send_at: true,
      emailed_at: true,
      send_error: true,
      batch_id: true,
    },
    // Pending first in send order, then the completed ones newest-last so the
    // list reads top-to-bottom as the run progresses.
    orderBy: [{ scheduled_send_at: 'asc' }, { emailed_at: 'asc' }],
  });

  const pending = leads.filter((lead) => lead.status === 'queued' || lead.status === 'sending');

  return {
    batchId: pending[0]?.batch_id ?? null,
    leads: leads.map(({ batch_id, ...rest }) => rest),
    sentToday: await sentInLast24h(shopId),
    dailyCap: warmup.cap,
    warmup: warmup.state,
    nextAt: pending[0]?.scheduled_send_at ?? null,
  };
}

/**
 * Results per copy variant, with an honest read on whether the gap means
 * anything yet.
 *
 * "Replied" and "joined" come from the admin marking them, so the numbers are
 * only as good as that habit. Worth knowing before anyone treats a rate here
 * as gospel.
 */
export async function experimentResults(shopId: string): Promise<{
  variants: VariantStats[];
  comparison: Comparison;
}> {
  const rows = await prisma.creatorLead.groupBy({
    by: ['copy_variant', 'status'],
    where: {
      shopify_shop_id: shopId,
      copy_variant: { not: null },
      emailed_at: { not: null },
    },
    _count: { _all: true },
  });

  const byVariant = new Map<string, VariantStats>();
  for (const key of VARIANT_KEYS) {
    byVariant.set(key, { variant: key, sent: 0, replied: 0, joined: 0, replyRate: 0, joinRate: 0 });
  }

  for (const row of rows) {
    const key = row.copy_variant ?? 'A';
    const stats = byVariant.get(key) ?? {
      variant: key, sent: 0, replied: 0, joined: 0, replyRate: 0, joinRate: 0,
    };
    // Everything with emailed_at counts as sent, whatever it became afterwards.
    stats.sent += row._count._all;
    // 'joined' implies a reply in every sense that matters for this test.
    if (row.status === 'replied') stats.replied += row._count._all;
    if (row.status === 'joined') {
      stats.replied += row._count._all;
      stats.joined += row._count._all;
    }
    byVariant.set(key, stats);
  }

  const variants = [...byVariant.values()].map((stats) => ({
    ...stats,
    replyRate: stats.sent > 0 ? stats.replied / stats.sent : 0,
    joinRate: stats.sent > 0 ? stats.joined / stats.sent : 0,
  }));

  return { variants, comparison: compareVariants(variants) };
}
