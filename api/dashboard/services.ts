import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Service } from '../../src/shared/types';
import { getAdminClient, json, readJsonBody, requireBarber } from '../_lib';

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  duration_minutes: z.number().int().positive(),
  price_cents: z.number().int().min(0),
  buffer_minutes: z.number().int().min(0),
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const barber = await requireBarber(req).catch((error) => {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return null;
  });
  if (!barber) {
    return;
  }

  const client = getAdminClient();

  if (req.method === 'GET') {
    const { data, error } = await client.from('services').select('*').eq('barber_id', barber.id).order('created_at', { ascending: true });
    if (error) {
      json(res, 500, { error: error.message });
      return;
    }
    json(res, 200, (data ?? []) as Service[]);
    return;
  }

  if (req.method === 'POST') {
    const body = await readJsonBody<unknown>(req as IncomingMessage & { body?: unknown });
    const parsed = serviceSchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { error: parsed.error.flatten() });
      return;
    }

    const insertResult = await client
      .from('services')
      .insert({
        barber_id: barber.id,
        ...parsed.data,
      })
      .select('*')
      .single();

    if (insertResult.error) {
      json(res, 500, { error: insertResult.error.message });
      return;
    }

    json(res, 200, insertResult.data as Service);
    return;
  }

  if (req.method === 'DELETE') {
    const body = await readJsonBody<{ id: string }>(req as IncomingMessage & { body?: unknown });
    if (!body.id) {
      json(res, 400, { error: 'Missing id' });
      return;
    }

    const deleteResult = await client.from('services').delete().eq('id', body.id).eq('barber_id', barber.id);
    if (deleteResult.error) {
      json(res, 500, { error: deleteResult.error.message });
      return;
    }

    json(res, 200, { status: 'deleted' });
    return;
  }

  json(res, 405, { error: 'Method not allowed' });
}
