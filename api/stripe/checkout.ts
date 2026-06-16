import type { IncomingMessage, ServerResponse } from 'node:http';
import { json, requireBarber, requireUser } from '../_lib';
import { createStripeCheckoutSession } from '../_stripe';

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

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(req);
  } catch (error) {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return;
  }

  try {
    const url = await createStripeCheckoutSession(req, barber, user.email ?? null);
    json(res, 200, { url });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Failed to create Stripe checkout session' });
  }
}
