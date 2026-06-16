import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { AvailabilityException, AvailabilityRule } from '../../src/shared/types';
import { getAdminClient, json, readJsonBody, requireBarber } from '../_lib';

const availabilitySchema = z.object({
  rules: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      start_time: z.string(),
      end_time: z.string(),
      is_off: z.boolean(),
    }),
  ),
  exceptions: z.array(
    z.object({
      date: z.string(),
      is_off: z.boolean(),
      start_time: z.string().nullable(),
      end_time: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const barber = await requireBarber(req).catch((error) => {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return null;
  });
  if (!barber) {
    return;
  }

  const client = getAdminClient();

  if (req.method === 'GET') {
    const [rulesResult, exceptionsResult] = await Promise.all([
      client.from('availability_rules').select('*').eq('barber_id', barber.id).order('weekday', { ascending: true }),
      client.from('availability_exceptions').select('*').eq('barber_id', barber.id).order('date', { ascending: true }),
    ]);

    if (rulesResult.error) {
      json(res, 500, { error: rulesResult.error.message });
      return;
    }
    if (exceptionsResult.error) {
      json(res, 500, { error: exceptionsResult.error.message });
      return;
    }

    json(res, 200, {
      rules: (rulesResult.data ?? []) as AvailabilityRule[],
      exceptions: (exceptionsResult.data ?? []) as AvailabilityException[],
    });
    return;
  }

  if (req.method === 'PUT') {
    const body = await readJsonBody<unknown>(req as IncomingMessage & { body?: unknown });
    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { error: parsed.error.flatten() });
      return;
    }

    const { error: deleteRulesError } = await client.from('availability_rules').delete().eq('barber_id', barber.id);
    if (deleteRulesError) {
      json(res, 500, { error: deleteRulesError.message });
      return;
    }

    const { error: deleteExceptionsError } = await client.from('availability_exceptions').delete().eq('barber_id', barber.id);
    if (deleteExceptionsError) {
      json(res, 500, { error: deleteExceptionsError.message });
      return;
    }

    const rulesPayload = parsed.data.rules.map((rule) => ({
      barber_id: barber.id,
      ...rule,
    }));
    const exceptionsPayload = parsed.data.exceptions.map((exception) => ({
      barber_id: barber.id,
      ...exception,
    }));

    if (rulesPayload.length) {
      const { error } = await client.from('availability_rules').insert(rulesPayload);
      if (error) {
        json(res, 500, { error: error.message });
        return;
      }
    }

    if (exceptionsPayload.length) {
      const { error } = await client.from('availability_exceptions').insert(exceptionsPayload);
      if (error) {
        json(res, 500, { error: error.message });
        return;
      }
    }

    json(res, 200, { status: 'saved' });
    return;
  }

  json(res, 405, { error: 'Method not allowed' });
}
