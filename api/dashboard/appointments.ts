import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Appointment } from '../../src/shared/types';
import { getAdminClient, json, requireBarber } from '../_lib';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const barber = await requireBarber(req).catch((error) => {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return null;
  });
  if (!barber) {
    return;
  }

  const client = getAdminClient();
  const { data, error } = await client
    .from('appointments')
    .select('*')
    .eq('barber_id', barber.id)
    .order('start_at', { ascending: false });

  if (error) {
    json(res, 500, { error: error.message });
    return;
  }

  json(res, 200, (data ?? []) as Appointment[]);
}
