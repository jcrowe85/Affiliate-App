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

/**
 * Copy for the control variant. `{{first}}` and `{{handle}}` are the only
 * placeholders either variant may use.
 */
export function defaultCopy(joinUrl: string): OutreachCopy {
  return COPY_VARIANTS.A(joinUrl);
}

/**
 * The copy variants under test.
 *
 * Variants should differ on something you could act on, not on wording. These
 * two take opposite angles: A explains the offer and reassures (no minimum, no
 * exclusivity, you keep the rights); B says almost nothing and asks a question.
 * A test between two paraphrases of the same email teaches you nothing no
 * matter how many you send.
 *
 * Keys are stored on the lead, so renaming one orphans the results already
 * collected. Add new variants rather than editing existing ones mid-test.
 */
export const COPY_VARIANTS: Record<string, (joinUrl: string) => OutreachCopy> = {
  // A — the full pitch: what it is, what you get, what we won't ask of you.
  A: (joinUrl) => ({
    subject: 'Sending you Fleur — gifting collab',
    paragraphs: [
      `Hi {{first}} — found you on Trybe and your feed genuinely fits what we're building at Fleur.`,
      `We'd love to send you product, free, in exchange for a couple of short videos. No follower minimum, no exclusivity, and you keep full rights to what you make.`,
      `If you're in, you can claim it here: ${joinUrl}`,
      `Takes about two minutes. If it's not for you, no hard feelings — just ignore this one.`,
    ],
    signOff: 'Thanks,\nThe Fleur team',
  }),

  // B — short and asks a question. Costs less attention to read and gives an
  // easy reply that isn't "yes to a commitment".
  B: (joinUrl) => ({
    subject: 'free Fleur product for you?',
    paragraphs: [
      `Hi {{first}} — we make Fleur, and we'd like to send you some, free.`,
      `All we'd ask for is a couple of short videos. Want us to ship it?`,
      joinUrl,
    ],
    signOff: 'Josh\nFleur',
  }),
};

export const VARIANT_KEYS = Object.keys(COPY_VARIANTS);

/** Copy for a named variant, falling back to A for unknown or missing keys. */
export function copyForVariant(variant: string | null | undefined, joinUrl: string): OutreachCopy {
  const build = (variant && COPY_VARIANTS[variant]) || COPY_VARIANTS.A;
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
    '—',
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
