import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin, hashPassword } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Update affiliate or delete affiliate
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const affiliate = await prisma.affiliate.findFirst({
      where: {
        id: params.id,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found' },
        { status: 404 }
      );
    }

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
      source,
      offer_id,
      password,
      merchant_id,
      status,
      payout_method,
      payout_identifier,
      payout_terms_days,
      webhook_url,
      webhook_parameter_mapping,
      redirect_base_url,
      affiliate_number,
    } = body;

    const data: Record<string, unknown> = {};

    if (first_name !== undefined) data.first_name = first_name?.trim() || null;
    if (last_name !== undefined) data.last_name = last_name?.trim() || null;
    if (first_name !== undefined || last_name !== undefined) {
      const fn = (first_name ?? affiliate.first_name)?.trim() || '';
      const ln = (last_name ?? affiliate.last_name)?.trim() || '';
      data.name = `${fn} ${ln}`.trim() || affiliate.name;
    }
    if (company !== undefined) data.company = company?.trim() || null;
    if (email !== undefined) data.email = email.trim().toLowerCase();
    if (paypal_email !== undefined) {
      data.paypal_email = paypal_email?.trim() || null;
      data.payout_identifier = paypal_email?.trim() || null;
      data.payout_method = paypal_email?.trim() ? 'paypal' : null;
    }
    if (address_line1 !== undefined) data.address_line1 = address_line1?.trim() || null;
    if (address_line2 !== undefined) data.address_line2 = address_line2?.trim() || null;
    if (city !== undefined) data.city = city?.trim() || null;
    if (state !== undefined) data.state = state?.trim() || null;
    if (zip !== undefined) data.zip = zip?.trim() || null;
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (source !== undefined) data.source = source?.trim() || null;
    if (merchant_id !== undefined) data.merchant_id = merchant_id?.trim() || null;
    if (status !== undefined) data.status = status;
    if (payout_method !== undefined) data.payout_method = payout_method || null;
    if (payout_identifier !== undefined) data.payout_identifier = payout_identifier || null;
    if (payout_terms_days !== undefined) data.payout_terms_days = payout_terms_days;
    if (webhook_url !== undefined) data.webhook_url = webhook_url?.trim() || null;
    if (webhook_parameter_mapping !== undefined) data.webhook_parameter_mapping = webhook_parameter_mapping || null;
    if (redirect_base_url !== undefined) data.redirect_base_url = redirect_base_url?.trim() || null;

    // Only update password if a new password is provided (and it's not just whitespace)
    if (password !== undefined && password !== null && typeof password === 'string' && password.trim().length > 0) {
      const trimmedPassword = password.trim();
      console.log('[Affiliate Update] Updating password for affiliate:', params.id);
      data.password_hash = await hashPassword(trimmedPassword);
    } else if (password !== undefined) {
      console.log('[Affiliate Update] Password field provided but empty/whitespace, skipping password update');
    }

    if (email !== undefined) {
      const emailNorm = email.trim().toLowerCase();
      const existing = await prisma.affiliate.findFirst({
        where: { email: emailNorm },
      });
      if (existing && existing.id !== params.id) {
        return NextResponse.json(
          { error: 'Affiliate with this email already exists' },
          { status: 400 }
        );
      }
    }

    if (merchant_id !== undefined && merchant_id?.trim()) {
      const existing = await prisma.affiliate.findFirst({
        where: {
          shopify_shop_id: admin.shopify_shop_id,
          merchant_id: merchant_id.trim(),
        },
      });
      if (existing && existing.id !== params.id) {
        return NextResponse.json(
          { error: 'Merchant ID already in use' },
          { status: 400 }
        );
      }
    }

    // Handle affiliate_number update
    if (affiliate_number !== undefined && affiliate_number !== null) {
      const numValue = typeof affiliate_number === 'string' ? parseInt(affiliate_number, 10) : affiliate_number;
      if (isNaN(numValue)) {
        return NextResponse.json(
          { error: 'Invalid affiliate number' },
          { status: 400 }
        );
      }
      // Check if affiliate_number is already in use by another affiliate
      const existing = await prisma.affiliate.findFirst({
        where: {
          shopify_shop_id: admin.shopify_shop_id,
          affiliate_number: numValue,
        },
      });
      if (existing && existing.id !== params.id) {
        return NextResponse.json(
          { error: 'Affiliate number already in use' },
          { status: 400 }
        );
      }
      data.affiliate_number = numValue;
    }

    // Validate offer if provided
    if (offer_id !== undefined && offer_id !== null && offer_id !== '') {
      const offer = await prisma.offer.findFirst({
        where: {
          id: offer_id,
          shopify_shop_id: admin.shopify_shop_id,
        },
      });
      if (!offer) {
        return NextResponse.json(
          { error: 'Invalid offer' },
          { status: 400 }
        );
      }
      data.offer_id = offer_id;
    } else if (offer_id === null || offer_id === '') {
      // Allow clearing the offer
      data.offer_id = null;
    }

    const updated = await prisma.affiliate.update({
      where: { id: params.id },
      data: data as any,
      include: {
        offer: true,
      },
    });

    return NextResponse.json({
      success: true,
      affiliate: {
        id: updated.id,
        name: updated.name,
        first_name: updated.first_name,
        last_name: updated.last_name,
        company: updated.company,
        email: updated.email,
        paypal_email: updated.paypal_email,
        address_line1: updated.address_line1,
        address_line2: updated.address_line2,
        city: updated.city,
        state: updated.state,
        zip: updated.zip,
        phone: updated.phone,
        status: updated.status,
        merchant_id: updated.merchant_id,
        offer_id: updated.offer_id,
        webhook_url: updated.webhook_url,
        webhook_parameter_mapping: updated.webhook_parameter_mapping,
        redirect_base_url: updated.redirect_base_url,
        offer: updated.offer ? { id: updated.offer.id, name: updated.offer.name, offer_number: updated.offer.offer_number } : null,
      },
    });
  } catch (error: any) {
    console.error('Error updating affiliate:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update affiliate' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const affiliate = await prisma.affiliate.findFirst({
      where: {
        id: params.id,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found' },
        { status: 404 }
      );
    }

    await prisma.affiliate.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Affiliate deleted',
    });
  } catch (error: any) {
    console.error('Error deleting affiliate:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete affiliate' },
      { status: 500 }
    );
  }
}