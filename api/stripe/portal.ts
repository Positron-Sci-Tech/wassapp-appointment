import type { IncomingMessage, ServerResponse } from 'node:http';
import { json, requireBarber } from '../_lib';
import { createStripePortalSession } from '../_stripe';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const barber = await requireBarber(req).catch((error) => {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return null;
  });
  if (!barber) {
    return;
  }

  if (!barber.stripe_customer_id) {
    json(res, 400, { error: 'Stripe customer not connected yet' });
    return;
  }

  try {
    const url = await createStripePortalSession(req, barber.stripe_customer_id);
    json(res, 200, { url });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Failed to create Stripe portal session' });
  }
}
