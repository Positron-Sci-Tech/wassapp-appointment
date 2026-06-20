import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { DashboardProfile, DashboardProfileInput } from '../../src/shared/types';
import { asSlug, getAdminClient, json, readJsonBody, requireRole, requireSalonId } from '../_lib';

const profileSchema = z.object({
  display_name: z.string().min(1),
  slug: z.string().nullable(),
  allow_multi_service_selection: z.boolean(),
  billing_percent: z.number().min(0),
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
    const { data, error } = await client.from('salons').select('*').eq('id', salonId).maybeSingle();
    if (error) {
      json(res, 500, { error: error.message });
      return;
    }
    if (!data) {
      json(res, 404, { error: 'Salon not found' });
      return;
    }
    json(res, 200, data as DashboardProfile);
    return;
  }

  if (req.method !== 'PUT') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (context.appUser.role !== 'salon') {
    json(res, 403, { error: 'Only salon users can edit profile' });
    return;
  }

  const body = await readJsonBody<DashboardProfileInput>(req as IncomingMessage & { body?: unknown });
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    json(res, 400, { error: parsed.error.flatten() });
    return;
  }

  const normalizedSlug = parsed.data.slug ? asSlug(parsed.data.slug) : null;
  if (parsed.data.slug && !normalizedSlug) {
    json(res, 400, { error: 'Invalid slug' });
    return;
  }

  const updateResult = await client
    .from('salons')
    .update({
      display_name: parsed.data.display_name,
      slug: normalizedSlug,
      allow_multi_service_selection: parsed.data.allow_multi_service_selection,
      billing_percent: parsed.data.billing_percent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', salonId)
    .select('*')
    .single();

  if (updateResult.error) {
    json(res, 500, { error: updateResult.error.message });
    return;
  }

  json(res, 200, updateResult.data as DashboardProfile);
}
