import type { Session } from '@supabase/supabase-js';
import { supabase } from './shared/supabase';
import { fetchJson } from './shared/api';
import { formatCurrency, formatDateTime, formatTimeRange } from './shared/format';
import type {
  Appointment,
  AppointmentStatusSummary,
  AvailabilityException,
  AvailabilityRule,
  DashboardProfile,
  DashboardProfileInput,
  Service,
} from './shared/types';

type DashboardState = {
  session: Session | null;
  profile: DashboardProfile | null;
  activeTab: TabKey;
};

type TabKey = 'appointments' | 'services' | 'availability' | 'billing' | 'settings';

const tabLabels: Record<TabKey, string> = {
  appointments: 'Appointments',
  services: 'Services',
  availability: 'Availability',
  billing: 'Billing',
  settings: 'Settings',
};

export async function mountDashboard(root: HTMLElement): Promise<void> {
  const state: DashboardState = {
    session: null,
    profile: null,
    activeTab: 'appointments',
  };

  root.innerHTML = dashboardShell();
  const content = root.querySelector<HTMLElement>('[data-dashboard-content]');

  const authStatus = root.querySelector<HTMLElement>('[data-auth-status]');
  const signOutButton = root.querySelector<HTMLButtonElement>('[data-signout]');
  const authJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    if (!state.session) {
      throw new Error('Missing session');
    }

    return fetchJson<T>(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${state.session.access_token}`,
        ...(init?.headers ?? {}),
      },
    });
  };
  const stripeAction = async (path: string): Promise<void> => {
    const response = await authJson<{ url: string }>(path, { method: 'POST' });
    window.location.href = response.url;
  };

  const renderAuthState = async () => {
    const { data } = await supabase.auth.getSession();
    state.session = data.session;

    if (!state.session) {
      authStatus!.textContent = 'Signed out';
      content!.innerHTML = authScreen();
      bindAuthForms();
      return;
    }

    authStatus!.textContent = `Signed in as ${state.session.user.email ?? state.session.user.phone ?? 'barber'}`;
    await loadProfile();
  };

  const bindAuthForms = () => {
    const modeButtons = root.querySelectorAll<HTMLButtonElement>('[data-auth-mode]');
    const emailPanel = root.querySelector<HTMLElement>('[data-email-panel]');
    const phonePanel = root.querySelector<HTMLElement>('[data-phone-panel]');
    const signInForm = root.querySelector<HTMLFormElement>('[data-signin-form]');
    const otpForm = root.querySelector<HTMLFormElement>('[data-otp-form]');

    modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.authMode;
        emailPanel?.classList.toggle('hidden', mode !== 'email');
        phonePanel?.classList.toggle('hidden', mode !== 'phone');
      });
    });

    signInForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(signInForm);
      const email = String(formData.get('email') ?? '').trim();
      const password = String(formData.get('password') ?? '').trim();

      authStatus!.textContent = 'Signing in...';
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      authStatus!.textContent = error ? error.message : 'Signed in';
      await renderAuthState();
    });

    otpForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(otpForm);
      const phone = String(formData.get('phone') ?? '').trim();
      const token = String(formData.get('token') ?? '').trim();

      if (!token) {
        authStatus!.textContent = 'Sending OTP...';
        const { error } = await supabase.auth.signInWithOtp({ phone });
        authStatus!.textContent = error ? error.message : 'OTP sent. Enter the code to continue.';
        return;
      }

      authStatus!.textContent = 'Verifying OTP...';
      const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
      authStatus!.textContent = error ? error.message : 'Signed in';
      await renderAuthState();
    });
  };

  const loadProfile = async () => {
    const profile = await authJson<DashboardProfile | null>('/api/dashboard/profile');
    state.profile = profile;
    renderDashboard();
  };

  const renderDashboard = () => {
    if (!content) return;

    if (!state.profile) {
      content.innerHTML = setupScreen();
      bindSetupForm();
      return;
    }

    content.innerHTML = `
      <div class="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside class="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
          <p class="px-3 pb-3 text-sm font-semibold text-slate-500">${state.profile.display_name}</p>
          <nav class="grid gap-1">
            ${Object.keys(tabLabels)
              .map(
                (key) => `
                  <button data-tab="${key}" class="rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                    state.activeTab === key ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'
                  }">${tabLabels[key as TabKey]}</button>
                `,
              )
              .join('')}
          </nav>
        </aside>

        <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">${tabLabels[state.activeTab]}</p>
              <p class="mt-1 text-sm text-slate-500">Manage the barber business from one place.</p>
            </div>
            <button data-refresh class="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Refresh</button>
          </div>
          <div data-tab-panel></div>
        </section>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.activeTab = button.dataset.tab as TabKey;
        renderDashboard();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-refresh]')?.addEventListener('click', async () => {
      await loadProfile();
    });

    void renderTab();
  };

  const renderTab = async () => {
    const panel = root.querySelector<HTMLElement>('[data-tab-panel]');
    if (!panel || !state.profile) return;

    if (state.activeTab === 'appointments') {
      const appointments = await authJson<Appointment[]>('/api/dashboard/appointments');
      const summary = await authJson<AppointmentStatusSummary>('/api/dashboard/billing');
      panel.innerHTML = appointmentsTable(appointments, state.profile.timezone) + summaryCard(summary);
      return;
    }

    if (state.activeTab === 'services') {
      const services = await authJson<Service[]>('/api/dashboard/services');
      panel.innerHTML = servicesScreen(services);
      bindServicesForm();
      return;
    }

    if (state.activeTab === 'availability') {
      const data = await authJson<{ rules: AvailabilityRule[]; exceptions: AvailabilityException[] }>('/api/dashboard/availability');
      panel.innerHTML = availabilityScreen(data.rules, data.exceptions);
      bindAvailabilityForm();
      return;
    }

    if (state.activeTab === 'billing') {
      const summary = await authJson<AppointmentStatusSummary>('/api/dashboard/billing');
      panel.innerHTML = billingScreen(summary, state.profile.billing_unit_amount_cents, state.profile);
      bindStripeActions();
      return;
    }

    panel.innerHTML = settingsScreen(state.profile);
    bindSettingsForm();
    bindStripeActions();
  };

  const bindSetupForm = () => {
    const form = root.querySelector<HTMLFormElement>('[data-setup-form]');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload: DashboardProfileInput = {
        display_name: String(formData.get('display_name') ?? '').trim(),
        slug: String(formData.get('slug') ?? '').trim(),
        timezone: String(formData.get('timezone') ?? '').trim() || 'Europe/Amsterdam',
        billing_percent: Number(formData.get('billing_percent') ?? 5),
        calendar_id: String(formData.get('calendar_id') ?? '').trim() || null,
        google_service_account_email: String(formData.get('google_service_account_email') ?? '').trim() || null,
        google_private_key: String(formData.get('google_private_key') ?? '').trim() || null,
        whatsapp_phone_number_id: String(formData.get('whatsapp_phone_number_id') ?? '').trim() || null,
        whatsapp_access_token: String(formData.get('whatsapp_access_token') ?? '').trim() || null,
        whatsapp_business_account_id: String(formData.get('whatsapp_business_account_id') ?? '').trim() || null,
      };

      await authJson('/api/dashboard/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await loadProfile();
    });
  };

  const bindSettingsForm = () => {
    const form = root.querySelector<HTMLFormElement>('[data-settings-form]');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload: DashboardProfileInput = {
        display_name: String(formData.get('display_name') ?? '').trim(),
        slug: String(formData.get('slug') ?? '').trim(),
        timezone: String(formData.get('timezone') ?? '').trim() || 'Europe/Amsterdam',
        billing_percent: Number(formData.get('billing_percent') ?? 5),
        calendar_id: String(formData.get('calendar_id') ?? '').trim() || null,
        google_service_account_email: String(formData.get('google_service_account_email') ?? '').trim() || null,
        google_private_key: String(formData.get('google_private_key') ?? '').trim() || null,
        whatsapp_phone_number_id: String(formData.get('whatsapp_phone_number_id') ?? '').trim() || null,
        whatsapp_access_token: String(formData.get('whatsapp_access_token') ?? '').trim() || null,
        whatsapp_business_account_id: String(formData.get('whatsapp_business_account_id') ?? '').trim() || null,
      };

      await authJson('/api/dashboard/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await loadProfile();
    });
  };

  const bindStripeActions = () => {
    root.querySelector<HTMLButtonElement>('[data-stripe-connect]')?.addEventListener('click', async () => {
      await stripeAction('/api/stripe/checkout');
    });

    root.querySelector<HTMLButtonElement>('[data-stripe-portal]')?.addEventListener('click', async () => {
      await stripeAction('/api/stripe/portal');
    });
  };

  const bindServicesForm = () => {
    const form = root.querySelector<HTMLFormElement>('[data-services-form]');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      await authJson('/api/dashboard/services', {
        method: 'POST',
        body: JSON.stringify({
          name: String(formData.get('name') ?? '').trim(),
          duration_minutes: Number(formData.get('duration_minutes') ?? 30),
          price_cents: Math.round(Number(formData.get('price') ?? 0) * 100),
          buffer_minutes: Number(formData.get('buffer_minutes') ?? 0),
        }),
      });
      await loadProfile();
    });

    root.querySelectorAll<HTMLButtonElement>('[data-service-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.serviceDelete;
        if (!id) return;
        await authJson('/api/dashboard/services', {
          method: 'DELETE',
          body: JSON.stringify({ id }),
        });
        await loadProfile();
      });
    });
  };

  const bindAvailabilityForm = () => {
    const form = root.querySelector<HTMLFormElement>('[data-availability-form]');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const rules = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        start_time: String(formData.get(`start_${weekday}`) ?? '09:00'),
        end_time: String(formData.get(`end_${weekday}`) ?? '17:00'),
        is_off: formData.get(`off_${weekday}`) === 'on',
      }));
      const exceptions = String(formData.get('exceptions') ?? '')
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((date) => ({ date, is_off: true, start_time: null, end_time: null, note: 'Off day' }));

      await authJson('/api/dashboard/availability', {
        method: 'PUT',
        body: JSON.stringify({ rules, exceptions }),
      });
      await loadProfile();
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    await renderAuthState();
  };

  signOutButton?.addEventListener('click', signOut);
  await renderAuthState();
}

function dashboardShell(): string {
  return `
    <main class="mx-auto min-h-screen max-w-7xl px-4 py-8">
      <div class="mb-6 flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Wassapp Appointment</p>
          <p data-auth-status class="mt-1 text-sm text-slate-500">Checking session...</p>
        </div>
        <button data-signout class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Sign out</button>
      </div>
      <div data-dashboard-content></div>
    </main>
  `;
}

function authScreen(): string {
  return `
    <div class="grid gap-6 lg:grid-cols-2">
      <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h1 class="text-2xl font-bold text-slate-900">Barber dashboard</h1>
        <p class="mt-3 text-sm text-slate-600">Use email/password or phone OTP to sign in.</p>
        <div class="mt-4 flex gap-2">
          <button data-auth-mode="email" class="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Email</button>
          <button data-auth-mode="phone" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Phone</button>
        </div>

        <form data-signin-form class="mt-6 space-y-4">
          <div data-email-panel>
            <label class="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input name="email" type="email" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
            <label class="mb-1 mt-4 block text-sm font-medium text-slate-700">Password</label>
            <input name="password" type="password" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
            <button class="mt-4 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">Sign in with email</button>
          </div>
        </form>

        <form data-otp-form class="mt-6 space-y-4">
          <div data-phone-panel class="hidden">
            <label class="mb-1 block text-sm font-medium text-slate-700">Phone number</label>
            <input name="phone" placeholder="+31612345678" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
            <label class="mb-1 mt-4 block text-sm font-medium text-slate-700">OTP code</label>
            <input name="token" inputmode="numeric" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
            <button class="mt-4 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">Send or verify OTP</button>
          </div>
        </form>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h2 class="text-lg font-semibold text-slate-900">What you get</h2>
        <ul class="mt-4 space-y-3 text-sm text-slate-600">
          <li>Appointments and calendar view</li>
          <li>Service, pricing, duration, and buffer management</li>
          <li>Work hours and off-day availability</li>
          <li>Billing overview tied to successful bookings</li>
          <li>Google Calendar and WhatsApp Cloud API settings</li>
        </ul>
      </section>
    </div>
  `;
}

function setupScreen(): string {
  return `
    <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <h1 class="text-2xl font-bold text-slate-900">Create your barber profile</h1>
      <p class="mt-3 text-sm text-slate-600">Set up the public booking identity and connection settings.</p>
      <form data-setup-form class="mt-6 grid gap-4 lg:grid-cols-2">
        ${profileFields()}
        <div class="lg:col-span-2">
          <button class="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">Save profile</button>
        </div>
      </form>
    </section>
  `;
}

function profileFields(profile?: DashboardProfile): string {
  const value = (v: string | number | null | undefined) => (v ?? '').toString();
  return `
    <input type="hidden" name="billing_percent" value="${value(profile?.billing_percent ?? 5)}" />
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-700">Display name</label>
      <input name="display_name" value="${value(profile?.display_name)}" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-700">Public slug</label>
      <input name="slug" value="${value(profile?.slug)}" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-700">Timezone</label>
      <input name="timezone" value="${value(profile?.timezone || 'Europe/Amsterdam')}" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-700">Per-booking rate</label>
      <input value="${formatCurrency(profile?.billing_unit_amount_cents ?? 25)}" disabled class="w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-500" />
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-700">Google Calendar ID</label>
      <input name="calendar_id" value="${value(profile?.calendar_id)}" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-700">Google service account email</label>
      <input name="google_service_account_email" value="${value(profile?.google_service_account_email)}" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
    </div>
    <div class="lg:col-span-2">
      <label class="mb-1 block text-sm font-medium text-slate-700">Google private key</label>
      <textarea name="google_private_key" rows="4" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500">${value(profile?.google_private_key)}</textarea>
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-700">WhatsApp phone number ID</label>
      <input name="whatsapp_phone_number_id" value="${value(profile?.whatsapp_phone_number_id)}" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-700">WhatsApp access token</label>
      <input name="whatsapp_access_token" value="${value(profile?.whatsapp_access_token)}" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-700">WhatsApp business account ID</label>
      <input name="whatsapp_business_account_id" value="${value(profile?.whatsapp_business_account_id)}" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
    </div>
  `;
}

function settingsScreen(profile: DashboardProfile): string {
  return `
    <div class="grid gap-6">
      <section class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Stripe billing</p>
            <p class="mt-2 text-sm text-slate-600">
              Charge customers monthly at €0.25 per successful appointment with Stripe metered billing.
            </p>
          </div>
          <div class="flex gap-2">
            <button data-stripe-connect type="button" class="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">
              ${profile.stripe_customer_id ? 'Reconnect Stripe' : 'Connect Stripe'}
            </button>
            <button data-stripe-portal type="button" class="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 ${profile.stripe_customer_id ? '' : 'hidden'}">
              Billing portal
            </button>
          </div>
        </div>
        <p class="mt-4 text-xs text-slate-500">
          Status: ${profile.stripe_subscription_status ?? 'not connected'} · Customer: ${profile.stripe_customer_id ?? 'none'}
        </p>
      </section>

      <form data-settings-form class="grid gap-4 lg:grid-cols-2">
        ${profileFields(profile)}
        <div class="lg:col-span-2">
          <button class="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">Save profile</button>
        </div>
      </form>
    </div>
  `;
}

function servicesScreen(services: Service[]): string {
  return `
    <div class="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form data-services-form class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <h3 class="text-base font-semibold text-slate-900">Add service</h3>
        <div class="mt-4 space-y-3">
          <input name="name" placeholder="Haircut" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          <input name="duration_minutes" type="number" value="30" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          <input name="price" type="number" step="0.01" value="25" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          <input name="buffer_minutes" type="number" value="0" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          <button class="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">Add service</button>
        </div>
      </form>

      <div class="space-y-3">
        ${services
          .map(
            (service) => `
              <div class="rounded-2xl border border-slate-200 p-4">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="font-semibold text-slate-900">${service.name}</p>
                    <p class="text-sm text-slate-500">${service.duration_minutes} min · buffer ${service.buffer_minutes} min · ${formatCurrency(service.price_cents)}</p>
                  </div>
                  <button data-service-delete="${service.id}" class="rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">Delete</button>
                </div>
              </div>
            `,
          )
          .join('')}
      </div>
    </div>
  `;
}

function availabilityScreen(rules: AvailabilityRule[], exceptions: AvailabilityException[]): string {
  const byWeekday = new Map(rules.map((rule) => [rule.weekday, rule]));
  return `
    <form data-availability-form class="space-y-6">
      <div class="grid gap-3">
        ${Array.from({ length: 7 }, (_, weekday) => {
          const rule = byWeekday.get(weekday);
          return `
            <div class="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[160px_1fr_1fr] md:items-center">
              <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input name="off_${weekday}" type="checkbox" ${rule?.is_off ? 'checked' : ''} class="h-4 w-4 rounded border-slate-300 text-brand-600" />
                ${weekdayName(weekday)}
              </label>
              <input name="start_${weekday}" value="${rule?.start_time ?? '09:00'}" type="time" class="rounded-xl border border-slate-300 px-4 py-3 text-sm" />
              <input name="end_${weekday}" value="${rule?.end_time ?? '17:00'}" type="time" class="rounded-xl border border-slate-300 px-4 py-3 text-sm" />
            </div>
          `;
        }).join('')}
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-slate-700">Off days (one YYYY-MM-DD per line)</label>
        <textarea name="exceptions" rows="4" class="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm">${exceptions.map((item) => item.date).join('\n')}</textarea>
      </div>

      <button class="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">Save availability</button>
    </form>
  `;
}

function billingScreen(summary: AppointmentStatusSummary, unitAmountCents: number, profile: DashboardProfile): string {
  return `
    <div class="grid gap-4 md:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 p-4">
        <p class="text-sm text-slate-500">Confirmed</p>
        <p class="mt-2 text-2xl font-bold">${summary.confirmed}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 p-4">
        <p class="text-sm text-slate-500">Estimated invoice</p>
        <p class="mt-2 text-2xl font-bold">${formatCurrency(summary.due_cents)}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 p-4">
        <p class="text-sm text-slate-500">Rate</p>
        <p class="mt-2 text-2xl font-bold">${formatCurrency(unitAmountCents)}</p>
      </div>
    </div>
    <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      Stripe status: ${profile.stripe_subscription_status ?? 'not connected'} · Connected customer: ${profile.stripe_customer_id ?? 'none'}
    </div>
  `;
}

function summaryCard(summary: AppointmentStatusSummary): string {
  return `
    <div class="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Billing snapshot</p>
      <div class="mt-4 grid gap-4 md:grid-cols-4">
        <div><p class="text-sm text-slate-500">Total</p><p class="text-xl font-bold">${summary.total}</p></div>
        <div><p class="text-sm text-slate-500">Confirmed</p><p class="text-xl font-bold">${summary.confirmed}</p></div>
        <div><p class="text-sm text-slate-500">Revenue</p><p class="text-xl font-bold">${formatCurrency(summary.revenue_cents)}</p></div>
        <div><p class="text-sm text-slate-500">Due</p><p class="text-xl font-bold">${formatCurrency(summary.due_cents)}</p></div>
      </div>
    </div>
  `;
}

function appointmentsTable(appointments: Appointment[], timezone: string): string {
  if (!appointments.length) {
    return '<p class="text-sm text-slate-500">No appointments yet.</p>';
  }

  return `
    <div class="overflow-hidden rounded-3xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-slate-500">
          <tr>
            <th class="px-4 py-3 text-left font-medium">Customer</th>
            <th class="px-4 py-3 text-left font-medium">Time</th>
            <th class="px-4 py-3 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">
          ${appointments
            .map(
              (item) => `
                <tr>
                  <td class="px-4 py-3">
                    <p class="font-medium text-slate-900">${item.customer_name}</p>
                    <p class="text-slate-500">${item.customer_phone}</p>
                  </td>
                  <td class="px-4 py-3">${formatDateTime(item.start_at, timezone)}<br />${formatTimeRange(item.start_at, item.end_at, timezone)}</td>
                  <td class="px-4 py-3">${item.status}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function weekdayName(weekday: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday] ?? 'Day';
}
