import { prisma } from './db';

/**
 * The shop a public request belongs to.
 *
 * Falls back to the first admin's shop when SHOPIFY_SHOP_ID is unset, and
 * returns null rather than inventing a placeholder — a verification filed under
 * a shop that owns no affiliates is silently useless, which is worse than a
 * refused request.
 */
export async function resolveShopId(): Promise<string | null> {
  if (process.env.SHOPIFY_SHOP_ID) {
    return process.env.SHOPIFY_SHOP_ID.replace('.myshopify.com', '');
  }
  const admin = await prisma.adminUser.findFirst({
    select: { shopify_shop_id: true },
    orderBy: { created_at: 'asc' },
  });
  return admin?.shopify_shop_id ?? null;
}

/**
 * The caller's IP, taken only from headers the platform sets itself.
 *
 * `x-forwarded-for` is explicitly NOT trusted: any client can send it and
 * change it per request, so a rate limit keyed on it limits nothing. Vercel
 * writes `x-vercel-forwarded-for` at the edge and it cannot be spoofed by the
 * caller, so that is the one to believe.
 *
 * Returns null when no trusted header is present — callers guarding spend must
 * treat that as a refusal rather than as "no limit applies".
 */
export function getTrustedClientIp(request: Request): string | null {
  const candidates = ['x-vercel-forwarded-for', 'x-real-ip'];
  for (const header of candidates) {
    const value = request.headers.get(header)?.split(',')[0]?.trim();
    if (value) return value;
  }
  return null;
}

/** True when running on Vercel, where a trusted IP header is always present. */
export function isPlatformHosted(): boolean {
  return Boolean(process.env.VERCEL);
}
