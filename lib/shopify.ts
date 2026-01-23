import '@shopify/shopify-api/adapters/node';
import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import { prisma } from './db';

// Initialize Shopify API
export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: (process.env.SHOPIFY_SCOPES || 'read_products,write_orders,read_orders').split(','),
  hostName: process.env.SHOPIFY_APP_URL!.replace(/https?:\/\//, ''),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
});

// Session storage using Prisma
export const sessionStorage = {
  async storeSession(session: Session): Promise<boolean> {
    try {
      await prisma.shopifySession.upsert({
        where: { id: session.id },
        create: {
          id: session.id,
          shop: session.shop,
          state: session.state || null,
          is_online: session.isOnline,
          scope: session.scope || null,
          expires: session.expires || null,
          access_token: session.accessToken || null,
        },
        update: {
          state: session.state || null,
          is_online: session.isOnline,
          scope: session.scope || null,
          expires: session.expires || null,
          access_token: session.accessToken || null,
        },
      });
      return true;
    } catch (error) {
      console.error('Error storing session:', error);
      return false;
    }
  },

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const result = await prisma.shopifySession.findUnique({
        where: { id },
      });

      if (!result) return undefined;

      return new Session({
        id: result.id,
        shop: result.shop,
        state: result.state ?? '',
        isOnline: result.is_online,
        scope: result.scope ?? undefined,
        expires: result.expires ?? undefined,
        accessToken: result.access_token ?? undefined,
      });
    } catch (error) {
      console.error('Error loading session:', error);
      return undefined;
    }
  },

  async deleteSession(id: string): Promise<boolean> {
    try {
      await prisma.shopifySession.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      return false;
    }
  },

  async deleteSessions(ids: string[]): Promise<boolean> {
    try {
      await prisma.shopifySession.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      });
      return true;
    } catch (error) {
      console.error('Error deleting sessions:', error);
      return false;
    }
  },
};

// Helper to get shop domain from request
export function getShopDomain(host: string): string {
  return host.split('.')[0];
}