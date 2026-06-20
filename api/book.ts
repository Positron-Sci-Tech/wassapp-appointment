import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Appointment, BookingRequest, BookingResponse, Service } from '../src/shared/types';
import { buildCancellationUrl, buildConfirmationMessage, cancelCalendarEvent, createCalendarEvent, sendWhatsappMessage } from './_integrations';
import { cleanString, getAdminClient, json, readJsonBody } from './_lib';
import { buildSlotsForDate } from './_slots';
import { recordStripeUsage } from './_stripe';

const bookingSchema = z.object({
  salonSlug: z.string().min(1).optional(),
  barberId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  serviceIds: z.array(z.string().uuid()).optional(),
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

  const serviceIds = Array.from(new Set([...(parsed.data.serviceIds ?? []), ...(parsed.data.serviceId ? [parsed.data.serviceId] : [])]));
  if (!serviceIds.length) {
    json(res, 400, { error: 'Missing selected services' });
    return;
  }

  const client = getAdminClient();
  const { barberId, startAt, customer } = parsed.data;

  const barberResult = await client.from('barbers').select('*').eq('id', barberId).maybeSingle();
  if (barberResult.error) {
    json(res, 500, { error: barberResult.error.message });
    return;
  }
  if (!barberResult.data || !(barberResult.data as { active: boolean }).active) {
    json(res, 404, { error: 'Barber not found' });
    return;
  }

  if (parsed.data.salonSlug) {
    const salonResult = await client.from('salons').select('id').eq('slug', parsed.data.salonSlug).maybeSingle();
    if (salonResult.error) {
      json(res, 500, { error: salonResult.error.message });
      return;
    }
    if (!salonResult.data || (salonResult.data as { id: string }).id !== (barberResult.data as { salon_id: string }).salon_id) {
      json(res, 400, { error: 'Salon and barber mismatch' });
      return;
    }
  }

  const [servicesResult, assignmentsResult] = await Promise.all([
    client.from('services').select('*').in('id', serviceIds).eq('active', true),
    client.from('employee_services').select('service_id').eq('barber_id', barberId),
  ]);
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
  const assigned = new Set((assignmentsResult.data ?? []).map((item) => (item as { service_id: string }).service_id));
  if (!serviceIds.every((id) => assigned.has(id))) {
    json(res, 400, { error: 'Selected barber does not offer all selected services' });
    return;
  }

  const blockMinutes = services.reduce((sum, service) => sum + service.duration_minutes + service.buffer_minutes, 0);
  const slots = await buildSlotsForDate(client, barberId, blockMinutes, startAt.slice(0, 10));
  const selectedSlot = slots.find((slot) => slot.startAt === startAt);
  if (!selectedSlot) {
    json(res, 409, { error: 'Selected time is no longer available' });
    return;
  }

  const endAt = new Date(new Date(startAt).getTime() + blockMinutes * 60000).toISOString();
  const cancellationToken = crypto.randomUUID();
  const bookingReference = cancellationToken.slice(0, 8).toUpperCase();
  const primaryService = services[0];

  const appointmentBase: Partial<Appointment> = {
    salon_id: (barberResult.data as { salon_id: string }).salon_id,
    barber_id: barberId,
    service_id: primaryService.id,
    service_ids: serviceIds,
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
  const cancelUrl = buildCancellationUrl(req, cancellationToken);
  const timeLabel = selectedSlot.label;
  const serviceLabel = services.map((service) => service.name).join(', ');
  let googleEventId: string | null = null;
  let whatsappMessageId: string | null = null;

  try {
    googleEventId = await createCalendarEvent(barberResult.data, { ...appointment, service_name: serviceLabel });
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
        serviceLabel,
        timeLabel,
        cancelUrl,
      ),
    );

    const appointmentUpdate: Record<string, unknown> = {
      status: 'confirmed',
      google_event_id: googleEventId,
      whatsapp_message_id: whatsappMessageId,
    };

    if ((barberResult.data as { stripe_subscription_item_id: string | null; stripe_subscription_status: string | null }).stripe_subscription_item_id
      && (barberResult.data as { stripe_subscription_status: string | null }).stripe_subscription_status !== 'canceled') {
      try {
        await recordStripeUsage(
          (barberResult.data as { stripe_subscription_item_id: string }).stripe_subscription_item_id,
          appointment.id,
        );
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
