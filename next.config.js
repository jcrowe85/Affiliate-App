/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET,
    SHOPIFY_SCOPES: process.env.SHOPIFY_SCOPES || 'read_products,write_orders,read_orders,write_metaobjects,read_metaobjects',
    SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    MAGIC_LINK_SECRET: process.env.MAGIC_LINK_SECRET,
  },
  // Required for Shopify embedded app
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;