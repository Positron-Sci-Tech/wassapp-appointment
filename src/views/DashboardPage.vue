<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { supabase } from '../shared/supabase';
import { fetchJson, toErrorMessage } from '../shared/api';
import type { AppUser, Salon, Service, ServiceCategory } from '../shared/types';
import type { BarberWithServices } from '../shared/inject-keys';
import { AuthJsonKey, BarbersKey, CategoriesKey, RefreshDataKey, ServicesKey } from '../shared/inject-keys';
import ServicesSection from '../components/dashboard/ServicesSection.vue';
import SpinnerIcon from '../components/SpinnerIcon.vue';

type MeResponse = {
  appUser: AppUser;
  salon: Salon | null;
  barber: null;
};

type AuthMethod = 'email' | 'phone';

const route = useRoute();
const router = useRouter();

const authMethod = ref<AuthMethod>('email');
const authStatus = ref('Checking session...');
const sessionToken = ref<string | null>(null);
const me = ref<MeResponse | null>(null);
const services = ref<Service[]>([]);
const categories = ref<ServiceCategory[]>([]);
const barbers = ref<BarberWithServices[]>([]);
const adminSalons = ref<Salon[]>([]);
const adminUsers = ref<AppUser[]>([]);
const uiError = ref('');
const uiSuccess = ref('');
const busy = ref(false);
const initialLoading = ref(true);
const dataLoading = ref(false);

const profileForm = ref({
  display_name: '',
  slug: '',
  allow_multi_service_selection: false,
});

const isSignedIn = computed(() => !!sessionToken.value);
const role = computed(() => me.value?.appUser.role ?? null);
const isAdmin = computed(() => role.value === 'administrator');
const isSalon = computed(() => role.value === 'salon');
const canManageSalon = computed(() => isSalon.value);

const runAction = async (fn: () => Promise<void>, successMessage = '') => {
  uiError.value = '';
  uiSuccess.value = '';
  busy.value = true;
  try {
    await fn();
    if (successMessage) {
      uiSuccess.value = successMessage;
    }
  } catch (error) {
    uiError.value = toErrorMessage(error);
  } finally {
    busy.value = false;
  }
};

const authJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  if (!sessionToken.value) {
    throw new Error('Missing session token');
  }
  return fetchJson<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${sessionToken.value}`,
      ...(init?.headers ?? {}),
    },
  });
};

const refreshData = async () => {
  if (!me.value) return;
  dataLoading.value = true;
  try {
    if (isAdmin.value) {
      adminSalons.value = await authJson<Salon[]>('/api/dashboard/admin/salons');
      adminUsers.value = await authJson<AppUser[]>('/api/dashboard/admin/users');
      return;
    }

    if (me.value.salon) {
      profileForm.value.display_name = me.value.salon.display_name;
      profileForm.value.slug = me.value.salon.slug ?? '';
      profileForm.value.allow_multi_service_selection = me.value.salon.allow_multi_service_selection;
    }

    services.value = await authJson<Service[]>('/api/dashboard/services');
    categories.value = await authJson<ServiceCategory[]>('/api/dashboard/categories');

    if (isSalon.value) {
      barbers.value = await authJson<BarberWithServices[]>('/api/dashboard/barbers');
    } else {
      barbers.value = [];
    }
  } finally {
    dataLoading.value = false;
  }
};

provide(AuthJsonKey, authJson);
provide(RefreshDataKey, refreshData);
provide(ServicesKey, services);
provide(CategoriesKey, categories);
provide(BarbersKey, barbers);
provide('dataLoading', dataLoading);

const refreshSession = async () => {
  const { data } = await supabase.auth.getSession();
  sessionToken.value = data.session?.access_token ?? null;
  if (!sessionToken.value) {
    authStatus.value = 'Signed out';
    me.value = null;
    return;
  }
  authStatus.value = `Signed in as ${data.session?.user.email ?? data.session?.user.phone ?? 'user'}`;
  me.value = await authJson<MeResponse>('/api/dashboard/me');
  await refreshData();
};

const signInEmail = async (event: Event) => {
  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '').trim();

  await runAction(async () => {
    authStatus.value = 'Signing in...';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    authStatus.value = 'Signed in';
    await refreshSession();
    const next = String(route.query.next ?? '/dashboard');
    await router.replace(next);
  });
};

const signInPhone = async (event: Event) => {
  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const phone = String(formData.get('phone') ?? '').trim();
  const token = String(formData.get('token') ?? '').trim();

  await runAction(async () => {
    if (!token) {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) {
        throw error;
      }
      authStatus.value = 'OTP sent. Enter the code to continue.';
      return;
    }
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) {
      throw error;
    }
    authStatus.value = 'Signed in';
    await refreshSession();
    const next = String(route.query.next ?? '/dashboard');
    await router.replace(next);
  });
};

const signOut = async () => {
  await runAction(async () => {
    await supabase.auth.signOut();
    await refreshSession();
    await router.replace('/');
  }, 'Signed out.');
};

const saveProfile = async () => {
  await runAction(async () => {
    await authJson('/api/dashboard/profile', {
      method: 'PUT',
      body: JSON.stringify({
        display_name: profileForm.value.display_name,
        slug: profileForm.value.slug || null,
        allow_multi_service_selection: profileForm.value.allow_multi_service_selection,
        billing_percent: 5,
      }),
    });
    await refreshSession();
  }, 'Profile saved.');
};

const deleteCategory = async (id: string) => {
  await runAction(async () => {
    await authJson('/api/dashboard/categories', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await refreshData();
  }, 'Category deleted.');
};

const deleteBarber = async (id: string) => {
  await runAction(async () => {
    await authJson('/api/dashboard/barbers', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await refreshData();
  }, 'Employee deleted.');
};

const deleteSalonClient = async (id: string) => {
  await runAction(async () => {
    await authJson('/api/dashboard/admin/salons', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await refreshData();
  }, 'Salon deleted.');
};

const deleteUser = async (id: string) => {
  await runAction(async () => {
    await authJson('/api/dashboard/admin/users', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await refreshData();
  }, 'User deleted.');
};

onMounted(async () => {
  await runAction(async () => {
    await refreshSession();
  });
  initialLoading.value = false;
});
</script>

<template>
  <main class="mx-auto min-h-screen max-w-7xl px-4 py-8">
    <div class="mb-6 flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Wassapp Appointment</p>
        <p class="mt-1 text-sm text-slate-500">{{ authStatus }}</p>
      </div>
      <div class="flex items-center gap-2">
        <RouterLink
          v-if="isSignedIn"
          to="/agenda"
          class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Agenda
        </RouterLink>
        <RouterLink
          v-if="isSignedIn"
          to="/dashboard/widget-preview"
          class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Widget preview
        </RouterLink>
        <button
          v-if="isSignedIn"
          class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </div>

    <p v-if="uiError" class="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ uiError }}</p>
    <p v-if="uiSuccess" class="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{{ uiSuccess }}</p>

    <!-- Initial auth check -->
    <div v-if="initialLoading" class="flex flex-col items-center justify-center py-24 gap-3">
      <SpinnerIcon class="h-8 w-8 text-brand-600" />
      <p class="text-sm text-slate-500">Loading…</p>
    </div>

    <section v-else-if="!isSignedIn" class="grid gap-6 lg:grid-cols-2">
      <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h1 class="text-2xl font-bold text-slate-900">Dashboard sign in</h1>
        <p class="mt-3 text-sm text-slate-600">Use email/password or phone OTP to sign in.</p>
        <div class="mt-4 flex gap-2">
          <button
            class="rounded-xl px-4 py-2 text-sm font-semibold"
            :class="authMethod === 'email' ? 'bg-brand-600 text-white' : 'border border-slate-300 text-slate-700'"
            @click="authMethod = 'email'"
          >
            Email
          </button>
          <button
            class="rounded-xl px-4 py-2 text-sm font-semibold"
            :class="authMethod === 'phone' ? 'bg-brand-600 text-white' : 'border border-slate-300 text-slate-700'"
            @click="authMethod = 'phone'"
          >
            Phone
          </button>
        </div>

        <form v-if="authMethod === 'email'" class="mt-6 space-y-4" @submit.prevent="signInEmail">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input name="email" type="email" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input name="password" type="password" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          </div>
          <button class="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">Sign in</button>
        </form>

        <form v-else class="mt-6 space-y-4" @submit.prevent="signInPhone">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Phone number</label>
            <input name="phone" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">OTP code (optional)</label>
            <input name="token" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          </div>
          <button class="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">Send/verify OTP</button>
        </form>
      </article>
    </section>

    <section v-else class="grid gap-6">
      <article v-if="isSalon && me?.salon" class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 class="text-xl font-semibold text-slate-900">Salon profile</h2>
        <form class="mt-4 grid gap-3 md:grid-cols-2" @submit.prevent="saveProfile">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Salon name</label>
            <input v-model="profileForm.display_name" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Slug</label>
            <input v-model="profileForm.slug" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
          </div>
          <label class="md:col-span-2 inline-flex items-center gap-2 text-sm text-slate-700">
            <input v-model="profileForm.allow_multi_service_selection" type="checkbox" />
            Customers may select multiple services
          </label>
          <div class="md:col-span-2">
            <button
              class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              :disabled="busy"
            >
              <svg v-if="busy" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-2a8 8 0 01-8-8z" />
              </svg>
              Save profile
            </button>
          </div>
        </form>
      </article>

      <article v-if="canManageSalon" class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-xl font-semibold text-slate-900">Service categories</h2>
            <SpinnerIcon v-if="dataLoading" class="h-4 w-4 text-slate-400" />
          </div>
          <button class="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" @click="router.push('/dashboard/categories/new')">Add category</button>
        </div>
        <div v-if="dataLoading && !categories.length" class="mt-4 space-y-2">
          <div v-for="i in 3" :key="i" class="h-12 animate-pulse rounded-xl bg-slate-100" />
        </div>
        <div v-else class="mt-4 grid gap-2 transition-opacity" :class="{ 'opacity-50 pointer-events-none': dataLoading }">
          <div v-for="category in categories" :key="category.id" class="flex items-center justify-between rounded-xl border border-slate-200 p-3">
            <p>{{ category.name }}</p>
            <div class="flex gap-2">
              <button class="rounded-lg border border-slate-300 px-3 py-1 text-sm" @click="router.push(`/dashboard/categories/${category.id}`)">Edit</button>
              <button class="rounded-lg border border-rose-300 px-3 py-1 text-sm text-rose-700" @click="deleteCategory(category.id)">Delete</button>
            </div>
          </div>
        </div>
      </article>

      <ServicesSection v-if="canManageSalon" :services="services" :categories="categories" :loading="dataLoading" />

      <article v-if="isSalon" class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-xl font-semibold text-slate-900">Barbers / employees</h2>
            <SpinnerIcon v-if="dataLoading" class="h-4 w-4 text-slate-400" />
          </div>
          <button class="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" @click="router.push('/dashboard/barbers/new')">Add employee</button>
        </div>

        <div v-if="dataLoading && !barbers.length" class="mt-4 space-y-2">
          <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-xl bg-slate-100" />
        </div>
        <div v-else class="mt-4 grid gap-3 transition-opacity" :class="{ 'opacity-50 pointer-events-none': dataLoading }">
          <div v-for="barber in barbers" :key="barber.id" class="rounded-xl border border-slate-200 p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <img v-if="barber.thumbnail_url" :src="barber.thumbnail_url" class="h-10 w-10 rounded-lg object-cover" />
                <div v-else class="h-10 w-10 rounded-lg bg-slate-100"></div>
                <div>
                  <p class="font-semibold text-slate-900">{{ barber.display_name }}</p>
                  <p class="text-sm text-slate-500">{{ barber.active ? 'Active' : 'Inactive' }} · {{ barber.timezone }}</p>
                </div>
              </div>
              <div class="flex gap-2">
                <button class="rounded-lg border border-slate-300 px-3 py-1 text-sm" @click="router.push(`/dashboard/barbers/${barber.id}`)">Edit</button>
                <button class="rounded-lg border border-rose-300 px-3 py-1 text-sm text-rose-700" @click="deleteBarber(barber.id)">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article v-if="isAdmin" class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-xl font-semibold text-slate-900">Administrator: salons/clients</h2>
            <SpinnerIcon v-if="dataLoading" class="h-4 w-4 text-slate-400" />
          </div>
          <button class="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" @click="router.push('/dashboard/salons/new')">Add salon</button>
        </div>

        <div v-if="dataLoading && !adminSalons.length" class="mt-4 space-y-2">
          <div v-for="i in 3" :key="i" class="h-14 animate-pulse rounded-xl bg-slate-100" />
        </div>
        <div v-else class="mt-4 grid gap-2 transition-opacity" :class="{ 'opacity-50 pointer-events-none': dataLoading }">
          <div v-for="salon in adminSalons" :key="salon.id" class="flex items-center justify-between rounded-xl border border-slate-200 p-3">
            <div>
              <p class="font-medium text-slate-900">{{ salon.display_name }}</p>
              <p class="text-sm text-slate-500">Slug: {{ salon.slug || 'not set' }}</p>
            </div>
            <button class="rounded-lg border border-rose-300 px-3 py-1 text-sm text-rose-700" @click="deleteSalonClient(salon.id)">Delete</button>
          </div>
        </div>
      </article>

      <article v-if="isAdmin" class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-semibold text-slate-900">Administrator: users</h2>
          <SpinnerIcon v-if="dataLoading" class="h-4 w-4 text-slate-400" />
        </div>
        <div v-if="dataLoading && !adminUsers.length" class="mt-4 space-y-2">
          <div v-for="i in 4" :key="i" class="h-12 animate-pulse rounded-xl bg-slate-100" />
        </div>
        <div v-else class="mt-4 overflow-hidden rounded-2xl border border-slate-200 transition-opacity" :class="{ 'opacity-50': dataLoading }">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-slate-500">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Role</th>
                <th class="px-4 py-3 text-left font-medium">Email</th>
                <th class="px-4 py-3 text-left font-medium">Name</th>
                <th class="px-4 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 bg-white">
              <tr v-for="user in adminUsers" :key="user.id">
                <td class="px-4 py-3">{{ user.role }}</td>
                <td class="px-4 py-3">{{ user.email }}</td>
                <td class="px-4 py-3">{{ user.display_name }}</td>
                <td class="px-4 py-3 text-right">
                  <button class="rounded-lg border border-rose-300 px-3 py-1 text-sm text-rose-700" @click="deleteUser(user.id)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <RouterView />
  </main>
</template>
