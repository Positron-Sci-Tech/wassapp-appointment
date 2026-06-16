create extension if not exists pgcrypto;

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  slug text not null unique,
  display_name text not null,
  timezone text not null default 'Europe/Amsterdam',
  billing_percent numeric(5,2) not null default 5,
  billing_unit_amount_cents integer not null default 25,
  calendar_id text,
  google_service_account_email text,
  google_private_key text,
  whatsapp_phone_number_id text,
  whatsapp_access_token text,
  whatsapp_business_account_id text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_subscription_item_id text unique,
  stripe_subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers (id) on delete cascade,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers (id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_off boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers (id) on delete cascade,
  date date not null,
  is_off boolean not null default true,
  start_time time,
  end_time time,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  google_event_id text,
  whatsapp_message_id text,
  cancellation_token text not null unique,
  stripe_usage_recorded_at timestamptz,
  stripe_usage_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_barber_id_idx on public.services (barber_id);
create index if not exists appointments_barber_id_idx on public.appointments (barber_id);
create index if not exists availability_rules_barber_id_idx on public.availability_rules (barber_id);
create index if not exists availability_exceptions_barber_id_idx on public.availability_exceptions (barber_id);

alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.appointments enable row level security;

create policy "barbers owned by user" on public.barbers
for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create policy "services owned by user" on public.services
for all using (
  exists (
    select 1 from public.barbers b where b.id = barber_id and b.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.barbers b where b.id = barber_id and b.owner_user_id = auth.uid()
  )
);

create policy "availability rules owned by user" on public.availability_rules
for all using (
  exists (
    select 1 from public.barbers b where b.id = barber_id and b.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.barbers b where b.id = barber_id and b.owner_user_id = auth.uid()
  )
);

create policy "availability exceptions owned by user" on public.availability_exceptions
for all using (
  exists (
    select 1 from public.barbers b where b.id = barber_id and b.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.barbers b where b.id = barber_id and b.owner_user_id = auth.uid()
  )
);

create policy "appointments owned by user" on public.appointments
for all using (
  exists (
    select 1 from public.barbers b where b.id = barber_id and b.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.barbers b where b.id = barber_id and b.owner_user_id = auth.uid()
  )
);
