import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { Salon } from '../../../src/shared/types';
import { asSlug, getAdminClient, getBaseUrl, json, readJsonBody, requireRole } from '../../_lib';

const createSalonSchema = z.object({
  display_name: z.string().min(1),
  email: z.string().email(),
});

const updateSalonSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(1),
  slug: z.string().nullable(),
  allow_multi_service_selection: z.boolean(),
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await requireRole(req, ['administrator']);
  } catch (error) {
    json(res, 401, { error: error instanceof Error ? error.message : 'Unauthorized' });
    return;
  }

  const client = getAdminClient();

  if (req.method === 'GET') {
    const { data, error } = await client.from('salons').select('*').order('created_at', { ascending: false });
    if (error) {
      json(res, 500, { error: error.message });
      return;
    }
    json(res, 200, (data ?? []) as Salon[]);
    return;
  }

  if (req.method === 'POST') {
    const body = await readJsonBody<unknown>(req as IncomingMessage & { body?: unknown });
    const parsed = createSalonSchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { error: parsed.error.flatten() });
      return;
    }

    const salonInsert = await client.from('salons').insert({ display_name: parsed.data.display_name }).select('*').single();
    if (salonInsert.error) {
      json(res, 500, { error: salonInsert.error.message });
      return;
    }

    const redirectTo = `${getBaseUrl(req)}/dashboard`;
    const inviteResult = await client.auth.admin.generateLink({
      type: 'invite',
      email: parsed.data.email,
      options: { redirectTo },
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

    const salon = salonInsert.data as Salon;
    const upsertUser = await client.from('app_users').upsert(
      {
        auth_user_id: invitedUser.id,
        role: 'salon',
        salon_id: salon.id,
        display_name: parsed.data.display_name,
        email: parsed.data.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'auth_user_id' },
    );
    if (upsertUser.error) {
      json(res, 500, { error: upsertUser.error.message });
      return;
    }

    const invitationInsert = await client.from('salon_invitations').insert({
      salon_id: salon.id,
      role: 'salon',
      email: parsed.data.email,
      invite_link: inviteResult.data.properties.action_link,
    });
    if (invitationInsert.error) {
      json(res, 500, { error: invitationInsert.error.message });
      return;
    }

    json(res, 200, { salon, inviteLink: inviteResult.data.properties.action_link });
    return;
  }

  if (req.method === 'PUT') {
    const body = await readJsonBody<unknown>(req as IncomingMessage & { body?: unknown });
    const parsed = updateSalonSchema.safeParse(body);
    if (!parsed.success) {
      json(res, 400, { error: parsed.error.flatten() });
      return;
    }

    const updateResult = await client
      .from('salons')
      .update({
        display_name: parsed.data.display_name,
        slug: parsed.data.slug ? asSlug(parsed.data.slug) : null,
        allow_multi_service_selection: parsed.data.allow_multi_service_selection,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.id)
      .select('*')
      .single();
    if (updateResult.error) {
      json(res, 500, { error: updateResult.error.message });
      return;
    }

    json(res, 200, updateResult.data as Salon);
    return;
  }

  if (req.method === 'DELETE') {
    const body = await readJsonBody<{ id: string }>(req as IncomingMessage & { body?: unknown });
    if (!body.id) {
      json(res, 400, { error: 'Missing id' });
      return;
    }

    const deleteResult = await client.from('salons').delete().eq('id', body.id);
    if (deleteResult.error) {
      json(res, 500, { error: deleteResult.error.message });
      return;
    }

    json(res, 200, { status: 'deleted' });
    return;
  }

  json(res, 405, { error: 'Method not allowed' });
}
