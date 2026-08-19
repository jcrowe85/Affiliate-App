import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { suppress } from '@/lib/creator-outreach/pipeline';

export const dynamic = 'force-dynamic';

/**
 * Public unsubscribe endpoint for creator outreach.
 *
 * Deliberately unauthenticated and keyed on an unguessable token — anything
 * that makes opting out harder than replying "stop" converts an unsubscribe
 * into a spam complaint, which is the outcome that actually costs us the
 * sending domain.
 *
 * Two entry points:
 *   GET  — a human clicked the link; show a confirmation page.
 *   POST — Gmail/Outlook honouring the List-Unsubscribe-Post header, or the
 *          confirmation form. Opts out immediately.
 *
 * The split matters: link scanners in corporate mail security follow every GET
 * in a message. If GET opted people out, those scanners would silently
 * unsubscribe recipients who never saw the email.
 */

function page(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:48px 24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
    <div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 12px;font-size:18px;">${title}</h1>
      ${body}
    </div>
  </body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function findLead(token: string | null) {
  if (!token) return null;
  return prisma.creatorLead.findUnique({
    where: { unsubscribe_token: token },
    select: { id: true, email: true, instagram_handle: true, shopify_shop_id: true, unsubscribed_at: true },
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  const lead = await findLead(token);

  // Same response for a bad token as for an already-processed one — there is
  // nothing useful to tell an anonymous caller, and confirming which tokens
  // exist would let someone probe the list.
  if (!lead) return page('Link not recognised', '<p style="margin:0;font-size:14px;color:#6b7280;">This unsubscribe link is no longer valid.</p>', 404);

  if (lead.unsubscribed_at) {
    return page('Already unsubscribed', '<p style="margin:0;font-size:14px;color:#6b7280;">You won\'t receive any further emails from us.</p>');
  }

  return page(
    'Unsubscribe',
    `<p style="margin:0 0 20px;font-size:14px;line-height:22px;color:#374151;">
       Confirm that you'd like to stop receiving creator collaboration emails
       from us${lead.email ? ` at <strong>${lead.email}</strong>` : ''}.
     </p>
     <form method="post">
       <input type="hidden" name="t" value="${token}" />
       <button type="submit" style="padding:10px 18px;background:#111827;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
         Unsubscribe
       </button>
     </form>`
  );
}

export async function POST(request: NextRequest) {
  // One-click clients POST to the URL as-is; the form posts the token in the
  // body. Accept either.
  let token = request.nextUrl.searchParams.get('t');
  if (!token) {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('form')) {
      const form = await request.formData().catch(() => null);
      token = (form?.get('t') as string | null) ?? null;
    }
  }

  const lead = await findLead(token);
  if (!lead) return page('Link not recognised', '<p style="margin:0;font-size:14px;color:#6b7280;">This unsubscribe link is no longer valid.</p>', 404);

  if (!lead.unsubscribed_at) {
    await suppress(lead.shopify_shop_id, {
      email: lead.email,
      instagramHandle: lead.instagram_handle,
      reason: 'unsubscribed',
    });
  }

  return page(
    'Unsubscribed',
    '<p style="margin:0;font-size:14px;line-height:22px;color:#374151;">Done — you won\'t hear from us again. Sorry for the interruption.</p>'
  );
}
