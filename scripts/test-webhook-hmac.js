#!/usr/bin/env node

/**
 * Test script to verify webhook HMAC calculation
 * This helps debug HMAC verification issues
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load environment variables manually (no dotenv dependency)
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

// Get secret from environment
const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_WEBHOOK_SECRET;

if (!secret) {
  console.error('❌ Error: SHOPIFY_API_SECRET or SHOPIFY_WEBHOOK_SECRET not set in .env');
  process.exit(1);
}

console.log('🔍 Webhook HMAC Test');
console.log('==================');
console.log(`Secret length: ${secret.length}`);
console.log(`Secret preview: ${secret.substring(0, 10)}...${secret.substring(secret.length - 5)}`);
console.log('');

// Test with a sample webhook body
const sampleBody = JSON.stringify({
  id: 123456789,
  order_number: 1001,
  email: 'test@example.com',
  total_price: '100.00',
  financial_status: 'paid'
});

console.log('Test Body:');
console.log(sampleBody);
console.log('');

// Calculate HMAC
const calculatedHmac = crypto
  .createHmac('sha256', secret)
  .update(sampleBody, 'utf8')
  .digest('base64');

console.log('Calculated HMAC:');
console.log(calculatedHmac);
console.log('');

// Instructions
console.log('📝 Instructions:');
console.log('1. Go to Shopify Admin → Settings → Notifications → Webhooks');
console.log('2. Click on your webhook');
console.log('3. Look at the "Recent deliveries" section');
console.log('4. Find a recent webhook delivery');
console.log('5. Compare the HMAC in the delivery details with the calculated HMAC above');
console.log('');
console.log('💡 Note: The HMACs will be different because this is a test body.');
console.log('   But the calculation method should be the same.');
console.log('');
console.log('🔍 To verify your secret is correct:');
console.log('1. Check Shopify Partners → Your App → App setup');
console.log('2. Look for "Client secret" (this is your SHOPIFY_API_SECRET)');
console.log('3. Make sure it matches what\'s in your .env file');
console.log('');
console.log('⚠️  Important:');
console.log('   - Webhooks use the same secret as OAuth (Client secret)');
console.log('   - The secret should be exactly as shown in Shopify Partners');
console.log('   - No extra spaces, quotes, or characters');
