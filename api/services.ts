import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Service } from '../src/shared/types';
import { getAdminClient, getQueryValue, json } from './_lib';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const salonSlug = getQueryValue(req, 'salonSlug');
  const barberId = getQueryValue(req, 'barberId');
  if (!salonSlug || !barberId) {
    json(res, 400, { error: 'Missing salonSlug or barberId' });
    return;
  }

  const client = getAdminClient();
  const [salonResult, assignmentsResult] = await Promise.all([
    client.from('salons').select('id,allow_multi_service_selection').eq('slug', salonSlug).maybeSingle(),
    client.from('employee_services').select('service_id').eq('barber_id', barberId),
  ]);

  if (salonResult.error) {
    json(res, 500, { error: salonResult.error.message });
    return;
  }
  if (!salonResult.data) {
    json(res, 404, { error: 'Salon not found' });
    return;
  }
  if (assignmentsResult.error) {
    json(res, 500, { error: assignmentsResult.error.message });
    return;
  }

  const assignedServiceIds = (assignmentsResult.data ?? []).map((item) => (item as { service_id: string }).service_id);
  if (!assignedServiceIds.length) {
    json(res, 200, []);
    return;
  }

  const { data, error } = await client
    .from('services')
    .select('*')
    .eq('salon_id', (salonResult.data as { id: string }).id)
    .in('id', assignedServiceIds)
    .order('created_at', { ascending: true });

  if (error) {
    json(res, 500, { error: error.message });
    return;
  }

  json(res, 200, (data ?? []) as Service[]);
}
