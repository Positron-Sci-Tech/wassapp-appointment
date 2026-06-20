import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAdminClient, json, requireAppUser } from '../_lib';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const context = await requireAppUser(req);
    const client = getAdminClient();

    const [salonResult, barberResult] = await Promise.all([
      context.appUser.salon_id ? client.from('salons').select('*').eq('id', context.appUser.salon_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      context.appUser.barber_id ? client.from('barbers').select('*').eq('id', context.appUser.barber_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);

    if (salonResult.error) {
      json(res, 500, { error: salonResult.error.message });
      return;
    }
    if (barberResult.error) {
      json(res, 500, { error: barberResult.error.message });
      return;
    }

    json(res, 200, {
      appUser: context.appUser,
      salon: salonResult.data,
      barber: barberResult.data,
    });
  } catch (error) {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
  }
}
