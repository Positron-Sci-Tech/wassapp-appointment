import { google } from 'googleapis';
import type { Barber, BookingResponse, Appointment } from '../src/shared/types';
import { getBaseUrl } from './_lib';

export async function createCalendarEvent(barber: Barber, appointment: Appointment & { service_name: string }): Promise<string | null> {
  if (!barber.google_service_account_email || !barber.google_private_key || !barber.calendar_id) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: barber.google_service_account_email,
    key: barber.google_private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const calendar = google.calendar({ version: 'v3', auth });

  const { data } = await calendar.events.insert({
    calendarId: barber.calendar_id,
    requestBody: {
      summary: `${appointment.service_name} · ${appointment.customer_name}`,
      description: [
        `Customer: ${appointment.customer_name}`,
        `Phone: ${appointment.customer_phone}`,
        appointment.customer_email ? `Email: ${appointment.customer_email}` : '',
        `Booking reference: ${appointment.id.slice(0, 8)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      start: {
        dateTime: appointment.start_at,
      },
      end: {
        dateTime: appointment.end_at,
      },
    },
  });

  return data.id ?? null;
}

export async function cancelCalendarEvent(barber: Barber, googleEventId: string | null): Promise<void> {
  if (!googleEventId || !barber.google_service_account_email || !barber.google_private_key || !barber.calendar_id) {
    return;
  }

  const auth = new google.auth.JWT({
    email: barber.google_service_account_email,
    key: barber.google_private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({
    calendarId: barber.calendar_id,
    eventId: googleEventId,
  });
}

export async function sendWhatsappMessage(barber: Barber, to: string, body: string): Promise<string | null> {
  if (!barber.whatsapp_phone_number_id || !barber.whatsapp_access_token) {
    return null;
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${barber.whatsapp_phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${barber.whatsapp_access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as { messages?: { id: string }[] };
  return data.messages?.[0]?.id ?? null;
}

export function buildCancellationUrl(req: Parameters<typeof getBaseUrl>[0], token: string): string {
  return `${getBaseUrl(req)}/cancel?token=${encodeURIComponent(token)}`;
}

export function buildConfirmationMessage(booking: BookingResponse, serviceName: string, timeLabel: string, cancelUrl: string): string {
  return [
    `Your appointment is confirmed.`,
    `Service: ${serviceName}`,
    `Time: ${timeLabel}`,
    `Reference: ${booking.bookingReference}`,
    `Cancel: ${cancelUrl}`,
  ].join('\n');
}
