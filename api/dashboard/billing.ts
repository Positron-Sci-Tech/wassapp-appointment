import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppointmentStatusSummary, Service } from '../../src/shared/types';
import { getAdminClient, json, requireRole, requireSalonId } from '../_lib';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let context: Awaited<ReturnType<typeof requireRole>>;
  try {
    context = await requireRole(req, ['administrator', 'salon', 'employee']);
  } catch (error) {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return;
  }

  const client = getAdminClient();
  const salonId =
    context.appUser.role === 'administrator'
      ? null
      : requireSalonId(context.appUser);

  const [appointmentsResult, servicesResult, salonResult] = await Promise.all([
    salonId
      ? client.from('appointments').select('service_id,status').eq('salon_id', salonId)
      : client.from('appointments').select('service_id,status'),
    salonId ? client.from('services').select('id,price_cents').eq('salon_id', salonId) : client.from('services').select('id,price_cents'),
    salonId ? client.from('salons').select('billing_unit_amount_cents').eq('id', salonId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  if (appointmentsResult.error) {
    json(res, 500, { error: appointmentsResult.error.message });
    return;
  }
  if (servicesResult.error) {
    json(res, 500, { error: servicesResult.error.message });
    return;
  }
  if (salonResult.error) {
    json(res, 500, { error: salonResult.error.message });
    return;
  }

  const serviceMap = new Map((servicesResult.data ?? []).map((service) => [(service as Service).id, (service as Service).price_cents]));
  const appointments = appointmentsResult.data ?? [];
  const unitAmountCents = Number((salonResult.data as { billing_unit_amount_cents?: number } | null)?.billing_unit_amount_cents ?? 25);
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
