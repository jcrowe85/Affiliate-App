import paypal from '@paypal/payouts-sdk';

// Initialize PayPal environment based on mode
const getPayPalEnvironment = () => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE || 'sandbox';

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env');
  }

  if (mode === 'live') {
    return new paypal.core.LiveEnvironment(clientId, clientSecret);
  } else {
    return new paypal.core.SandboxEnvironment(clientId, clientSecret);
  }
};

const environment = getPayPalEnvironment();
export const paypalClient = new paypal.core.PayPalHttpClient(environment);

export interface PayPalPayoutItem {
  recipient_type: 'EMAIL';
  amount: {
    value: string;
    currency: string;
  };
  receiver: string; // PayPal email
  note?: string;
  sender_item_id?: string; // Commission ID or order number
}

export interface PayPalPayoutBatch {
  sender_batch_id: string; // Unique batch ID
  email_subject: string;
  email_message: string;
  items: PayPalPayoutItem[];
}

/**
 * Test PayPal API connection by getting an access token
 */
export async function testPayPalConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const mode = process.env.PAYPAL_MODE || 'sandbox';
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('PayPal credentials not found in environment variables');
    }

    // Verify environment is set up correctly
    const testEnv = mode === 'live'
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);
    
    const testClient = new paypal.core.PayPalHttpClient(testEnv);
    
    return {
      success: true,
      message: 'PayPal API credentials configured correctly!',
      details: {
        mode: mode,
        environment: mode === 'live' ? 'Live (Production)' : 'Sandbox (Testing)',
        client_id_length: clientId.length,
        client_secret_length: clientSecret.length,
        note: 'Credentials are valid. You can now test payouts.',
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `PayPal API connection failed: ${error.message}`,
      details: {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    };
  }
}

/**
 * Create a PayPal payout batch
 */
export async function createPayPalPayout(
  items: PayPalPayoutItem[],
  batchId: string,
  emailSubject: string = 'Your Affiliate Commission Payment',
  emailMessage: string = 'You have received a commission payment from Fleur & Blossom.'
): Promise<{ batch_id: string; batch_status: string }> {
  const request = new paypal.payouts.PayoutsPostRequest();
  request.requestBody({
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: emailSubject,
      email_message: emailMessage,
    },
    items: items,
  });

  try {
    const response = await paypalClient.execute(request);
    
    if (response.statusCode !== 201) {
      const errorDetails = response.result || {};
      const errorMessage = errorDetails.message || JSON.stringify(errorDetails);
      
      // Create a more descriptive error with status code
      const error = new Error(`PayPal API error: ${response.statusCode} - ${errorMessage}`);
      (error as any).statusCode = response.statusCode;
      (error as any).paypalError = errorDetails;
      throw error;
    }

    return {
      batch_id: response.result.batch_header?.payout_batch_id || '',
      batch_status: response.result.batch_header?.batch_status || 'PENDING',
    };
  } catch (error: any) {
    // Re-throw if it's already our formatted error
    if (error.statusCode) {
      throw error;
    }
    
    // Handle PayPal SDK errors
    if (error.statusCode) {
      const errorDetails = error.result || error;
      const errorMessage = errorDetails.message || JSON.stringify(errorDetails);
      const formattedError = new Error(`PayPal API error: ${error.statusCode} - ${errorMessage}`);
      (formattedError as any).statusCode = error.statusCode;
      (formattedError as any).paypalError = errorDetails;
      throw formattedError;
    }
    
    // Re-throw other errors as-is
    throw error;
  }
}

/**
 * Get payout batch status
 */
export async function getPayPalPayoutStatus(batchId: string) {
  const request = new paypal.payouts.PayoutsGetRequest(batchId);
  const response = await paypalClient.execute(request);
  return response.result;
}
