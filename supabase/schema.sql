create extension if not exists pgcrypto;

create table if not exists public.salons (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid unique references auth.users (id) on delete set null,
  slug text unique,
  display_name text not null,
  allow_multi_service_selection boolean not null default false,
  billing_percent numeric(5,2) not null default 5,
  billing_unit_amount_cents integer not null default 25,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid unique references auth.users (id) on delete set null,
  salon_id uuid not null references public.salons (id) on delete cascade,
  slug text unique,
  display_name text not null,
  thumbnail_url text,
  timezone text not null default 'Europe/Amsterdam',
  active boolean not null default true,
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

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role text not null check (role in ('administrator', 'salon', 'employee')),
  salon_id uuid references public.salons (id) on delete cascade,
  barber_id uuid references public.barbers (id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  barber_id uuid references public.barbers (id) on delete set null,
  category_id uuid references public.service_categories (id) on delete set null,
  name text not null,
  thumbnail_url text,
  duration_minutes integer not null check (duration_minutes > 0),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_services (
  barber_id uuid not null references public.barbers (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (barber_id, service_id)
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
  salon_id uuid not null references public.salons (id) on delete cascade,
  barber_id uuid not null references public.barbers (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  service_ids uuid[],
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

create table if not exists public.salon_invitations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  role text not null check (role in ('salon', 'employee')),
  email text not null,
  barber_id uuid references public.barbers (id) on delete cascade,
  invite_link text not null,
  accepted_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists barbers_salon_id_idx on public.barbers (salon_id);
create index if not exists app_users_salon_id_idx on public.app_users (salon_id);
create index if not exists app_users_barber_id_idx on public.app_users (barber_id);
create index if not exists services_salon_id_idx on public.services (salon_id);
create index if not exists services_category_id_idx on public.services (category_id);
create index if not exists employee_services_barber_id_idx on public.employee_services (barber_id);
create index if not exists employee_services_service_id_idx on public.employee_services (service_id);
create index if not exists appointments_salon_id_idx on public.appointments (salon_id);
create index if not exists appointments_barber_id_idx on public.appointments (barber_id);
create index if not exists availability_rules_barber_id_idx on public.availability_rules (barber_id);
create index if not exists availability_exceptions_barber_id_idx on public.availability_exceptions (barber_id);
