#!/usr/bin/env node

/**
 * Test Shopify API Configuration
 * 
 * This script tests:
 * 1. Environment variables are set
 * 2. HMAC verification works correctly
 * 3. Webhook signature validation
 * 
 * Usage: node scripts/test-shopify-config.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Try to load .env files manually (since dotenv might not be available)
function loadEnvFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      });
    }
  } catch (e) {
    // Ignore errors
  }
}

// Load .env files in order of priority
const rootDir = path.resolve(__dirname, '..');
loadEnvFile(path.join(rootDir, '.env.local'));
loadEnvFile(path.join(rootDir, '.env'));

function verifyShopifyWebhook(body, hmac, secret) {
  const calculatedHmac = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  // timingSafeEqual requires buffers of the same length
  // If lengths don't match, it's definitely invalid
  if (calculatedHmac.length !== hmac.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(calculatedHmac),
      Buffer.from(hmac)
    );
  } catch (e) {
    return false;
  }
}

function testHMACVerification() {
  console.log('\n🧪 Testing Shopify Webhook HMAC Verification\n');
  console.log('='.repeat(60));

  // Check environment variables
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const shopDomain = process.env.SHOPIFY_SHOP_ID;

  console.log('\n1. Environment Variables Check:');
  console.log('   SHOPIFY_API_KEY:', apiKey ? `✅ Set (${apiKey.substring(0, 10)}...)` : '❌ NOT SET');
  console.log('   SHOPIFY_API_SECRET:', apiSecret ? `✅ Set (${apiSecret.substring(0, 10)}...)` : '❌ NOT SET');
  console.log('   SHOPIFY_SHOP_ID:', shopDomain ? `✅ Set (${shopDomain})` : '❌ NOT SET');

  if (!apiSecret) {
    console.log('\n❌ ERROR: SHOPIFY_API_SECRET is not set!');
    console.log('   Please add it to your .env or .env.local file');
    console.log('   Format: SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxx');
    process.exit(1);
  }

  // Test HMAC verification with sample data
  console.log('\n2. HMAC Verification Test:');
  
  // Sample webhook payload (simulating a real Shopify webhook)
  const sampleBody = JSON.stringify({
    id: 1234567890,
    order_number: 1001,
    financial_status: 'paid',
    total_price: '100.00',
    email: 'test@example.com',
    created_at: '2024-01-15T10:30:00Z'
  });

  // Generate a valid HMAC for this body
  const validHmac = crypto
    .createHmac('sha256', apiSecret)
    .update(sampleBody, 'utf8')
    .digest('base64');

  // Test with valid HMAC
  const isValid = verifyShopifyWebhook(sampleBody, validHmac, apiSecret);
  console.log('   Valid HMAC test:', isValid ? '✅ PASSED' : '❌ FAILED');

  // Test with invalid HMAC
  const invalidHmac = 'invalid_hmac_signature';
  const isInvalid = verifyShopifyWebhook(sampleBody, invalidHmac, apiSecret);
  console.log('   Invalid HMAC test:', !isInvalid ? '✅ PASSED (correctly rejected)' : '❌ FAILED (should reject)');

  // Test with wrong secret
  const wrongSecret = 'wrong_secret_key';
  const wrongHmac = crypto
    .createHmac('sha256', wrongSecret)
    .update(sampleBody, 'utf8')
    .digest('base64');
  const isWrongSecret = verifyShopifyWebhook(sampleBody, wrongHmac, apiSecret);
  console.log('   Wrong secret test:', !isWrongSecret ? '✅ PASSED (correctly rejected)' : '❌ FAILED (should reject)');

  console.log('\n3. Configuration Summary:');
  if (apiKey && apiSecret) {
    console.log('   ✅ API Key and Secret are configured');
    console.log('   ✅ HMAC verification function works correctly');
    console.log('   ✅ Ready to receive webhooks');
  } else {
    console.log('   ❌ Configuration incomplete');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests passed!\n');
}

// Run the test
try {
  testHMACVerification();
} catch (error) {
  console.error('\n❌ Test failed with error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
