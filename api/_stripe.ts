import Stripe from 'stripe';
import type { IncomingMessage } from 'node:http';
import type { Barber } from '../src/shared/types';
import { getBaseUrl } from './_lib';

let stripeClient: Stripe | null = null;

function requireStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
  return key;
}

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireStripeKey());
  }

  return stripeClient;
}

export function getStripePriceId(): string {
  const priceId = process.env.STRIPE_BILLING_PRICE_ID;
  if (!priceId) {
    throw new Error('Missing STRIPE_BILLING_PRICE_ID');
  }
  return priceId;
}

export function getStripeUnitAmountCents(): number {
  const value = Number(process.env.STRIPE_UNIT_AMOUNT_CENTS ?? 25);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 25;
}

export async function createStripeCheckoutSession(req: IncomingMessage, barber: Barber, customerEmail?: string | null): Promise<string> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      {
        price: getStripePriceId(),
        quantity: 1,
      },
    ],
    customer_email: customerEmail ?? undefined,
    success_url: `${getBaseUrl(req)}/dashboard?stripe=success`,
    cancel_url: `${getBaseUrl(req)}/dashboard?stripe=cancelled`,
    client_reference_id: barber.id,
    subscription_data: {
      metadata: {
        barber_id: barber.id,
      },
    },
    metadata: {
      barber_id: barber.id,
    },
  });

  if (!session.url) {
    throw new Error('Stripe checkout session did not return a URL');
  }

  return session.url;
}

export async function createStripePortalSession(req: IncomingMessage, customerId: string): Promise<string> {
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getBaseUrl(req)}/dashboard`,
  });

  return session.url;
}

export async function recordStripeUsage(subscriptionItemId: string, appointmentId: string): Promise<void> {
  const apiKey = requireStripeKey();
  const body = new URLSearchParams({
    quantity: '1',
    timestamp: String(Math.floor(Date.now() / 1000)),
    action: 'increment',
  });

  const response = await fetch(`https://api.stripe.com/v1/subscription_items/${subscriptionItemId}/usage_records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': appointmentId,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}
