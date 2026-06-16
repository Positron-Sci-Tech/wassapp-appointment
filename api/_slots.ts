import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilityException, AvailabilityRule, Service, Slot } from '../src/shared/types';

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (value % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00Z`).toISOString();
}

export async function buildSlotsForDate(
  client: SupabaseClient,
  barberId: string,
  service: Service,
  date: string,
): Promise<Slot[]> {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

  const [rulesResult, exceptionsResult, appointmentsResult] = await Promise.all([
    client.from('availability_rules').select('*').eq('barber_id', barberId).eq('weekday', weekday),
    client.from('availability_exceptions').select('*').eq('barber_id', barberId).eq('date', date),
    client
      .from('appointments')
      .select('start_at,end_at,status')
      .eq('barber_id', barberId)
      .in('status', ['pending', 'confirmed'])
      .gte('start_at', `${date}T00:00:00.000Z`)
      .lt('start_at', `${date}T23:59:59.999Z`),
  ]);

  if (rulesResult.error) {
    throw new Error(rulesResult.error.message);
  }
  if (exceptionsResult.error) {
    throw new Error(exceptionsResult.error.message);
  }
  if (appointmentsResult.error) {
    throw new Error(appointmentsResult.error.message);
  }

  const rule = (rulesResult.data as AvailabilityRule[]).find((item) => !item.is_off);
  const exception = (exceptionsResult.data as AvailabilityException[]).find((item) => item.is_off);

  if (!rule || exception) {
    return [];
  }

  const startMinutes = timeToMinutes(rule.start_time);
  const endMinutes = timeToMinutes(rule.end_time);
  const blockMinutes = service.duration_minutes + service.buffer_minutes;
  const existing = appointmentsResult.data as { start_at: string; end_at: string; status: string }[];

  const slots: Slot[] = [];
  for (let start = startMinutes; start + blockMinutes <= endMinutes; start += blockMinutes) {
    const candidateStart = minutesToTime(start);
    const candidateEnd = minutesToTime(start + service.duration_minutes);
    const startAt = toIso(date, candidateStart);
    const endAt = toIso(date, candidateEnd);
    const overlaps = existing.some((appointment) => {
      return startAt < appointment.end_at && endAt > appointment.start_at;
    });

    if (!overlaps) {
      slots.push({
        startAt,
        endAt,
        label: `${candidateStart} - ${candidateEnd}`,
      });
    }
  }

  return slots;
}
