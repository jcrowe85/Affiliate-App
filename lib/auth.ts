import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

/**
 * Generate a random session token
 */
function generateSessionToken(): string {
  return require('crypto').randomBytes(32).toString('hex');
}

/**
 * Create an admin session
 */
export async function createAdminSession(adminUserId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await prisma.adminSession.create({
    data: {
      admin_user_id: adminUserId,
      token,
      expires_at: expiresAt,
    },
  });

  return token;
}

/**
 * Get current admin from session cookie
 */
export async function getCurrentAdmin(): Promise<{
  id: string;
  email: string;
  name: string | null;
  shopify_shop_id: string;
} | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('admin_session')?.value;

    if (!sessionToken) {
      return null;
    }

    // Find session
    const session = await prisma.adminSession.findUnique({
      where: { token: sessionToken },
      include: {
        admin_user: true,
      },
    });

    if (!session || !session.admin_user) {
      return null;
    }

    // Check if session expired
    if (session.expires_at < new Date()) {
      // Delete expired session
      await prisma.adminSession.delete({
        where: { token: sessionToken },
      });
      return null;
    }

    return {
      id: session.admin_user.id,
      email: session.admin_user.email,
      name: session.admin_user.name,
      shopify_shop_id: session.admin_user.shopify_shop_id,
    };
  } catch (error) {
    console.error('Error getting current admin:', error);
    return null;
  }
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Delete an admin session
 */
export async function deleteAdminSession(token: string): Promise<void> {
  await prisma.adminSession.delete({
    where: { token },
  }).catch(() => {
    // Ignore if session doesn't exist
  });
}

/**
 * Create an affiliate session
 */
export async function createAffiliateSession(affiliateId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await prisma.affiliateSession.create({
    data: {
      affiliate_id: affiliateId,
      token,
      expires_at: expiresAt,
    },
  });

  return token;
}

/**
 * Get current affiliate from session cookie
 */
export async function getCurrentAffiliate(): Promise<{
  id: string;
  email: string;
  name: string;
  affiliate_number: number | null;
  shopify_shop_id: string;
} | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('affiliate_session')?.value;

    if (!sessionToken) {
      return null;
    }

    // Find session
    const session = await prisma.affiliateSession.findUnique({
      where: { token: sessionToken },
      include: {
        affiliate: true,
      },
    });

    if (!session || !session.affiliate) {
      return null;
    }

    // Check if session expired
    if (session.expires_at < new Date()) {
      // Delete expired session
      await prisma.affiliateSession.delete({
        where: { token: sessionToken },
      });
      return null;
    }

    return {
      id: session.affiliate.id,
      email: session.affiliate.email,
      name: session.affiliate.name,
      affiliate_number: session.affiliate.affiliate_number,
      shopify_shop_id: session.affiliate.shopify_shop_id,
    };
  } catch (error) {
    console.error('Error getting current affiliate:', error);
    return null;
  }
}

/**
 * Delete an affiliate session
 */
export async function deleteAffiliateSession(token: string): Promise<void> {
  await prisma.affiliateSession.delete({
    where: { token },
  }).catch(() => {
    // Ignore if session doesn't exist
  });
}
