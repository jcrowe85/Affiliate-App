import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import {
  createSeedOrder,
  resolveShopifyAdminCredentials,
  ShopifyAdminError,
} from '@/lib/shopify-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  line_items: z
    .array(
      z.object({
        variant_id: z.string().min(1),
        quantity: z.number().int().min(1).max(100),
      })
    )
    .min(1, 'Pick at least one product'),
  /** ISO-3166-1 alpha-2. Affiliates have no country on file, so it is supplied here. */
  country_code: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'Country must be a 2-letter code')
    .default('US'),
  currency_code: z.string().regex(/^[A-Za-z]{3}$/).default('USD'),
  send_receipt: z.boolean().default(true),
  note: z.string().max(500).optional(),
});

/**
 * Sends free product to an affiliate so they can film content with it.
 *
 * The order ships to the address on their affiliate record at zero cost. It is
 * tagged and marked `ref=internal` so it stays out of affiliate attribution —
 * a creator must not earn commission on product gifted to them. Inventory is
 * decremented because real stock leaves the warehouse.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Invalid request' },
        { status: 400 }
      );
    }
    const { line_items, country_code, currency_code, send_receipt, note } = parsed.data;

    const affiliate = await prisma.affiliate.findFirst({
      where: { id: params.id, shopify_shop_id: admin.shopify_shop_id },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    if (!affiliate.address_line1 || !affiliate.city || !affiliate.zip) {
      return NextResponse.json(
        {
          error:
            'Affiliate has no complete address on file. Add street, city and ZIP before sending product.',
        },
        { status: 422 }
      );
    }

    const creds = await resolveShopifyAdminCredentials(admin.shopify_shop_id);
    const order = await createSeedOrder(creds, {
      email: affiliate.email,
      phone: affiliate.phone,
      currencyCode: currency_code.toUpperCase(),
      lineItems: line_items.map((li) => ({
        variantId: li.variant_id,
        quantity: li.quantity,
      })),
      shippingAddress: {
        firstName: affiliate.first_name || affiliate.name || null,
        lastName: affiliate.last_name || null,
        company: affiliate.company,
        address1: affiliate.address_line1,
        address2: affiliate.address_line2,
        city: affiliate.city,
        provinceCode: affiliate.state,
        zip: affiliate.zip,
        countryCode: country_code.toUpperCase(),
        phone: affiliate.phone,
      },
      tags: [
        'affiliate-seeding',
        'gifted',
        `affiliate-${affiliate.affiliate_number ?? affiliate.id}`,
      ],
      note:
        note?.trim() ||
        `Creator seeding for ${affiliate.email}, sent by ${admin.email}. No charge, no commission.`,
      sendReceipt: send_receipt,
    });

    return NextResponse.json({ order });
  } catch (error: any) {
    if (error instanceof ShopifyAdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error creating affiliate seeding order:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send product' },
      { status: 500 }
    );
  }
}
