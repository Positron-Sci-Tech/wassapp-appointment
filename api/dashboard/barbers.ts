import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Barber } from '../../src/shared/types';
import { getAdminClient, getBaseUrl, json, readJsonBody, requireRole, requireSalonId } from '../_lib';

const barberSchema = z.object({
  id: z.string().uuid().optional(),
  display_name: z.string().min(1),
  thumbnail_url: z.string().url().nullable().optional(),
  timezone: z.string().min(1).default('Europe/Amsterdam'),
  active: z.boolean().default(true),
  service_ids: z.array(z.string().uuid()).default([]),
  email: z.string().email().optional(),
});

type BarberWithServiceIds = Barber & { service_ids: string[] };

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let context: Awaited<ReturnType<typeof requireRole>>;
  try {
    context = await requireRole(req, ['salon', 'employee']);
  } catch (error) {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return;
  }

  const salonId = requireSalonId(context.appUser);
  const client = getAdminClient();

  if (req.method === 'GET') {
    const [barbersResult, assignmentsResult] = await Promise.all([
      client.from('barbers').select('*').eq('salon_id', salonId).order('display_name', { ascending: true }),
      client.from('employee_services').select('barber_id,service_id'),
    ]);
    if (barbersResult.error) {
      json(res, 500, { error: barbersResult.error.message });
      return;
    }
    if (assignmentsResult.error) {
      json(res, 500, { error: assignmentsResult.error.message });
      return;
    }

    const byBarberId = new Map<string, string[]>();
    for (const row of assignmentsResult.data ?? []) {
      const key = (row as { barber_id: string }).barber_id;
      const list = byBarberId.get(key) ?? [];
      list.push((row as { service_id: string }).service_id);
      byBarberId.set(key, list);
    }

    const payload = ((barbersResult.data ?? []) as Barber[]).map((barber) => ({
      ...barber,
      service_ids: byBarberId.get(barber.id) ?? [],
    }));
    json(res, 200, payload as BarberWithServiceIds[]);
    return;
  }

  if (context.appUser.role !== 'salon') {
    json(res, 403, { error: 'Only salon users can modify employees' });
    return;
  }

  if (req.method === 'POST') {
    const body = await readJsonBody<unknown>(req as IncomingMessage & { body?: unknown });
    const parsed = barberSchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { error: parsed.error.flatten() });
      return;
    }

    let barberId = parsed.data.id;
    if (barberId) {
      const updateResult = await client
        .from('barbers')
        .update({
          display_name: parsed.data.display_name,
          thumbnail_url: parsed.data.thumbnail_url ?? null,
          timezone: parsed.data.timezone,
          active: parsed.data.active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', barberId)
        .eq('salon_id', salonId)
        .select('*')
        .single();
      if (updateResult.error) {
        json(res, 500, { error: updateResult.error.message });
        return;
      }
    } else {
      const insertResult = await client
        .from('barbers')
        .insert({
          salon_id: salonId,
          display_name: parsed.data.display_name,
          thumbnail_url: parsed.data.thumbnail_url ?? null,
          timezone: parsed.data.timezone,
          active: parsed.data.active,
        })
        .select('*')
        .single();
      if (insertResult.error) {
        json(res, 500, { error: insertResult.error.message });
        return;
      }
      barberId = (insertResult.data as Barber).id;
    }

    const deleteAssignmentsResult = await client.from('employee_services').delete().eq('barber_id', barberId);
    if (deleteAssignmentsResult.error) {
      json(res, 500, { error: deleteAssignmentsResult.error.message });
      return;
    }

    if (parsed.data.service_ids.length) {
      const insertAssignmentsResult = await client.from('employee_services').insert(
        parsed.data.service_ids.map((serviceId) => ({
          barber_id: barberId,
          service_id: serviceId,
        })),
      );
      if (insertAssignmentsResult.error) {
        json(res, 500, { error: insertAssignmentsResult.error.message });
        return;
      }
    }

    let inviteLink: string | null = null;
    if (parsed.data.email) {
      const redirectTo = `${getBaseUrl(req)}/dashboard`;
      const inviteResult = await client.auth.admin.generateLink({
        type: 'invite',
        email: parsed.data.email,
        options: {
          redirectTo,
        },
      });
      if (inviteResult.error) {
        json(res, 500, { error: inviteResult.error.message });
        return;
      }

      const invitedUser = inviteResult.data.user;
      if (!invitedUser) {
        json(res, 500, { error: 'Invite did not return a user' });
        return;
      }
      inviteLink = inviteResult.data.properties.action_link;

      const upsertUserResult = await client.from('app_users').upsert(
        {
          auth_user_id: invitedUser.id,
          role: 'employee',
          salon_id: salonId,
          barber_id: barberId,
          display_name: parsed.data.display_name,
          email: parsed.data.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'auth_user_id' },
      );
      if (upsertUserResult.error) {
        json(res, 500, { error: upsertUserResult.error.message });
        return;
      }

      const inviteInsertResult = await client.from('salon_invitations').insert({
        salon_id: salonId,
        role: 'employee',
        email: parsed.data.email,
        barber_id: barberId,
        invite_link: inviteLink,
        created_by_user_id: context.authUser.id,
      });
      if (inviteInsertResult.error) {
        json(res, 500, { error: inviteInsertResult.error.message });
        return;
      }
    }

    json(res, 200, { status: 'saved', barberId, inviteLink });
    return;
  }

  if (req.method === 'DELETE') {
    const body = await readJsonBody<{ id: string }>(req as IncomingMessage & { body?: unknown });
    if (!body.id) {
      json(res, 400, { error: 'Missing id' });
      return;
    }

    const [assignmentResult, userResult, inviteResult, deleteResult] = await Promise.all([
      client.from('employee_services').delete().eq('barber_id', body.id),
      client.from('app_users').delete().eq('barber_id', body.id).eq('salon_id', salonId),
      client.from('salon_invitations').delete().eq('barber_id', body.id).eq('salon_id', salonId),
      client.from('barbers').delete().eq('id', body.id).eq('salon_id', salonId),
    ]);
    if (assignmentResult.error) {
      json(res, 500, { error: assignmentResult.error.message });
      return;
    }
    if (userResult.error) {
      json(res, 500, { error: userResult.error.message });
      return;
    }
    if (inviteResult.error) {
      json(res, 500, { error: inviteResult.error.message });
      return;
    }
    if (deleteResult.error) {
      json(res, 500, { error: deleteResult.error.message });
      return;
    }

    json(res, 200, { status: 'deleted' });
    return;
  }

  json(res, 405, { error: 'Method not allowed' });
}
