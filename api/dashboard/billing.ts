import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppointmentStatusSummary, Service } from '../../src/shared/types';
import { getAdminClient, json, requireBarber } from '../_lib';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const barber = await requireBarber(req).catch((error) => {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return null;
  });
  if (!barber) {
    return;
  }

  const client = getAdminClient();
  const [appointmentsResult, servicesResult] = await Promise.all([
    client.from('appointments').select('service_id,status').eq('barber_id', barber.id),
    client.from('services').select('id,price_cents').eq('barber_id', barber.id),
  ]);

  if (appointmentsResult.error) {
    json(res, 500, { error: appointmentsResult.error.message });
    return;
  }
  if (servicesResult.error) {
    json(res, 500, { error: servicesResult.error.message });
    return;
  }

  const serviceMap = new Map((servicesResult.data ?? []).map((service) => [(service as Service).id, (service as Service).price_cents]));
  const appointments = appointmentsResult.data ?? [];
  const unitAmountCents = Number(barber.billing_unit_amount_cents ?? 25);
  const revenueCents = appointments.reduce((sum, appointment) => {
    if ((appointment as { status: string }).status !== 'confirmed') {
      return sum;
    }
    return sum + (serviceMap.get((appointment as { service_id: string }).service_id) ?? 0);
  }, 0);

  const dueCents = appointments.filter((appointment) => (appointment as { status: string }).status === 'confirmed').length * unitAmountCents;

  const summary: AppointmentStatusSummary = {
    total: appointments.length,
    confirmed: appointments.filter((appointment) => (appointment as { status: string }).status === 'confirmed').length,
    cancelled: appointments.filter((appointment) => (appointment as { status: string }).status === 'cancelled').length,
    revenue_cents: revenueCents,
    due_cents: dueCents,
    unit_amount_cents: unitAmountCents,
  };

  json(res, 200, summary);
}
