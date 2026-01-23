import crypto from 'crypto';

/**
 * Hash IP address for privacy
 */
export function hashIP(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

/**
 * Hash user agent for privacy
 */
export function hashUserAgent(userAgent: string): string {
  return crypto.createHash('sha256').update(userAgent).digest('hex');
}

/**
 * Verify Shopify webhook HMAC
 */
export function verifyShopifyWebhook(
  body: string,
  hmac: string,
  secret: string
): boolean {
  // Calculate HMAC using the exact same method Shopify uses
  // CRITICAL: Body must be exactly as received, no modifications
  const calculatedHmac = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  // timingSafeEqual requires buffers of the same length
  if (calculatedHmac.length !== hmac.length) {
    console.error('HMAC length mismatch:', {
      calculated: calculatedHmac.length,
      received: hmac.length,
      calculatedPreview: calculatedHmac.substring(0, 20),
      receivedPreview: hmac.substring(0, 20)
    });
    return false;
  }

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(calculatedHmac),
      Buffer.from(hmac)
    );
    
    // Debug logging when HMAC fails
    if (!isValid) {
      console.error('HMAC Debug (Mismatch):');
      console.error('   Received HMAC:', hmac.substring(0, 30) + '...');
      console.error('   Calculated HMAC:', calculatedHmac.substring(0, 30) + '...');
      console.error('   Body length:', body.length);
      console.error('   Secret length:', secret.length);
      console.error('   Secret preview:', secret.substring(0, 5) + '...' + secret.substring(secret.length - 5));
      console.error('   Body first 100 chars:', body.substring(0, 100));
      console.error('   Body last 100 chars:', body.substring(Math.max(0, body.length - 100)));
      
      // Check for common issues
      console.error('');
      console.error('   🔍 Debugging checks:');
      console.error('   - Body encoding: Check if body has any special characters');
      console.error('   - Secret match: Verify SHOPIFY_API_SECRET matches Shopify Partners');
      console.error('   - Body modification: Check if Next.js middleware modified body');
      console.error('   - UTF-8 encoding: Body should be UTF-8, not modified');
      
      // Try to detect if body was modified
      const bodyBytes = Buffer.from(body, 'utf8');
      const bodyAsString = bodyBytes.toString('utf8');
      if (bodyAsString !== body) {
        console.error('   ⚠️  WARNING: Body encoding issue detected!');
      }
    }
    
    return isValid;
  } catch (e) {
    console.error('HMAC verification error:', e);
    return false;
  }
}

/**
 * Generate random click ID
 */
export function generateClickId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Extract click ID from query params or cookie
 */
export function extractClickId(params: Record<string, string | string[] | undefined>): string | null {
  // Check sub3 parameter (preferred)
  const sub3 = params.sub3;
  if (sub3 && typeof sub3 === 'string') {
    return sub3;
  }
  
  // Check other common parameters
  const clickId = params.click_id || params.affiliate_id || params.ref;
  if (clickId && typeof clickId === 'string') {
    return clickId;
  }

  return null;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number | string, currency: string = 'USD'): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(numAmount);
}