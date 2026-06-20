import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { ServiceCategory } from '../../src/shared/types';
import { getAdminClient, json, readJsonBody, requireRole, requireSalonId } from '../_lib';

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  sort_order: z.number().int().min(0).default(0),
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let context: Awaited<ReturnType<typeof requireRole>>;
  try {
    context = await requireRole(req, ['salon', 'employee']);
  } catch (error) {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return;
  }

  const salonId = requireSalonId(context.appUser);
  const client = getAdminClient();

  if (req.method === 'GET') {
    const { data, error } = await client.from('service_categories').select('*').eq('salon_id', salonId).order('sort_order', { ascending: true });
    if (error) {
      json(res, 500, { error: error.message });
      return;
    }
    json(res, 200, (data ?? []) as ServiceCategory[]);
    return;
  }

  if (context.appUser.role !== 'salon') {
    json(res, 403, { error: 'Only salon users can modify categories' });
    return;
  }

  if (req.method === 'POST') {
    const body = await readJsonBody<unknown>(req as IncomingMessage & { body?: unknown });
    const parsed = categorySchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { error: parsed.error.flatten() });
      return;
    }

    const payload = {
      salon_id: salonId,
      name: parsed.data.name,
      sort_order: parsed.data.sort_order,
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.id) {
      const updateResult = await client.from('service_categories').update(payload).eq('id', parsed.data.id).eq('salon_id', salonId).select('*').single();
      if (updateResult.error) {
        json(res, 500, { error: updateResult.error.message });
        return;
      }
      json(res, 200, updateResult.data as ServiceCategory);
      return;
    }

    const insertResult = await client.from('service_categories').insert(payload).select('*').single();
    if (insertResult.error) {
      json(res, 500, { error: insertResult.error.message });
      return;
    }
    json(res, 200, insertResult.data as ServiceCategory);
    return;
  }

  if (req.method === 'DELETE') {
    const body = await readJsonBody<{ id: string }>(req as IncomingMessage & { body?: unknown });
    if (!body.id) {
      json(res, 400, { error: 'Missing id' });
      return;
    }

    const [serviceUpdateResult, deleteResult] = await Promise.all([
      client.from('services').update({ category_id: null }).eq('category_id', body.id).eq('salon_id', salonId),
      client.from('service_categories').delete().eq('id', body.id).eq('salon_id', salonId),
    ]);
    if (serviceUpdateResult.error) {
      json(res, 500, { error: serviceUpdateResult.error.message });
      return;
    }
    if (deleteResult.error) {
      json(res, 500, { error: deleteResult.error.message });
      return;
    }

    json(res, 200, { status: 'deleted' });
    return;
  }

  json(res, 405, { error: 'Method not allowed' });
}
