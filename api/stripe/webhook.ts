import type { IncomingMessage, ServerResponse } from 'node:http';
import Stripe from 'stripe';
import { getAdminClient, text } from '../_lib';
import { getStripeClient } from '../_stripe';

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    text(res, 405, 'Method not allowed');
    return;
  }

  const signature = req.headers['stripe-signature'];
  if (!signature || Array.isArray(signature)) {
    text(res, 400, 'Missing Stripe signature');
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    text(res, 500, 'Missing STRIPE_WEBHOOK_SECRET');
    return;
  }

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    text(res, 400, error instanceof Error ? error.message : 'Invalid webhook payload');
    return;
  }

  const client = getAdminClient();

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription | Stripe.Checkout.Session;
      const metadataBarberId = 'metadata' in subscription ? subscription.metadata?.barber_id : undefined;
      const customerId = 'customer' in subscription && subscription.customer ? String(subscription.customer) : null;

      let stripeSubscriptionId: string | null = null;
      let stripeSubscriptionItemId: string | null = null;
      let stripeSubscriptionStatus: string | null = null;
      const barberId = metadataBarberId ?? ('client_reference_id' in subscription ? subscription.client_reference_id ?? null : null);

      if (event.type === 'checkout.session.completed') {
        const session = subscription as Stripe.Checkout.Session;
        stripeSubscriptionId = session.subscription ? String(session.subscription) : null;
        stripeSubscriptionStatus = 'active';

        if (stripeSubscriptionId) {
          const fetched = await getStripeClient().subscriptions.retrieve(stripeSubscriptionId);
          stripeSubscriptionStatus = fetched.status;
          stripeSubscriptionItemId = fetched.items.data[0]?.id ?? null;
        }
      } else {
        const stripeSubscription = subscription as Stripe.Subscription;
        stripeSubscriptionId = stripeSubscription.id;
        stripeSubscriptionStatus = stripeSubscription.status;
        stripeSubscriptionItemId = stripeSubscription.items.data[0]?.id ?? null;
      }

      if (barberId) {
        const updatePayload: Record<string, string | null> = {
          stripe_customer_id: customerId,
          stripe_subscription_id: stripeSubscriptionId,
          stripe_subscription_item_id: stripeSubscriptionItemId,
          stripe_subscription_status: stripeSubscriptionStatus,
        };

        const { error } = await client.from('barbers').update(updatePayload).eq('id', barberId);
        if (error) {
          text(res, 500, error.message);
          return;
        }
      }
    }
  } catch (error) {
    text(res, 500, error instanceof Error ? error.message : 'Webhook processing failed');
    return;
  }

  text(res, 200, 'ok');
}
