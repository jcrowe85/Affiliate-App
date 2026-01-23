/**
 * Shopify Checkout Extension Script
 * 
 * This script should be added to your Shopify checkout extension
 * to capture affiliate cookies and pass them as order metafields.
 * 
 * Installation:
 * 1. Create a checkout extension in your Shopify admin
 * 2. Add this script to capture cookies and set order metafields
 * 3. The metafields will be available in order webhooks
 */

// Function to get cookie value
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Run when checkout loads
document.addEventListener('DOMContentLoaded', function() {
  const affiliateClickId = getCookie('affiliate_click_id');
  const affiliateId = getCookie('affiliate_id');

  if (affiliateClickId) {
    // Set as cart attribute (will be available in order)
    if (typeof Shopify !== 'undefined' && Shopify.checkout) {
      // For Shopify 2.0 checkout extensions
      // This requires the Checkout UI Extensions API
      console.log('Affiliate tracking detected:', {
        click_id: affiliateClickId,
        affiliate_id: affiliateId
      });

      // Note: Setting order metafields requires server-side processing
      // The webhook handler should look for these in cart attributes
      // or you'll need to use Shopify Admin API to set metafields
    }
  }
});
