import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import {
  listActiveProducts,
  resolveShopifyAdminCredentials,
  ShopifyAdminError,
} from '@/lib/shopify-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Active products from the Shopify catalog, for the seed-order product picker.
 * Only status:active is returned — draft and archived products are excluded by
 * the Shopify query itself, so they never reach the client.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const creds = await resolveShopifyAdminCredentials(admin.shopify_shop_id);
    const products = await listActiveProducts(creds);
    return NextResponse.json({ products });
  } catch (error: any) {
    if (error instanceof ShopifyAdminError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error listing Shopify products:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load products' },
      { status: 500 }
    );
  }
}
