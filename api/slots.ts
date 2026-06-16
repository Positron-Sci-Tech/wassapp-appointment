import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAdminClient, getQueryValue, json } from './_lib';
import { buildSlotsForDate } from './_slots';
import type { Service } from '../src/shared/types';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const barberId = getQueryValue(req, 'barberId');
  const serviceId = getQueryValue(req, 'serviceId');
  const date = getQueryValue(req, 'date');

  if (!barberId || !serviceId || !date) {
    json(res, 400, { error: 'Missing barberId, serviceId, or date' });
    return;
  }

  const client = getAdminClient();
  const { data, error } = await client.from('services').select('*').eq('id', serviceId).eq('barber_id', barberId).maybeSingle();
  if (error) {
    json(res, 500, { error: error.message });
    return;
  }

  if (!data) {
    json(res, 404, { error: 'Service not found' });
    return;
  }

  const slots = await buildSlotsForDate(client, barberId, data as Service, date);
  json(res, 200, slots);
}
