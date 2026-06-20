import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Appointment } from '../../src/shared/types';
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
  let query = client.from('appointments').select('*').order('start_at', { ascending: false });

  if (context.appUser.role === 'salon') {
    query = query.eq('salon_id', requireSalonId(context.appUser));
  } else if (context.appUser.role === 'employee') {
    if (!context.appUser.barber_id) {
      json(res, 400, { error: 'Employee is not linked to a barber profile' });
      return;
    }
    query = query.eq('barber_id', context.appUser.barber_id);
  }

  const { data, error } = await query;
  if (error) {
    json(res, 500, { error: error.message });
    return;
  }

  json(res, 200, (data ?? []) as Appointment[]);
}
