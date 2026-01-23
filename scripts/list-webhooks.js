#!/usr/bin/env node

/**
 * List all webhooks for a shop
 * This helps verify webhooks were created successfully
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
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

const rootDir = path.resolve(__dirname, '..');
loadEnvFile(path.join(rootDir, '.env.local'));
loadEnvFile(path.join(rootDir, '.env'));

async function listWebhooks() {
  const shop = process.argv[2] || '163bfa-5f.myshopify.com';
  
  // Get access token from database or environment
  // For now, we'll need the user to provide it or get it from the database
  console.log('📋 Listing webhooks for shop:', shop);
  console.log('');
  console.log('To list webhooks, you need:');
  console.log('1. Your shop domain:', shop);
  console.log('2. Your Admin API access token');
  console.log('');
  console.log('You can get the access token from your database:');
  console.log('  SELECT access_token FROM "ShopifySession" WHERE shop = \'' + shop + '\';');
  console.log('');
  console.log('Or run this query in your database and use the token below.');
  console.log('');
  console.log('Then use this curl command:');
  console.log('');
  console.log(`curl -X GET \\`);
  console.log(`  "https://${shop}/admin/api/2026-01/webhooks.json" \\`);
  console.log(`  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN_HERE"`);
  console.log('');
  console.log('This will show all webhooks for your shop.');
}

listWebhooks().catch(console.error);
