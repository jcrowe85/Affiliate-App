/**
 * Direct Shopify Admin GraphQL client for admin-side tooling — specifically
 * seeding a creator with free product to film with — that runs without a
 * merchant browser session.
 *
 * Credentials come from the installed affiliate app's OAuth session, which
 * carries the read_products and write_orders scopes this needs. A
 * SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN pair in the environment is
 * honoured as a fallback for local work where no app is installed.
 */

import { prisma } from './db';

const SHOPIFY_API_VERSION = '2025-01';

export class ShopifyAdminError extends Error {
  constructor(message: string, readonly status: number = 500) {
    super(message);
    this.name = 'ShopifyAdminError';
  }
}

export interface ShopifyAdminCredentials {
  domain: string;
  token: string;
  /** Where the credentials came from, for error messages. */
  source: 'app-session' | 'env';
  /** Space/comma separated scope list, when the source reports one. */
  scope: string | null;
}

/**
 * Prefers the installed app's session token over the environment, because the
 * affiliate app is the one granted read_products and write_orders — an env
 * token is likely to be a narrower reporting credential.
 */
export async function resolveShopifyAdminCredentials(
  shopifyShopId: string
): Promise<ShopifyAdminCredentials> {
  const shopDomain = shopifyShopId.endsWith('.myshopify.com')
    ? shopifyShopId
    : `${shopifyShopId}.myshopify.com`;

  const session = await prisma.shopifySession.findFirst({
    where: { shop: shopDomain },
    orderBy: { created_at: 'desc' },
  });

  if (session?.access_token) {
    return {
      domain: session.shop,
      token: session.access_token,
      source: 'app-session',
      scope: session.scope ?? null,
    };
  }

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (domain && token) {
    return { domain, token, source: 'env', scope: null };
  }

  throw new ShopifyAdminError(
    `No Shopify credentials for ${shopDomain}. Install the affiliate app on the store, ` +
      'or set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.',
    503
  );
}

/**
 * Runs an Admin GraphQL operation. Throws ShopifyAdminError on transport
 * errors, GraphQL errors, or a non-empty userErrors array picked out by the
 * caller — Shopify returns 200 with userErrors for most validation failures.
 */
export async function shopifyAdminGraphQL<T>(
  creds: ShopifyAdminCredentials,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const { domain, token } = creds;

  let res: Response;
  try {
    res = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });
  } catch (err: any) {
    throw new ShopifyAdminError(`Could not reach Shopify: ${err.message}`, 502);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new ShopifyAdminError(
      `Shopify returned ${res.status}: ${body.slice(0, 300)}`,
      res.status === 401 || res.status === 403 ? 403 : 502
    );
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };

  if (json.errors?.length) {
    const first = json.errors[0];
    // ACCESS_DENIED means the token is missing a scope — surface that plainly,
    // naming which credential was used so the fix is obvious.
    const isScope = json.errors.some((e) => e.extensions?.code === 'ACCESS_DENIED');
    if (isScope) {
      const using =
        creds.source === 'app-session'
          ? `The installed app's token was used${creds.scope ? ` (scopes: ${creds.scope})` : ''}; reinstall it with read_products and write_orders.`
          : 'A SHOPIFY_ADMIN_ACCESS_TOKEN from the environment was used, which is likely a narrower reporting token. Install the affiliate app on this store, or supply a token with read_products and write_orders.';
      throw new ShopifyAdminError(`Shopify denied access: ${first.message} ${using}`, 403);
    }
    throw new ShopifyAdminError(`Shopify GraphQL error: ${first.message}`, 502);
  }

  if (!json.data) {
    throw new ShopifyAdminError('Shopify returned no data', 502);
  }

  return json.data;
}

export interface ShopifyVariantOption {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  available: boolean;
}

export interface ShopifyProductOption {
  id: string;
  title: string;
  status: string;
  featuredImage: string | null;
  variants: ShopifyVariantOption[];
}

/**
 * Every ACTIVE product with its variants, paged out in full so the picker is
 * not silently truncated to the first page of the catalog.
 */
export async function listActiveProducts(
  creds: ShopifyAdminCredentials
): Promise<ShopifyProductOption[]> {
  const query = `
    query SeedProducts($cursor: String) {
      products(first: 100, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            status
            featuredImage { url }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  availableForSale
                }
              }
            }
          }
        }
      }
    }
  `;

  type Resp = {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{
        node: {
          id: string;
          title: string;
          status: string;
          featuredImage: { url: string } | null;
          variants: {
            edges: Array<{
              node: {
                id: string;
                title: string;
                sku: string | null;
                price: string;
                availableForSale: boolean;
              };
            }>;
          };
        };
      }>;
    };
  };

  const products: ShopifyProductOption[] = [];
  let cursor: string | null = null;

  do {
    const data: Resp = await shopifyAdminGraphQL<Resp>(creds, query, { cursor });
    for (const edge of data.products.edges) {
      const n = edge.node;
      products.push({
        id: n.id,
        title: n.title,
        status: n.status,
        featuredImage: n.featuredImage?.url ?? null,
        variants: n.variants.edges.map((v) => ({
          id: v.node.id,
          title: v.node.title,
          sku: v.node.sku,
          price: v.node.price,
          available: v.node.availableForSale,
        })),
      });
    }
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);

  return products.sort((a, b) => a.title.localeCompare(b.title));
}

export interface SeedOrderLineItem {
  variantId: string;
  quantity: number;
}

export interface SeedOrderInput {
  email: string;
  phone: string | null;
  lineItems: SeedOrderLineItem[];
  shippingAddress: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    provinceCode: string | null;
    zip: string | null;
    countryCode: string;
    phone: string | null;
  };
  currencyCode: string;
  tags: string[];
  note: string;
  /** Whether Shopify emails the recipient an order confirmation. */
  sendReceipt: boolean;
}

export interface CreatedShopifyOrder {
  id: string;
  legacyResourceId: string;
  name: string;
  totalPrice: string;
  currency: string;
  adminUrl: string;
}

export async function createSeedOrder(
  creds: ShopifyAdminCredentials,
  input: SeedOrderInput
): Promise<CreatedShopifyOrder> {
  const mutation = `
    mutation SeedAffiliateOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order {
          id
          legacyResourceId
          name
          currencyCode
          totalPriceSet { shopMoney { amount currencyCode } }
        }
        userErrors { field message }
      }
    }
  `;

  type Resp = {
    orderCreate: {
      order: {
        id: string;
        legacyResourceId: string;
        name: string;
        currencyCode: string;
        totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
      } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  };

  const data = await shopifyAdminGraphQL<Resp>(creds, mutation, {
    order: {
      email: input.email,
      phone: input.phone || undefined,
      lineItems: input.lineItems.map((li) => ({
        variantId: li.variantId,
        quantity: li.quantity,
        // Gifted product: the creator is not charged, so each line is zeroed
        // out rather than discounted, keeping the order total at 0.
        priceSet: {
          shopMoney: { amount: '0.00', currencyCode: input.currencyCode },
        },
      })),
      shippingAddress: input.shippingAddress,
      billingAddress: input.shippingAddress,
      // ref=internal is what app/api/webhooks/orders checks to keep an order
      // out of affiliate attribution. A gift must never earn its recipient a
      // commission, so it is marked internal at the source.
      customAttributes: [{ key: 'ref', value: 'internal' }],
      tags: input.tags,
      note: input.note,
      // A zero-value order is settled on creation; leaving it pending would
      // park it in the unpaid queue and block fulfilment.
      financialStatus: 'PAID',
      currency: input.currencyCode,
    },
    options: {
      // Real product leaves the warehouse, so stock must come down with it.
      inventoryBehaviour: 'DECREMENT_OBEYING_POLICY',
      sendReceipt: input.sendReceipt,
      // Creators need the tracking email to know the product is on its way.
      sendFulfillmentReceipt: true,
    },
  });

  const { order, userErrors } = data.orderCreate;

  if (userErrors?.length) {
    throw new ShopifyAdminError(
      `Shopify rejected the order: ${userErrors
        .map((e) => `${e.field?.join('.') ?? 'order'}: ${e.message}`)
        .join('; ')}`,
      422
    );
  }

  if (!order) {
    throw new ShopifyAdminError('Shopify did not return the created order', 502);
  }

  return {
    id: order.id,
    legacyResourceId: order.legacyResourceId,
    name: order.name,
    totalPrice: order.totalPriceSet.shopMoney.amount,
    currency: order.totalPriceSet.shopMoney.currencyCode,
    adminUrl: `https://${creds.domain}/admin/orders/${order.legacyResourceId}`,
  };
}
