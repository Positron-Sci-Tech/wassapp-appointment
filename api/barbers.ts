import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Barber } from '../src/shared/types';
import { getAdminClient, json, publicBarberSelect } from './_lib';

export default async function handler(_: IncomingMessage, res: ServerResponse): Promise<void> {
  const client = getAdminClient();
  const { data, error } = await client.from('barbers').select(publicBarberSelect()).order('display_name', { ascending: true });

  if (error) {
    json(res, 500, { error: error.message });
    return;
  }

  const barbers = (data ?? []).map((item) => {
    const barber = item as unknown as Pick<Barber, 'id' | 'display_name' | 'slug' | 'timezone'>;
    return {
      id: barber.id,
      display_name: barber.display_name,
      slug: barber.slug,
      timezone: barber.timezone,
    };
  });

  json(res, 200, barbers);
}
