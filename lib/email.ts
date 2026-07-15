import { Resend } from 'resend';
import { prisma } from '@/lib/db';

/**
 * Transactional email via Resend.
 *
 * Every send here is best-effort: a failed email must never fail the request
 * that triggered it. An applicant who submits the form has applied whether or
 * not the confirmation lands, so all senders swallow their errors and log.
 *
 * Unlike lib/paypal.ts, the client is created lazily rather than at module
 * load, so a missing key can't take down a route that imports this file.
 */

let client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

function getFromAddress(): string {
  // e.g. "Fleur Affiliates <affiliates@yourdomain.com>" — must be on a domain
  // verified in Resend, or sends are rejected.
  return process.env.RESEND_FROM_EMAIL || 'Fleur Affiliates <onboarding@resend.dev>';
}

/**
 * Base URL for links in emails, or '' if we can't trust it — callers omit the
 * button rather than ship a dead link. The 'undefined' guard mirrors
 * app/api/auth/install/route.ts, which sees the same bad value when
 * SHOPIFY_APP_URL is misconfigured.
 */
function getAppUrl(): string {
  const url = (process.env.SHOPIFY_APP_URL || '').trim();
  if (!url || url.includes('undefined')) return '';
  return url.replace(/\/$/, '');
}

/**
 * Where admin notifications go. ADMIN_NOTIFICATION_EMAIL takes a comma-separated
 * list, so several people can be notified. Falls back to the first admin on
 * record when it's unset or contains nothing usable.
 */
async function resolveAdminRecipients(shopId: string): Promise<string[]> {
  const configured = (process.env.ADMIN_NOTIFICATION_EMAIL || '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);

  // Case-insensitive dedupe, but send to the address as written.
  const unique = configured.filter(
    (address, i) =>
      configured.findIndex((a) => a.toLowerCase() === address.toLowerCase()) === i
  );
  if (unique.length > 0) return unique;

  const admin = await prisma.adminUser.findFirst({
    where: { shopify_shop_id: shopId },
    select: { email: true },
    orderBy: { created_at: 'asc' },
  });
  return admin ? [admin.email] : [];
}

async function send(options: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping "${options.subject}" to ${options.to}`
    );
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    // The SDK reports API-level failures in `error` rather than throwing.
    if (error) {
      console.error('[email] Resend rejected send:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err);
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(heading: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;">${heading}</h1>
          ${body}
        </td>
      </tr>
    </table>
    <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#6b7280;text-align:center;">
      Fleur Affiliates
    </p>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">${label}</a>`;
}

/** Confirms to the applicant that their /apply submission landed. */
export async function sendApplicationReceivedEmail(application: {
  first_name: string;
  email: string;
}): Promise<boolean> {
  const name = escapeHtml(application.first_name);
  return send({
    to: application.email,
    subject: 'We received your affiliate application',
    html: layout(
      'Thanks for applying',
      `<p style="margin:0 0 12px;font-size:14px;line-height:22px;">Hi ${name},</p>
       <p style="margin:0 0 12px;font-size:14px;line-height:22px;">
         We've received your application to the Fleur affiliate program. Our team
         will review it and finish setting up your account.
       </p>
       <p style="margin:0;font-size:14px;line-height:22px;">
         You'll get another email as soon as it's approved. You can then sign in
         with this email address and the password you chose.
       </p>`
    ),
  });
}

/** Tells an approved applicant their account exists and they can sign in. */
export async function sendApplicationApprovedEmail(affiliate: {
  first_name: string | null;
  email: string;
}): Promise<boolean> {
  const name = escapeHtml(affiliate.first_name || 'there');
  const appUrl = getAppUrl();
  const loginCta = appUrl
    ? `<p style="margin:0 0 24px;">${button(`${appUrl}/affiliates/login`, 'Sign in to your dashboard')}</p>`
    : '';

  return send({
    to: affiliate.email,
    subject: 'Your affiliate account is ready',
    html: layout(
      "You're approved",
      `<p style="margin:0 0 12px;font-size:14px;line-height:22px;">Hi ${name},</p>
       <p style="margin:0 0 20px;font-size:14px;line-height:22px;">
         Good news — your affiliate account is live. Sign in with this email
         address and the password you chose when you applied to get your
         referral links and start tracking commissions.
       </p>
       ${loginCta}
       <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;">
         Forgot your password? Reply to this email and we'll help you out.
       </p>`
    ),
  });
}

/** Pings the admin that a new application is waiting, for when they're away from the dashboard. */
export async function sendNewApplicationAdminEmail(
  application: {
    first_name: string;
    last_name: string;
    email: string;
    company: string | null;
  },
  shopId: string
): Promise<boolean> {
  const adminRecipients = await resolveAdminRecipients(shopId);
  if (adminRecipients.length === 0) {
    console.warn('[email] No admin recipient found — skipping new application notice');
    return false;
  }

  const name = escapeHtml(`${application.first_name} ${application.last_name}`);
  const appUrl = getAppUrl();
  const reviewCta = appUrl
    ? `<p style="margin:0 0 8px;">${button(`${appUrl}/app?tab=affiliates`, 'Review application')}</p>`
    : '';

  return send({
    to: adminRecipients,
    subject: `New affiliate application: ${application.first_name} ${application.last_name}`,
    html: layout(
      'New affiliate application',
      `<p style="margin:0 0 12px;font-size:14px;line-height:22px;">
         <strong>${name}</strong>${application.company ? ` · ${escapeHtml(application.company)}` : ''}<br />
         ${escapeHtml(application.email)}
       </p>
       <p style="margin:0 0 20px;font-size:14px;line-height:22px;">
         They're waiting in the Affiliates tab. Pick an offer and complete their
         setup to activate the account.
       </p>
       ${reviewCta}`
    ),
  });
}
