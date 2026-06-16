import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Appointment, BookingRequest, BookingResponse, Service } from '../src/shared/types';
import { buildCancellationUrl, buildConfirmationMessage, cancelCalendarEvent, createCalendarEvent, sendWhatsappMessage } from './_integrations';
import { cleanString, getAdminClient, getBaseUrl, json, readJsonBody } from './_lib';
import { buildSlotsForDate } from './_slots';
import { recordStripeUsage } from './_stripe';

const bookingSchema = z.object({
  barberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(6),
    email: z.string().email().optional(),
  }),
  notes: z.string().optional(),
  consent: z.literal(true),
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody<BookingRequest>(req as IncomingMessage & { body?: unknown });
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    json(res, 400, { error: parsed.error.flatten() });
    return;
  }

  const client = getAdminClient();
  const { barberId, serviceId, startAt, customer, notes } = parsed.data;

  const barberResult = await client.from('barbers').select('*').eq('id', barberId).maybeSingle();
  if (barberResult.error) {
    json(res, 500, { error: barberResult.error.message });
    return;
  }
  if (!barberResult.data) {
    json(res, 404, { error: 'Barber not found' });
    return;
  }

  const serviceResult = await client.from('services').select('*').eq('id', serviceId).eq('barber_id', barberId).maybeSingle();
  if (serviceResult.error) {
    json(res, 500, { error: serviceResult.error.message });
    return;
  }
  if (!serviceResult.data) {
    json(res, 404, { error: 'Service not found' });
    return;
  }

  const service = serviceResult.data as Service;
  const slots = await buildSlotsForDate(client, barberId, service, startAt.slice(0, 10));
  const selectedSlot = slots.find((slot) => slot.startAt === startAt);
  if (!selectedSlot) {
    json(res, 409, { error: 'Selected time is no longer available' });
    return;
  }

  const endAt = new Date(new Date(startAt).getTime() + (service.duration_minutes + service.buffer_minutes) * 60000).toISOString();
  const cancellationToken = crypto.randomUUID();
  const bookingReference = cancellationToken.slice(0, 8).toUpperCase();
  const appointmentBase: Partial<Appointment> = {
    barber_id: barberId,
    service_id: serviceId,
    customer_name: customer.name.trim(),
    customer_phone: cleanString(customer.phone),
    customer_email: customer.email?.trim() || null,
    start_at: startAt,
    end_at: endAt,
    status: 'pending',
    google_event_id: null,
    whatsapp_message_id: null,
    cancellation_token: cancellationToken,
  };

  const insertResult = await client.from('appointments').insert(appointmentBase).select('*').single();
  if (insertResult.error) {
    json(res, 500, { error: insertResult.error.message });
    return;
  }

  const appointment = insertResult.data as Appointment;
  const appointmentWithService = { ...appointment, service_name: service.name };
  const cancelUrl = buildCancellationUrl(req, cancellationToken);
  const timeLabel = selectedSlot.label;
  let googleEventId: string | null = null;
  let whatsappMessageId: string | null = null;

  try {
    googleEventId = await createCalendarEvent(barberResult.data, appointmentWithService);
    whatsappMessageId = await sendWhatsappMessage(
      barberResult.data,
      appointment.customer_phone,
      buildConfirmationMessage(
        {
          appointmentId: appointment.id,
          status: 'confirmed',
          bookingReference,
          cancellationUrl: cancelUrl,
          calendarEventId: googleEventId,
          whatsappMessageId: null,
        },
        service.name,
        timeLabel,
        cancelUrl,
      ),
    );

    const appointmentUpdate: Record<string, unknown> = {
      status: 'confirmed',
      google_event_id: googleEventId,
      whatsapp_message_id: whatsappMessageId,
    };

    if (barberResult.data.stripe_subscription_item_id && barberResult.data.stripe_subscription_status !== 'canceled') {
      try {
        await recordStripeUsage(barberResult.data.stripe_subscription_item_id, appointment.id);
        appointmentUpdate.stripe_usage_recorded_at = new Date().toISOString();
        appointmentUpdate.stripe_usage_error = null;
      } catch (usageError) {
        appointmentUpdate.stripe_usage_error = usageError instanceof Error ? usageError.message : 'Failed to record Stripe usage';
      }
    }

    await client.from('appointments').update(appointmentUpdate).eq('id', appointment.id);

    const response: BookingResponse = {
      appointmentId: appointment.id,
      status: 'confirmed',
      bookingReference,
      cancellationUrl: cancelUrl,
      calendarEventId: googleEventId,
      whatsappMessageId,
    };
    json(res, 200, response);
  } catch (error) {
    if (googleEventId) {
      await cancelCalendarEvent(barberResult.data, googleEventId).catch(() => undefined);
    }
    await client.from('appointments').update({ status: 'cancelled' }).eq('id', appointment.id);
    json(res, 502, { error: error instanceof Error ? error.message : 'Failed to finalize booking' });
  }
}
