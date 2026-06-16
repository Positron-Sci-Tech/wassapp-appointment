import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Service } from '../src/shared/types';
import { getAdminClient, getQueryValue, json } from './_lib';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const barberId = getQueryValue(req, 'barberId');
  if (!barberId) {
    json(res, 400, { error: 'Missing barberId' });
    return;
  }

  const client = getAdminClient();
  const { data, error } = await client.from('services').select('*').eq('barber_id', barberId).order('created_at', { ascending: true });

  if (error) {
    json(res, 500, { error: error.message });
    return;
  }

  json(res, 200, (data ?? []) as Service[]);
}
