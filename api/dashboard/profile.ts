import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { DashboardProfile, DashboardProfileInput } from '../../src/shared/types';
import { getAdminClient, json, readJsonBody, requireBarber } from '../_lib';

const profileSchema = z.object({
  display_name: z.string().min(1),
  slug: z.string().min(1),
  timezone: z.string().min(1),
  billing_percent: z.number().min(0),
  calendar_id: z.string().nullable(),
  google_service_account_email: z.string().nullable(),
  google_private_key: z.string().nullable(),
  whatsapp_phone_number_id: z.string().nullable(),
  whatsapp_access_token: z.string().nullable(),
  whatsapp_business_account_id: z.string().nullable(),
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const client = getAdminClient();

  if (req.method === 'GET') {
    try {
      const barber = await requireBarber(req);
      json(res, 200, barber as DashboardProfile);
    } catch (error) {
      if (error instanceof Error && error.message === 'Barber profile not found') {
        json(res, 200, null);
        return;
      }
      json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    }
    return;
  }

  if (req.method !== 'PUT') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody<DashboardProfileInput>(req as IncomingMessage & { body?: unknown });
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    json(res, 400, { error: parsed.error.flatten() });
    return;
  }

  const user = await requireBarber(req).catch(async () => null);
  const authUser = user?.owner_user_id;
  if (!authUser) {
    const sessionUser = await (async () => {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data } = await client.auth.getUser(token);
      return data.user ?? null;
    })();

    if (!sessionUser) {
      json(res, 401, { error: 'Unauthorized' });
      return;
    }

    const upsertResult = await client
      .from('barbers')
      .upsert(
        {
          owner_user_id: sessionUser.id,
          ...parsed.data,
        },
        { onConflict: 'owner_user_id' },
      )
      .select('*')
      .single();

    if (upsertResult.error) {
      json(res, 500, { error: upsertResult.error.message });
      return;
    }

    json(res, 200, upsertResult.data as DashboardProfile);
    return;
  }

  const upsertResult = await client
    .from('barbers')
    .upsert(
      {
        owner_user_id: authUser,
        ...parsed.data,
      },
      { onConflict: 'owner_user_id' },
    )
    .select('*')
    .single();

  if (upsertResult.error) {
    json(res, 500, { error: upsertResult.error.message });
    return;
  }

  json(res, 200, upsertResult.data as DashboardProfile);
}
