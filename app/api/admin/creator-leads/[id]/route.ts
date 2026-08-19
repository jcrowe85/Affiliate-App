import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { suppress } from '@/lib/creator-outreach/pipeline';
import { isPlausibleEmail, normalizeEmail } from '@/lib/creator-outreach/email-extract';

export const dynamic = 'force-dynamic';

/**
 * Per-lead edits from the review queue.
 *
 * Supported actions:
 *   set-email  — an admin found the address by hand; moves the lead to
 *                'resolved' so the next send picks it up.
 *   suppress   — never contact this creator.
 *   mark       — record a reply or a signup, which is how the funnel gets
 *                measured at all.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Scoped to the admin's own shop, so an id from another tenant 404s rather
    // than being editable.
    const lead = await prisma.creatorLead.findFirst({
      where: { id: params.id, shopify_shop_id: admin.shopify_shop_id },
      select: { id: true, email: true, instagram_handle: true, status: true },
    });
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const action = body?.action as string;

    if (action === 'set-email') {
      const email = normalizeEmail(String(body.email || ''));
      if (!isPlausibleEmail(email)) {
        return NextResponse.json({ error: 'That does not look like a valid email address' }, { status: 400 });
      }
      const updated = await prisma.creatorLead.update({
        where: { id: lead.id },
        data: {
          email,
          email_source: 'manual',
          resolved_at: new Date(),
          resolve_error: null,
          // Only leads that haven't been contacted become sendable again;
          // re-typing the address of someone already emailed must not queue
          // them for a second copy of the same pitch.
          status: lead.status === 'emailed' ? lead.status : 'resolved',
        },
      });
      await prisma.creatorOutreachEvent.create({
        data: { lead_id: lead.id, type: 'resolved', detail: `${email} (manual, by ${admin.email})` },
      });
      return NextResponse.json({ lead: updated });
    }

    if (action === 'suppress') {
      await suppress(admin.shopify_shop_id, {
        email: lead.email,
        instagramHandle: lead.instagram_handle,
        reason: String(body.reason || 'manual'),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'mark') {
      const state = String(body.state || '');
      if (state !== 'replied' && state !== 'joined') {
        return NextResponse.json({ error: 'state must be "replied" or "joined"' }, { status: 400 });
      }
      const updated = await prisma.creatorLead.update({
        where: { id: lead.id },
        data: {
          status: state,
          ...(state === 'replied' ? { replied_at: new Date() } : { joined_at: new Date() }),
        },
      });
      await prisma.creatorOutreachEvent.create({
        data: { lead_id: lead.id, type: state, detail: `marked by ${admin.email}` },
      });
      return NextResponse.json({ lead: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[creator-leads] patch failed:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
