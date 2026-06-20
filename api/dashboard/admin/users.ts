import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { AppUser } from '../../../src/shared/types';
import { getAdminClient, json, readJsonBody, requireRole } from '../../_lib';

const updateUserSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['administrator', 'salon', 'employee']),
  salon_id: z.string().uuid().nullable(),
  barber_id: z.string().uuid().nullable(),
  display_name: z.string().nullable(),
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await requireRole(req, ['administrator']);
  } catch (error) {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return;
  }

  const client = getAdminClient();

  if (req.method === 'GET') {
    const { data, error } = await client.from('app_users').select('*').order('created_at', { ascending: false });
    if (error) {
      json(res, 500, { error: error.message });
      return;
    }
    json(res, 200, (data ?? []) as AppUser[]);
    return;
  }

  if (req.method === 'PUT') {
    const body = await readJsonBody<unknown>(req as IncomingMessage & { body?: unknown });
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { error: parsed.error.flatten() });
      return;
    }

    const updateResult = await client
      .from('app_users')
      .update({
        role: parsed.data.role,
        salon_id: parsed.data.salon_id,
        barber_id: parsed.data.barber_id,
        display_name: parsed.data.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.id)
      .select('*')
      .single();
    if (updateResult.error) {
      json(res, 500, { error: updateResult.error.message });
      return;
    }

    json(res, 200, updateResult.data as AppUser);
    return;
  }

  if (req.method === 'DELETE') {
    const body = await readJsonBody<{ id: string }>(req as IncomingMessage & { body?: unknown });
    if (!body.id) {
      json(res, 400, { error: 'Missing id' });
      return;
    }

    const deleteResult = await client.from('app_users').delete().eq('id', body.id);
    if (deleteResult.error) {
      json(res, 500, { error: deleteResult.error.message });
      return;
    }

    json(res, 200, { status: 'deleted' });
    return;
  }

  json(res, 405, { error: 'Method not allowed' });
}
