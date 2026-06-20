export type Barber = {
  id: string;
  owner_user_id: string | null;
  salon_id: string;
  slug: string | null;
  display_name: string;
  thumbnail_url: string | null;
  timezone: string;
  active: boolean;
  billing_percent: number;
  billing_unit_amount_cents: number;
  calendar_id: string | null;
  google_service_account_email: string | null;
  google_private_key: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
  whatsapp_business_account_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  stripe_subscription_status: string | null;
};

export type Service = {
  id: string;
  salon_id: string;
  barber_id: string | null;
  category_id: string | null;
  name: string;
  thumbnail_url: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_cents: number;
  active: boolean;
};

export type ServiceCategory = {
  id: string;
  salon_id: string;
  name: string;
  sort_order: number;
};

export type Salon = {
  id: string;
  owner_user_id: string | null;
  slug: string | null;
  display_name: string;
  allow_multi_service_selection: boolean;
  billing_percent: number;
  billing_unit_amount_cents: number;
  created_at: string;
  updated_at: string;
};

export type AppUserRole = 'administrator' | 'salon' | 'employee';

export type AppUser = {
  id: string;
  auth_user_id: string;
  role: AppUserRole;
  salon_id: string | null;
  barber_id: string | null;
  display_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type AvailabilityRule = {
  id: string;
  barber_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_off: boolean;
};

export type AvailabilityException = {
  id: string;
  barber_id: string;
  date: string;
  is_off: boolean;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
};

export type Appointment = {
  id: string;
  salon_id: string;
  barber_id: string;
  service_id: string;
  service_ids: string[] | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  start_at: string;
  end_at: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  google_event_id: string | null;
  whatsapp_message_id: string | null;
  cancellation_token: string;
  created_at: string;
};

export type Slot = {
  startAt: string;
  endAt: string;
  label: string;
};

export type BookingRequest = {
  salonSlug?: string;
  barberId: string;
  serviceId?: string;
  serviceIds?: string[];
  startAt: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  notes?: string;
  consent: boolean;
};

export type BookingResponse = {
  appointmentId: string;
  status: string;
  bookingReference: string;
  cancellationUrl: string;
  calendarEventId?: string | null;
  whatsappMessageId?: string | null;
};

export type DashboardProfileInput = {
  display_name: string;
  slug: string | null;
  allow_multi_service_selection: boolean;
  billing_percent: number;
};

export type DashboardProfile = Salon;

export type AppointmentStatusSummary = {
  total: number;
  confirmed: number;
  cancelled: number;
  revenue_cents: number;
  due_cents: number;
  unit_amount_cents: number;
};
