/**
 * Per-creator discount codes, created in Shopify when an affiliate is approved.
 *
 * Why a code at all, when this app already attributes by link: creators post to
 * Instagram and Facebook, where a link is barely usable — no clickable captions,
 * and a bio link is shared across every brand they work with. A code is the one
 * thing they can say out loud in a video. Coupon attribution is also the
 * highest-priority signal in attribution-enhanced, so it beats a link whenever
 * both are present.
 *
 * The code is 10% off at the order level, and that class matters. Verified
 * against the live store: this shape returns discountClasses ["ORDER"], and
 * every storewide automatic discount here declares orderDiscounts: true, so the
 * code stacks alongside Buy 2 Get 1 Free and the subscription gifts instead of
 * competing with them. A code set not to combine would force the customer to
 * choose between it and a better bundle — they'd drop the code, and the
 * attribution with it.
 *
 * The 10% is a deliberate margin cost, not an accident: a code that visibly
 * does nothing gives the creator nothing to say and the customer no reason to
 * type it. AFFILIATE_COUPON_PERCENT changes it when the offer does.
 */

import { prisma } from './db';
import {
  shopifyAdminGraphQL,
  ShopifyAdminError,
  type ShopifyAdminCredentials,
} from './shopify-admin';

const CREATE_MUTATION = `
  mutation CreateAffiliateCode($input: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $input) {
      codeDiscountNode { id }
      userErrors { field message code }
    }
  }
`;

export type CreatedCoupon = {
  code: string;
  shopifyId: string;
  percentOff: number;
  linkId: string;
};

/** Percentage off the generated code gives, 0–100. Defaults to 10 — see above. */
export function couponPercent(): number {
  const raw = parseFloat(process.env.AFFILIATE_COUPON_PERCENT || '10');
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(raw, 100);
}

/** Where the affiliate's link points. The code works storewide regardless. */
function destinationUrl(): string {
  return process.env.AFFILIATE_COUPON_DESTINATION_URL || 'https://tryfleur.com';
}

export function couponsEnabled(): boolean {
  return process.env.AFFILIATE_COUPON_ENABLED !== 'false';
}

/**
 * A credential that can actually write discounts.
 *
 * resolveShopifyAdminCredentials prefers the installed app's session, but that
 * session was granted write_metaobjects, write_orders and read_products — no
 * discount scopes. Asking it to create a code returns ACCESS_DENIED. The custom
 * app token in the environment does hold write_discounts, so the requirement is
 * named here and the credential chosen to match rather than assumed.
 */
export async function resolveDiscountCredentials(
  shopifyShopId: string
): Promise<ShopifyAdminCredentials> {
  const shopDomain = shopifyShopId.endsWith('.myshopify.com')
    ? shopifyShopId
    : `${shopifyShopId}.myshopify.com`;

  const session = await prisma.shopifySession.findFirst({
    where: { shop: shopDomain },
    orderBy: { created_at: 'desc' },
  });

  const sessionCan =
    session?.access_token && (session.scope ?? '').split(',').some((s) => s.trim() === 'write_discounts');

  if (sessionCan && session?.access_token) {
    return { domain: session.shop, token: session.access_token, source: 'app-session', scope: session.scope ?? null };
  }

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (domain && token) {
    return { domain, token, source: 'env', scope: null };
  }

  throw new ShopifyAdminError(
    'No Shopify credential with write_discounts. Either reinstall the app with ' +
      'read_discounts and write_discounts, or set SHOPIFY_STORE_DOMAIN and ' +
      'SHOPIFY_ADMIN_ACCESS_TOKEN to a custom app token that has them.',
    503
  );
}

/**
 * A code a creator can say out loud: their first name and affiliate number.
 *
 * Uppercase and stripped to A–Z0–9 because that is what a customer will type,
 * and because Shopify treats the code as case-insensitive at checkout while our
 * own lookup used to not.
 */
export function buildCouponCode(input: {
  firstName?: string | null;
  affiliateNumber?: number | null;
  suffix?: string;
}): string {
  const name = (input.firstName || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 12);
  const base = name || 'FLEUR';
  const num = input.affiliateNumber != null ? String(input.affiliateNumber) : '';
  return `${base}${num}${input.suffix ?? ''}`.slice(0, 32);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

/** True when no AffiliateLink already holds this code, ignoring case. */
async function codeIsFree(shopifyShopId: string, code: string): Promise<boolean> {
  const existing = await prisma.affiliateLink.findFirst({
    where: { shopify_shop_id: shopifyShopId, coupon_code: { equals: code, mode: 'insensitive' } },
    select: { id: true },
  });
  return !existing;
}

/**
 * Creates the affiliate's code in Shopify and stores it as their attribution
 * key. Returns null when coupons are switched off or one already exists.
 *
 * Idempotent: an affiliate who already has a coupon link keeps it, so a retried
 * approval cannot mint a second code.
 */
export async function ensureAffiliateCoupon(
  shopifyShopId: string,
  affiliate: { id: string; first_name: string | null; affiliate_number: number | null }
): Promise<CreatedCoupon | null> {
  if (!couponsEnabled()) return null;

  const already = await prisma.affiliateLink.findFirst({
    where: { affiliate_id: affiliate.id, coupon_code: { not: null } },
    select: { id: true, coupon_code: true },
  });
  if (already?.coupon_code) return null;

  let code = buildCouponCode({
    firstName: affiliate.first_name,
    affiliateNumber: affiliate.affiliate_number,
  });
  for (let attempt = 0; attempt < 5 && !(await codeIsFree(shopifyShopId, code)); attempt++) {
    code = buildCouponCode({
      firstName: affiliate.first_name,
      affiliateNumber: affiliate.affiliate_number,
      suffix: randomSuffix(),
    });
  }

  const percent = couponPercent();
  const creds = await resolveDiscountCredentials(shopifyShopId);

  type Resp = {
    discountCodeBasicCreate: {
      codeDiscountNode: { id: string } | null;
      userErrors: Array<{ field: string[] | null; message: string; code: string | null }>;
    };
  };

  const data = await shopifyAdminGraphQL<Resp>(creds, CREATE_MUTATION, {
    input: {
      title: `Affiliate ${code}`,
      code,
      startsAt: new Date().toISOString(),
      context: { all: 'ALL' },
      customerGets: {
        // Shopify takes a fraction here, not a percentage.
        value: { percentage: percent / 100 },
        items: { all: true },
        // Both purchase types. Left unset, Shopify makes the code one-time
        // only — verified, the summary read "off one-time purchase products" —
        // so a customer who subscribed would get nothing off and the creator
        // who sent them would earn nothing. Subscriptions are a large share of
        // orders here, so that silently wrote off much of the programme.
        appliesOnOneTimePurchase: true,
        appliesOnSubscription: true,
      },
      // First billing cycle only, matching a first-purchase-only commission.
      // Shopify defaults this to 1; setting it explicitly keeps the intent in
      // the code, because 0 means every recurring order forever while the
      // creator is still paid just once.
      recurringCycleLimit: 1,
      // Combines with everything on purpose: the storewide bundles are active
      // and better than any code we would issue. A code that competed with them
      // would simply go unused, taking the attribution with it.
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      appliesOncePerCustomer: false,
    },
  });

  const result = data.discountCodeBasicCreate;
  if (result.userErrors?.length) {
    const first = result.userErrors[0];
    throw new ShopifyAdminError(
      `Shopify rejected the discount code ${code}: ${first.message}${first.field ? ` (${first.field.join('.')})` : ''}`,
      422
    );
  }
  const shopifyId = result.codeDiscountNode?.id;
  if (!shopifyId) {
    throw new ShopifyAdminError(`Shopify created no discount for ${code}`, 502);
  }

  const link = await prisma.affiliateLink.create({
    data: {
      affiliate_id: affiliate.id,
      destination_url: destinationUrl(),
      campaign_name: 'Creator code',
      coupon_code: code,
      shopify_shop_id: shopifyShopId,
    },
    select: { id: true },
  });

  return { code, shopifyId, percentOff: percent, linkId: link.id };
}
