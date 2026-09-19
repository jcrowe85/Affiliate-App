/**
 * Stage 3 — the outreach email.
 *
 * Three decisions worth stating, because they all look like corners being cut
 * and none of them are:
 *
 * 1. This does NOT reuse the branded layout() in lib/email.ts. Cold outreach
 *    to creators reads best as a short personal note; a table-based template
 *    with a hero and a button announces "bulk send" before the first line is
 *    read, and gets filtered accordingly.
 * 2. Every send carries a plain-text alternative and List-Unsubscribe headers.
 *    Both are strong positive signals to inbox providers, and one-click
 *    unsubscribe is what keeps an opt-out from becoming a spam complaint.
 * 3. It sends from its own verified domain (CREATOR_OUTREACH_FROM), separate
 *    from transactional mail. Cold volume damages sender reputation; the point
 *    of the separation is that when it does, it can't take affiliate payout
 *    notifications down with it.
 */

import { Resend } from 'resend';

import type { Audience } from './audience';

let client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.CREATOR_OUTREACH_RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

/**
 * Sender identity for outreach. Falls back to nothing rather than to the
 * transactional address: sending cold mail as `affiliates@` would quietly
 * undo the domain separation this module exists to maintain.
 */
function getFrom(): string | null {
  return process.env.CREATOR_OUTREACH_FROM?.trim() || null;
}

function getPublicUrl(): string {
  const url = (process.env.CREATOR_OUTREACH_PUBLIC_URL || process.env.SHOPIFY_APP_URL || '').trim();
  if (!url || url.includes('undefined')) return '';
  return url.replace(/\/$/, '');
}

export function unsubscribeUrl(token: string): string {
  const base = getPublicUrl();
  return base ? `${base}/api/creators/unsubscribe?t=${encodeURIComponent(token)}` : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A usable first name, or null.
 *
 * Returns null rather than a filler like "there" so the caller can choose a
 * greeting that doesn't have a hole in it. "Hi @handle" beats "Hi there" for
 * a creator — it shows the message is about them specifically.
 */
export function firstNameOf(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/)[0];
  if (!first || first.length > 24) return null;
  // Skip handles-as-names and emoji-only display names.
  if (!/^[\p{L}][\p{L}'-]*$/u.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export type OutreachLead = {
  email: string;
  instagram_handle: string;
  full_name: string | null;
  unsubscribe_token: string;
};

export type OutreachCopy = {
  subject: string;
  /** Body paragraphs, in order. Rendered to both HTML and plain text. */
  paragraphs: string[];
  signOff: string;
};

type CopyBuilder = (joinUrl: string) => OutreachCopy;

/**
 * Where each audience is sent.
 *
 * Paid creators go to Trybe, which handles the seeding. Organic creators go to
 * our own apply form, where the `?source=` tag is what routes them to the 40%
 * offer and mints their coupon on approval — so the tag is load-bearing, not
 * analytics. Kept in env rather than inline because the tag on that URL is the
 * one thing likely to change per channel.
 */
export function joinUrlFor(audience: Audience): string {
  const url =
    audience === 'organic'
      ? process.env.META_JOIN_URL || ''
      : process.env.TRYBE_JOIN_URL || '';
  return url.trim();
}

/**
 * Copy for the control variant. `{{first}}` and `{{handle}}` are the only
 * placeholders any variant may use.
 */
export function defaultCopy(joinUrl: string): OutreachCopy {
  return PAID_VARIANTS.A(joinUrl);
}

/**
 * The paid-audience copy variants under test — creators sourced from Trybe,
 * who are offered free product and 15% once we run their video as an ad.
 *
 * Variants should differ on something you could act on, not on wording. These
 * two lead differently: A opens on the mechanism (our ad spend behind your
 * content), B opens on the creator (your content, your upside). A test between
 * two paraphrases of the same email teaches you nothing at any sample size.
 *
 * The greeting uses {{first}} rather than a name. Both drafts arrived written
 * out to one person, and shipping that literally would have opened every email
 * to every creator with the same wrong name.
 *
 * Keys are stored on the lead, so renaming one orphans the results already
 * collected. Add new variants rather than editing existing ones mid-test.
 */
export const PAID_VARIANTS: Record<string, CopyBuilder> = {
  // A — leads with the mechanism: here is the deal, here is why it pays.
  A: (joinUrl) => ({
    subject: 'Your content + our ad spend = 15% commission',
    paragraphs: [
      `Hi {{first}},`,
      `Found your content on Trybe and think you'd be a great fit for Fleur.`,
      `We're the brand behind Bloom, our peptide-powered hair serum that's been taking off with creators. Peptide beauty is having a huge moment right now, and creator content has already driven serious GMV for Fleur.`,
      `Here's the opportunity:`,
      `We send you Bloom completely free. You create a couple of short videos. If we run your content as ads, you earn 15% of the sales your videos generate.`,
      `That means you're not relying on your own following to make money. We put our ad spend behind winning creative and you participate in the upside.`,
      `No follower minimum. No exclusivity. No cost to participate.`,
      `If you want in, claim your product here:`,
      joinUrl,
      `Takes about two minutes.`,
    ],
    signOff: 'Thanks,\nThe Fleur Team',
  }),

  // B — leads with the creator: your content, your upside, less about us.
  B: (joinUrl) => ({
    subject: 'Want to earn 15% on your content?',
    paragraphs: [
      `Hi {{first}},`,
      `Your content caught our eye on Trybe, and we'd love to see what you could do with Fleur.`,
      `We're sending creators our bestselling peptide hair serum, Bloom, completely free in exchange for a couple of short videos.`,
      `But here's the part we're most excited about:`,
      `If we put ad spend behind your video, you'll earn 15% of the sales it generates.`,
      `You don't need a huge audience. You don't need to post every day. Make great content, and we'll handle putting advertising dollars behind the videos that perform.`,
      `Peptide hair care is a hot category right now and creator content has already generated significant sales for Fleur.`,
      `No follower minimum. No exclusivity. Just free product + 15% of the sales your video drives.`,
      `Claim your product:`,
      joinUrl,
    ],
    signOff: 'The Fleur Team',
  }),
};

/**
 * The organic-audience copy — creators harvested from Meta's Creator Hub.
 *
 * A different deal, not a different pitch for the same deal: no seeding, no ad
 * spend, no waiting to be picked. They post, their code converts, they keep 40%
 * of the first order. Written by Josh; kept in his voice deliberately, because
 * it reads like a person wrote it, which is most of why cold mail works at all.
 *
 * One variant, not two. A/B only earns its keep once there is enough volume to
 * separate the arms, and splitting 249 leads across two variants would just
 * produce two underpowered halves.
 */
export const ORGANIC_VARIANTS: Record<string, CopyBuilder> = {
  META_A: (joinUrl) => ({
    subject: "We'd like to offer you 40% commission",
    paragraphs: [
      `Hey {{first}},`,
      `Saw your content and I think you'd be a perfect fit for our brand!`,
      `We're so confident in our product we're willing to offer you 40% commission (all of our first order profit) because we know people will come back.`,
      `We've sold over 50,000 bottles so far, and our new focus is our organic affiliate program.`,
      `If you're interested, you can join here:`,
      joinUrl,
      // Below the CTA on purpose: these are for the creator who wants to check
      // us out before committing, and nothing should sit between the ask and
      // the link that answers it. Both bare, no scheme — a cold email carrying
      // three full https:// links reads as bulk, and every mail client of
      // consequence linkifies these anyway.
      `You can check us out at tryfleur.com or on Instagram @tryfleur (instagram.com/tryfleur).`,
    ],
    signOff: 'The Fleur Team',
  }),
};

/**
 * Kept so existing imports and the self-test keep resolving. New code should
 * name the audience it means rather than reaching for "the" variants.
 */
export const COPY_VARIANTS = PAID_VARIANTS;

const ALL_VARIANTS: Record<string, CopyBuilder> = { ...PAID_VARIANTS, ...ORGANIC_VARIANTS };

export const VARIANT_KEYS = Object.keys(PAID_VARIANTS);

/** The variant keys a batch for this audience may rotate through. */
export function variantKeysFor(audience: Audience): string[] {
  return Object.keys(audience === 'organic' ? ORGANIC_VARIANTS : PAID_VARIANTS);
}

/**
 * Copy for a named variant.
 *
 * The audience decides the fallback, and that is the whole point: a lead with
 * no variant recorded must not quietly receive the other audience's email. An
 * organic creator dropping back to paid variant A would be promised free
 * product and an ad budget that this programme does not include.
 */
export function copyForVariant(
  variant: string | null | undefined,
  joinUrl: string,
  audience: Audience = 'paid'
): OutreachCopy {
  const keys = variantKeysFor(audience);
  const build = (variant && ALL_VARIANTS[variant]) || ALL_VARIANTS[keys[0]];
  return build(joinUrl);
}

function fill(template: string, lead: OutreachLead): string {
  const first = firstNameOf(lead.full_name);
  return template
    .replace(/\{\{first\}\}/g, first || `@${lead.instagram_handle}`)
    .replace(/\{\{handle\}\}/g, `@${lead.instagram_handle}`);
}

/**
 * Renders the message. Returns both parts because a text/plain alternative is
 * one of the cheapest deliverability wins available — HTML-only bulk mail is a
 * classic spam signature.
 */
export function buildEmail(lead: OutreachLead, copy: OutreachCopy) {
  const unsubscribe = unsubscribeUrl(lead.unsubscribe_token);
  // CAN-SPAM requires a valid physical postal address in every commercial
  // message. Missing it is a compliance failure, not a formatting one, so
  // sendOutreach() refuses to send without it.
  const address = (process.env.CREATOR_OUTREACH_POSTAL_ADDRESS || '').trim();

  const paragraphs = copy.paragraphs.map((p) => fill(p, lead));
  const subject = fill(copy.subject, lead);

  const textFooter = [
    '',
    '--',
    address,
    unsubscribe ? `Don't want these? Unsubscribe: ${unsubscribe}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const text = `${paragraphs.join('\n\n')}\n\n${copy.signOff}\n${textFooter}`;

  // Simple block markup, close to what a person's mail client produces. No
  // tables, no images, no tracking pixel — all three are bulk-mail tells.
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;color:#111827;max-width:520px;">
${paragraphs
  .map((p) => `  <p style="margin:0 0 16px;">${escapeHtml(p)}</p>`)
  .join('\n')}
  <p style="margin:0 0 24px;white-space:pre-line;">${escapeHtml(copy.signOff)}</p>
  <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
    ${escapeHtml(address)}${
      unsubscribe
        ? `<br /><a href="${unsubscribe}" style="color:#9ca3af;">Unsubscribe</a>`
        : ''
    }
  </p>
</div>`;

  return { subject, html, text, unsubscribe };
}

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; reason: string };

/**
 * Sends one outreach email.
 *
 * Refuses rather than degrading when configuration is missing. A cold send
 * without an unsubscribe link or postal address is a compliance problem that
 * would be discovered long after the mail went out, so it is treated as a hard
 * error at the last possible moment before sending.
 */
export async function sendOutreach(lead: OutreachLead, copy: OutreachCopy): Promise<SendResult> {
  const resend = getClient();
  if (!resend) return { ok: false, reason: 'No Resend API key configured' };

  const from = getFrom();
  if (!from) {
    return {
      ok: false,
      reason: 'CREATOR_OUTREACH_FROM is not set — refusing to send cold mail from the transactional domain',
    };
  }

  if (!(process.env.CREATOR_OUTREACH_POSTAL_ADDRESS || '').trim()) {
    return { ok: false, reason: 'CREATOR_OUTREACH_POSTAL_ADDRESS is not set (required by CAN-SPAM)' };
  }

  const { subject, html, text, unsubscribe } = buildEmail(lead, copy);
  if (!unsubscribe) {
    return { ok: false, reason: 'CREATOR_OUTREACH_PUBLIC_URL is not set — cannot build an unsubscribe link' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: lead.email,
      replyTo: process.env.CREATOR_OUTREACH_REPLY_TO || undefined,
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribe}>`,
        // Tells Gmail/Outlook they may honour the opt-out themselves, without
        // the recipient ever needing to reach for "report spam".
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (error) return { ok: false, reason: `${error.name}: ${error.message}` };
    return { ok: true, messageId: data?.id ?? null };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
