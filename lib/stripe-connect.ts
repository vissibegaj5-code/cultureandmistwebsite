import { env } from 'cloudflare:workers';

const stripeApiVersion = '2026-08-26.dahlia';
const stripeApiBase = 'https://api.stripe.com';

type StripeErrorBody = {
  error?: { message?: string; code?: string };
};

export class StripeApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'StripeApiError';
  }
}

export type StripeAccount = {
  id: string;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: string };
        };
      };
    };
  };
  requirements?: { currently_due?: string[] };
};

function secretKey(): string {
  const key = env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) {
    throw new Error('A Stripe sandbox secret key is required.');
  }
  return key;
}

async function stripeResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as StripeErrorBody & T;
  if (!response.ok) {
    throw new StripeApiError(
      response.status,
      body.error?.code || 'stripe_request_failed',
      body.error?.message || 'Stripe request failed.',
    );
  }
  return body as T;
}

export async function createStripeAccount(
  email: string,
  displayName: string,
  sellerId: string,
): Promise<StripeAccount> {
  const response = await fetch(`${stripeApiBase}/v2/core/accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `seller-${encodeURIComponent(sellerId).slice(0, 180)}`,
      'Stripe-Version': stripeApiVersion,
    },
    body: JSON.stringify({
      contact_email: email,
      display_name: displayName,
      identity: { country: 'us', entity_type: 'individual' },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: { stripe_transfers: { requested: true } },
          },
        },
      },
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      dashboard: 'express',
      include: ['configuration.recipient', 'requirements'],
    }),
  });
  return stripeResponse<StripeAccount>(response);
}

export async function createStripeOnboardingLink(
  accountId: string,
  origin: string,
): Promise<string> {
  const response = await fetch(`${stripeApiBase}/v2/core/account_links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
      'Stripe-Version': stripeApiVersion,
    },
    body: JSON.stringify({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: `${origin}/api/connect/refresh`,
          return_url: `${origin}/?connect=return`,
        },
      },
    }),
  });
  const link = await stripeResponse<{ url: string }>(response);
  return link.url;
}

export async function retrieveStripeAccount(accountId: string): Promise<StripeAccount> {
  const query = new URLSearchParams();
  query.set('include[0]', 'configuration.recipient');
  query.set('include[1]', 'requirements');
  const response = await fetch(
    `${stripeApiBase}/v2/core/accounts/${encodeURIComponent(accountId)}?${query}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Stripe-Version': stripeApiVersion,
      },
    },
  );
  return stripeResponse<StripeAccount>(response);
}

export async function createCheckoutSession(
  values: URLSearchParams,
  orderId: string,
): Promise<{ id: string; url: string }> {
  const response = await fetch(`${stripeApiBase}/v1/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `checkout-${orderId}`,
      'Stripe-Version': stripeApiVersion,
    },
    body: values,
  });
  return stripeResponse<{ id: string; url: string }>(response);
}

export async function expireCheckoutSession(sessionId: string): Promise<void> {
  const response = await fetch(
    `${stripeApiBase}/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Stripe-Version': stripeApiVersion,
      },
    },
  );
  await stripeResponse(response);
}

function equalSignatures(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyStripeSignature(
  payload: Uint8Array,
  header: string | null,
): Promise<boolean> {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret === 'whsec_replace_me' || !header) return false;

  const parts = header.split(',').map((part) => part.split('=', 2));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${timestamp}.`);
  const signedPayload = new Uint8Array(prefix.length + payload.length);
  signedPayload.set(prefix);
  signedPayload.set(payload, prefix.length);

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, signedPayload));
  const expected = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((signature) => equalSignatures(signature, expected));
}