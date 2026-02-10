declare module '@paypal/payouts-sdk' {
  export class PayoutsPostRequest {
    requestBody(body: any): PayoutsPostRequest;
  }

  export class PayoutsItemGetRequest {
    payoutItemId(payoutItemId: string): PayoutsItemGetRequest;
  }

  export class PayoutsGetRequest {
    constructor(batchId?: string);
    page(page: number): PayoutsGetRequest;
    pageSize(pageSize: number): PayoutsGetRequest;
    totalRequired(totalRequired: boolean): PayoutsGetRequest;
  }

  export class LiveEnvironment {
    constructor(clientId: string, clientSecret: string);
  }

  export class SandboxEnvironment {
    constructor(clientId: string, clientSecret: string);
  }

  export class PayPalHttpClient {
    constructor(environment: LiveEnvironment | SandboxEnvironment);
    execute<T = any>(request: any): Promise<{
      statusCode: number;
      result: T;
    }>;
  }

  export const core: {
    LiveEnvironment: typeof LiveEnvironment;
    SandboxEnvironment: typeof SandboxEnvironment;
    PayPalHttpClient: typeof PayPalHttpClient;
  };

  export const payouts: {
    PayoutsPostRequest: typeof PayoutsPostRequest;
    PayoutsItemGetRequest: typeof PayoutsItemGetRequest;
    PayoutsGetRequest: typeof PayoutsGetRequest;
  };

  const paypal: {
    core: typeof core;
    payouts: typeof payouts;
  };

  export default paypal;
}
