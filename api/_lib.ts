import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Barber } from '../src/shared/types';

type ApiRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export function getAdminClient(): SupabaseClient {
  return createClient(supabaseUrl!, serviceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function text(res: ServerResponse, statusCode: number, payload: string): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(payload);
}

export async function readJsonBody<T>(req: ApiRequest): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    return req.body as T;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
}

export function getHeaderValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function getBaseUrl(req: IncomingMessage): string {
  const forwardedProto = getHeaderValue(req, 'x-forwarded-proto') ?? 'https';
  const forwardedHost = getHeaderValue(req, 'x-forwarded-host') ?? getHeaderValue(req, 'host');
  if (!forwardedHost) {
    return process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
  }
  return `${forwardedProto}://${forwardedHost}`;
}

export async function requireUser(req: IncomingMessage): Promise<User> {
  const token = getHeaderValue(req, 'authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    throw new Error('Missing authorization token');
  }

  const client = getAdminClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Unauthorized');
  }

  return data.user;
}

export async function requireBarber(req: IncomingMessage): Promise<Barber> {
  const user = await requireUser(req);
  const client = getAdminClient();
  const { data, error } = await client
    .from('barbers')
    .select('*')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Barber profile not found');
  }

  return data as Barber;
}

export function publicBarberSelect() {
  return 'id, slug, display_name, timezone';
}

export function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getQueryValue(req: IncomingMessage, key: string): string | undefined {
  const url = new URL(req.url ?? '/', getBaseUrl(req));
  const value = url.searchParams.get(key);
  return value === null ? undefined : value;
}
