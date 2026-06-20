import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Barber, Salon, Service, ServiceCategory } from '../src/shared/types';
import { getAdminClient, getQueryValue, json } from './_lib';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const salonSlug = getQueryValue(req, 'salonSlug');
  if (!salonSlug) {
    json(res, 400, { error: 'Missing salonSlug' });
    return;
  }

  const client = getAdminClient();
  const salonResult = await client.from('salons').select('*').eq('slug', salonSlug).maybeSingle();
  if (salonResult.error) {
    json(res, 500, { error: salonResult.error.message });
    return;
  }
  if (!salonResult.data) {
    json(res, 404, { error: 'Salon not found' });
    return;
  }

  const salon = salonResult.data as Salon;
  const [barbersResult, servicesResult, categoriesResult, assignmentsResult] = await Promise.all([
    client.from('barbers').select('*').eq('salon_id', salon.id).eq('active', true).order('display_name', { ascending: true }),
    client.from('services').select('*').eq('salon_id', salon.id).eq('active', true).order('created_at', { ascending: true }),
    client.from('service_categories').select('*').eq('salon_id', salon.id).order('sort_order', { ascending: true }),
    client.from('employee_services').select('barber_id,service_id'),
  ]);

  if (barbersResult.error) {
    json(res, 500, { error: barbersResult.error.message });
    return;
  }
  if (servicesResult.error) {
    json(res, 500, { error: servicesResult.error.message });
    return;
  }
  if (categoriesResult.error) {
    json(res, 500, { error: categoriesResult.error.message });
    return;
  }
  if (assignmentsResult.error) {
    json(res, 500, { error: assignmentsResult.error.message });
    return;
  }

  const serviceIdsByBarber = new Map<string, string[]>();
  for (const assignment of assignmentsResult.data ?? []) {
    const barberId = (assignment as { barber_id: string }).barber_id;
    const serviceId = (assignment as { service_id: string }).service_id;
    const values = serviceIdsByBarber.get(barberId) ?? [];
    values.push(serviceId);
    serviceIdsByBarber.set(barberId, values);
  }

  json(res, 200, {
    salon,
    barbers: (barbersResult.data ?? []) as Barber[],
    services: (servicesResult.data ?? []) as Service[],
    categories: (categoriesResult.data ?? []) as ServiceCategory[],
    serviceIdsByBarber: Object.fromEntries(serviceIdsByBarber),
  });
}
