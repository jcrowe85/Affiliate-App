import { cookies } from 'next/headers';
import { prisma } from './db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Standalone admin authentication (not Shopify OAuth)
 */

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Hash password with bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify password
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate session token
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create admin session
 */
export async function createAdminSession(adminUserId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.adminSession.create({
    data: {
      id: crypto.randomUUID(),
      admin_user_id: adminUserId,
      token,
      expires_at: expiresAt,
    },
  });

  // Update last login
  await prisma.adminUser.update({
    where: { id: adminUserId },
    data: { last_login: new Date() },
  });

  return token;
}

/**
 * Get current admin user from session
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

    if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.trim() === '') {
      return null;
    }

    // Validate token format (should be hex string, 64 chars for 32 bytes)
    if (sessionToken.length !== 64 || !/^[a-f0-9]+$/i.test(sessionToken)) {
      console.warn('Invalid session token format:', sessionToken.substring(0, 10) + '...');
      return null;
    }

    let session;
    try {
      session = await prisma.adminSession.findUnique({
        where: { token: sessionToken },
        include: {
          admin_user: true,
        },
      });
    } catch (prismaError: any) {
      console.error('Prisma error in getCurrentAdmin:', {
        message: prismaError.message,
        code: prismaError.code,
        meta: prismaError.meta,
      });
      throw prismaError;
    }

    if (!session || session.expires_at < new Date()) {
      // Session expired
      if (session) {
        await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => {
          // Ignore deletion errors
        });
      }
      return null;
    }

    return {
      id: session.admin_user.id,
      email: session.admin_user.email,
      name: session.admin_user.name,
      shopify_shop_id: session.admin_user.shopify_shop_id,
    };
  } catch (error: any) {
    console.error('Error in getCurrentAdmin:', error);
    
    // Provide more helpful error messages for database connection issues
    if (error.message?.includes("Can't reach database server")) {
      console.error('Database connection error - possible causes:');
      console.error('1. Neon database may be paused (wake it up in Neon dashboard)');
      console.error('2. Check DATABASE_URL environment variable');
      console.error('3. Verify network connectivity to Neon');
      console.error('4. Ensure you are using the pooled connection string (ends with -pooler)');
    }
    
    // Return null on error to allow graceful degradation
    return null;
  }
}

/**
 * Verify admin session token
 */
export async function verifyAdminSession(token: string): Promise<boolean> {
  const session = await prisma.adminSession.findUnique({
    where: { token },
  });

  if (!session || session.expires_at < new Date()) {
    return false;
  }

  return true;
}

/**
 * Delete admin session (logout)
 */
export async function deleteAdminSession(token: string): Promise<void> {
  await prisma.adminSession.deleteMany({
    where: { token },
  });
}

/**
 * Clean expired sessions
 */
export async function cleanExpiredSessions(): Promise<void> {
  await prisma.adminSession.deleteMany({
    where: {
      expires_at: {
        lt: new Date(),
      },
    },
  });
}

// ============================================
// AFFILIATE AUTHENTICATION
// ============================================

/**
 * Create affiliate session
 */
export async function createAffiliateSession(affiliateId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.affiliateSession.create({
    data: {
      id: crypto.randomUUID(),
      affiliate_id: affiliateId,
      token,
      expires_at: expiresAt,
    },
  });

  return token;
}

/**
 * Get current affiliate from session
 * SECURITY: This function ensures affiliates can only access their own data
 */
export async function getCurrentAffiliate(): Promise<{
  id: string;
  email: string;
  name: string;
  affiliate_number: number | null;
  shopify_shop_id: string;
  status: string;
} | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('affiliate_session')?.value;

    if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.trim() === '') {
      return null;
    }

    // Validate token format (should be hex string, 64 chars for 32 bytes)
    if (sessionToken.length !== 64 || !/^[a-f0-9]+$/i.test(sessionToken)) {
      console.warn('Invalid affiliate session token format:', sessionToken.substring(0, 10) + '...');
      return null;
    }

    let session;
    try {
      session = await prisma.affiliateSession.findUnique({
        where: { token: sessionToken },
        include: {
          affiliate: true,
        },
      });
    } catch (prismaError: any) {
      console.error('Prisma error in getCurrentAffiliate:', {
        message: prismaError.message,
        code: prismaError.code,
        meta: prismaError.meta,
      });
      throw prismaError;
    }

    if (!session || session.expires_at < new Date()) {
      // Session expired
      if (session) {
        await prisma.affiliateSession.delete({ where: { id: session.id } }).catch(() => {
          // Ignore deletion errors
        });
      }
      return null;
    }

    // SECURITY: Only allow active affiliates to access
    if (session.affiliate.status !== 'active') {
      console.warn(`Affiliate ${session.affiliate.id} attempted login but status is ${session.affiliate.status}`);
      return null;
    }

    return {
      id: session.affiliate.id,
      email: session.affiliate.email,
      name: session.affiliate.name,
      affiliate_number: session.affiliate.affiliate_number,
      shopify_shop_id: session.affiliate.shopify_shop_id,
      status: session.affiliate.status,
    };
  } catch (error: any) {
    console.error('Error in getCurrentAffiliate:', error);
    return null;
  }
}

/**
 * Verify affiliate session token
 */
export async function verifyAffiliateSession(token: string): Promise<boolean> {
  const session = await prisma.affiliateSession.findUnique({
    where: { token },
    include: {
      affiliate: true,
    },
  });

  if (!session || session.expires_at < new Date()) {
    return false;
  }

  // Only allow active affiliates
  if (session.affiliate.status !== 'active') {
    return false;
  }

  return true;
}

/**
 * Delete affiliate session (logout)
 */
export async function deleteAffiliateSession(token: string): Promise<void> {
  await prisma.affiliateSession.deleteMany({
    where: { token },
  });
}

/**
 * Clean expired affiliate sessions
 */
export async function cleanExpiredAffiliateSessions(): Promise<void> {
  await prisma.affiliateSession.deleteMany({
    where: {
      expires_at: {
        lt: new Date(),
      },
    },
  });
}