import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  sendApplicationReceivedEmail,
  sendNewApplicationAdminEmail,
} from '@/lib/email';

export const dynamic = 'force-dynamic';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Resolve the shop a public applicant belongs to. There is no session on this
 * route, so we fall back to the existing admin's shop the way
 * scripts/create-second-admin.ts does rather than trusting anything the client
 * sends.
 */
async function resolveShopId(): Promise<string | null> {
  if (process.env.SHOPIFY_SHOP_ID) return process.env.SHOPIFY_SHOP_ID;
  const admin = await prisma.adminUser.findFirst({
    select: { shopify_shop_id: true },
    orderBy: { created_at: 'asc' },
  });
  return admin?.shopify_shop_id ?? null;
}

/**
 * Public affiliate application endpoint. Creates a pending AffiliateApplication
 * for an admin to review and complete; it never creates an Affiliate directly.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      first_name,
      last_name,
      company,
      email,
      paypal_email,
      address_line1,
      address_line2,
      city,
      state,
      zip,
      phone,
      password,
      confirm_password,
    } = body;

    if (!first_name?.trim() || !last_name?.trim()) {
      return NextResponse.json(
        { error: 'First name and last name are required' },
        { status: 400 }
      );
    }
    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!password?.trim()) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }
    if (password !== confirm_password) {
      return NextResponse.json(
        { error: 'Password and confirm password do not match' },
        { status: 400 }
      );
    }

    const shopify_shop_id = await resolveShopId();
    if (!shopify_shop_id) {
      console.error('[apply] No SHOPIFY_SHOP_ID set and no admin user exists');
      return NextResponse.json(
        { error: 'Applications are not available right now. Please contact support.' },
        { status: 503 }
      );
    }

    const emailNorm = email.trim().toLowerCase();

    // Affiliate.email is globally unique, so an existing affiliate would make
    // this application impossible to approve later. Reject it now.
    const existingAffiliate = await prisma.affiliate.findUnique({
      where: { email: emailNorm },
      select: { id: true },
    });
    if (existingAffiliate) {
      return NextResponse.json(
        { error: 'An affiliate account with this email already exists. Try logging in instead.' },
        { status: 400 }
      );
    }

    const existingApplication = await prisma.affiliateApplication.findFirst({
      where: { email: emailNorm, status: 'pending' },
      select: { id: true },
    });
    if (existingApplication) {
      return NextResponse.json(
        { error: 'An application with this email is already under review.' },
        { status: 400 }
      );
    }

    const password_hash = await hashPassword(password);

    const application = await prisma.affiliateApplication.create({
      data: {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        company: company?.trim() || null,
        email: emailNorm,
        paypal_email: paypal_email?.trim()?.toLowerCase() || null,
        address_line1: address_line1?.trim() || null,
        address_line2: address_line2?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zip: zip?.trim() || null,
        phone: phone?.trim() || null,
        password_hash,
        shopify_shop_id,
      },
    });

    // After the write, and awaited only so serverless doesn't kill the sends
    // mid-flight. Both resolve false rather than throw, so a mail outage can't
    // cost someone their application.
    await Promise.all([
      sendApplicationReceivedEmail(application),
      sendNewApplicationAdminEmail(application, shopify_shop_id),
    ]);

    // Deliberately no application id in the response — this route is public and
    // the applicant has nothing to do with the id.
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    console.error('[apply] Failed to create application:', error);
    return NextResponse.json(
      { error: 'Failed to submit application' },
      { status: 500 }
    );
  }
}
