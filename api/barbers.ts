import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Barber } from '../src/shared/types';
import { getAdminClient, getQueryValue, json } from './_lib';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const salonSlug = getQueryValue(req, 'salonSlug');
  if (!salonSlug) {
    json(res, 400, { error: 'Missing salonSlug' });
    return;
  }

  const client = getAdminClient();
  const salonResult = await client.from('salons').select('id').eq('slug', salonSlug).maybeSingle();
  if (salonResult.error) {
    json(res, 500, { error: salonResult.error.message });
    return;
  }
  if (!salonResult.data) {
    json(res, 404, { error: 'Salon not found' });
    return;
  }

  const { data, error } = await client
    .from('barbers')
    .select('id, salon_id, owner_user_id, slug, display_name, thumbnail_url, timezone, active')
    .eq('salon_id', (salonResult.data as { id: string }).id)
    .eq('active', true)
    .order('display_name', { ascending: true });

  if (error) {
    json(res, 500, { error: error.message });
    return;
  }

  json(res, 200, (data ?? []) as Barber[]);
}
