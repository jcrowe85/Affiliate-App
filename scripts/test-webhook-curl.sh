#!/bin/bash

# Test Shopify Webhook Endpoint with Curl
# This simulates what Shopify sends to your webhook endpoint

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Testing Shopify Webhook Endpoint${NC}\n"

# Load environment variables
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
elif [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if required variables are set
if [ -z "$SHOPIFY_API_SECRET" ]; then
  echo -e "${RED}❌ ERROR: SHOPIFY_API_SECRET is not set${NC}"
  echo "   Please set it in .env or .env.local"
  exit 1
fi

if [ -z "$SHOPIFY_API_KEY" ]; then
  echo -e "${RED}❌ ERROR: SHOPIFY_API_KEY is not set${NC}"
  exit 1
fi

# Get webhook URL from user or use default
WEBHOOK_URL="${1:-http://localhost:3000/api/webhooks/orders}"

echo -e "Webhook URL: ${GREEN}${WEBHOOK_URL}${NC}"
echo -e "API Key: ${GREEN}${SHOPIFY_API_KEY:0:10}...${NC}"
echo -e "API Secret: ${GREEN}${SHOPIFY_API_SECRET:0:10}...${NC}\n"

# Sample order webhook payload (simulating Shopify)
SAMPLE_BODY='{
  "id": 1234567890,
  "order_number": 1001,
  "financial_status": "paid",
  "total_price": "100.00",
  "subtotal_price": "100.00",
  "currency": "USD",
  "email": "test@example.com",
  "created_at": "2024-01-15T10:30:00Z",
  "attributes": [
    {
      "key": "affiliate_click_id",
      "value": "test_click_id_12345"
    }
  ],
  "client_details": {
    "browser_ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0",
    "landing_site": "https://tryfleur.com/?ref=30843"
  }
}'

# Generate HMAC signature (same as Shopify does)
HMAC=$(echo -n "$SAMPLE_BODY" | openssl dgst -sha256 -hmac "$SHOPIFY_API_SECRET" -binary | base64)

echo -e "${YELLOW}📤 Sending test webhook request...${NC}\n"

# Send the request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-Sha256: $HMAC" \
  -H "X-Shopify-Topic: orders/create" \
  -H "X-Shopify-Shop-Domain: test-shop.myshopify.com" \
  -d "$SAMPLE_BODY")

# Split response and status code
HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

echo -e "HTTP Status Code: ${HTTP_CODE}\n"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo -e "${GREEN}✅ SUCCESS: Webhook accepted!${NC}"
  echo -e "Response: $HTTP_BODY"
elif [ "$HTTP_CODE" = "401" ]; then
  echo -e "${RED}❌ UNAUTHORIZED: HMAC verification failed${NC}"
  echo -e "   This means the SHOPIFY_API_SECRET doesn't match"
  echo -e "   Check your .env file and Shopify Partners dashboard"
elif [ "$HTTP_CODE" = "400" ]; then
  echo -e "${YELLOW}⚠️  BAD REQUEST: Missing headers or invalid format${NC}"
  echo -e "Response: $HTTP_BODY"
else
  echo -e "${RED}❌ ERROR: Unexpected status code${NC}"
  echo -e "Response: $HTTP_BODY"
fi

echo ""
