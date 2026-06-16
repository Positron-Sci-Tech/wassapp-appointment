import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Appointment, Service } from '../src/shared/types';
import { cancelCalendarEvent, sendWhatsappMessage } from './_integrations';
import { getAdminClient, getBaseUrl, getQueryValue, json, readJsonBody } from './_lib';
import { z } from 'zod';

const cancelSchema = z.object({
  token: z.string().min(8),
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = getQueryValue(req, 'token');
  const client = getAdminClient();

  if (req.method === 'GET') {
    if (!token) {
      json(res, 400, { error: 'Missing token' });
      return;
    }

    const { data, error } = await client
      .from('appointments')
      .select('*')
      .eq('cancellation_token', token)
      .maybeSingle();

    if (error) {
      json(res, 500, { error: error.message });
      return;
    }
    if (!data) {
      json(res, 404, { error: 'Appointment not found' });
      return;
    }

    json(res, 200, data as Appointment);
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody<{ token: string }>(req as IncomingMessage & { body?: unknown });
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    json(res, 400, { error: parsed.error.flatten() });
    return;
  }

  const appointmentResult = await client
    .from('appointments')
    .select('*')
    .eq('cancellation_token', parsed.data.token)
    .maybeSingle();

  if (appointmentResult.error) {
    json(res, 500, { error: appointmentResult.error.message });
    return;
  }
  if (!appointmentResult.data) {
    json(res, 404, { error: 'Appointment not found' });
    return;
  }

  const appointment = appointmentResult.data as Appointment;
  if (appointment.status === 'cancelled') {
    json(res, 200, { status: 'already_cancelled' });
    return;
  }

  const barberResult = await client.from('barbers').select('*').eq('id', appointment.barber_id).maybeSingle();
  if (barberResult.error) {
    json(res, 500, { error: barberResult.error.message });
    return;
  }
  if (!barberResult.data) {
    json(res, 404, { error: 'Barber not found' });
    return;
  }

  const serviceResult = await client.from('services').select('*').eq('id', appointment.service_id).maybeSingle();
  if (serviceResult.error) {
    json(res, 500, { error: serviceResult.error.message });
    return;
  }

  const service = serviceResult.data as Service | null;

  try {
    await cancelCalendarEvent(barberResult.data, appointment.google_event_id);
    await sendWhatsappMessage(
      barberResult.data,
      appointment.customer_phone,
      [
        `Your appointment has been cancelled.`,
        service ? `Service: ${service.name}` : '',
        `Reference: ${appointment.id.slice(0, 8).toUpperCase()}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );

    await client.from('appointments').update({ status: 'cancelled' }).eq('id', appointment.id);
    json(res, 200, { status: 'cancelled' });
  } catch (error) {
    json(res, 502, { error: error instanceof Error ? error.message : 'Cancellation failed' });
  }
}
