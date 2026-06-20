import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAdminClient, getQueryValue, json } from './_lib';
import { buildSlotsForDate } from './_slots';
import type { Service } from '../src/shared/types';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const barberId = getQueryValue(req, 'barberId');
  const serviceId = getQueryValue(req, 'serviceId');
  const serviceIdsValue = getQueryValue(req, 'serviceIds');
  const date = getQueryValue(req, 'date');

  if (!barberId || (!serviceId && !serviceIdsValue) || !date) {
    json(res, 400, { error: 'Missing barberId, serviceId/serviceIds, or date' });
    return;
  }

  const serviceIds = (serviceIdsValue ?? serviceId ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!serviceIds.length) {
    json(res, 400, { error: 'No services selected' });
    return;
  }

  const client = getAdminClient();
  const [barberResult, servicesResult, assignmentsResult] = await Promise.all([
    client.from('barbers').select('id,salon_id,active').eq('id', barberId).maybeSingle(),
    client.from('services').select('*').in('id', serviceIds).eq('active', true),
    client.from('employee_services').select('service_id').eq('barber_id', barberId),
  ]);

  if (barberResult.error) {
    json(res, 500, { error: barberResult.error.message });
    return;
  }
  if (!barberResult.data || !(barberResult.data as { active: boolean }).active) {
    json(res, 404, { error: 'Barber not found' });
    return;
  }

  if (servicesResult.error) {
    json(res, 500, { error: servicesResult.error.message });
    return;
  }
  if (assignmentsResult.error) {
    json(res, 500, { error: assignmentsResult.error.message });
    return;
  }

  const services = (servicesResult.data ?? []) as Service[];
  if (services.length !== serviceIds.length) {
    json(res, 404, { error: 'One or more services were not found' });
    return;
  }

  const salonId = (barberResult.data as { salon_id: string }).salon_id;
  if (services.some((service) => service.salon_id !== salonId)) {
    json(res, 400, { error: 'Selected services do not belong to this salon' });
    return;
  }

  const assignedServiceIds = new Set((assignmentsResult.data ?? []).map((item) => (item as { service_id: string }).service_id));
  if (!serviceIds.every((id) => assignedServiceIds.has(id))) {
    json(res, 400, { error: 'Selected barber does not offer all selected services' });
    return;
  }

  const blockMinutes = services.reduce((sum, service) => sum + service.duration_minutes + service.buffer_minutes, 0);
  if (blockMinutes <= 0) {
    json(res, 400, { error: 'Invalid service duration' });
    return;
  }

  const slots = await buildSlotsForDate(client, barberId, blockMinutes, date);
  json(res, 200, slots);
}
