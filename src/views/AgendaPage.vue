<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import SpinnerIcon from '../components/SpinnerIcon.vue';
import { fetchJson, toErrorMessage } from '../shared/api';
import { supabase } from '../shared/supabase';
import type { AppUser, Appointment } from '../shared/types';

type MeResponse = {
  appUser: AppUser;
};

type CalendarDay = {
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  appointments: Appointment[];
};

const router = useRouter();

const authStatus = ref('Checking session...');
const sessionToken = ref<string | null>(null);
const role = ref<AppUser['role'] | null>(null);
const appointments = ref<Appointment[]>([]);
const loading = ref(true);
const uiError = ref('');
const monthStart = ref(startOfMonth(new Date()));

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(monthStart.value),
);

const calendarDays = computed<CalendarDay[]>(() => {
  const first = monthStart.value;
  const startWeekday = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startWeekday);

  const out: CalendarDay[] = [];
  const bucket = appointmentsByDate.value;
  const currentMonth = first.getMonth();
  const currentYear = first.getFullYear();

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const key = dateToKey(date);
    out.push({
      dateKey: key,
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === currentMonth && date.getFullYear() === currentYear,
      isToday: key === dateToKey(new Date()),
      appointments: bucket.get(key) ?? [],
    });
  }

  return out;
});

const appointmentsByDate = computed(() => {
  const bucket = new Map<string, Appointment[]>();
  for (const appointment of appointments.value) {
    const key = toLocalDateKey(appointment.start_at);
    const list = bucket.get(key);
    if (list) {
      list.push(appointment);
    } else {
      bucket.set(key, [appointment]);
    }
  }

  for (const dayAppointments of bucket.values()) {
    dayAppointments.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }

  return bucket;
});

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

const loadAgenda = async () => {
  loading.value = true;
  uiError.value = '';
  try {
    appointments.value = await authJson<Appointment[]>('/api/dashboard/appointments');
  } catch (error) {
    uiError.value = toErrorMessage(error);
  } finally {
    loading.value = false;
  }
};

const goToPreviousMonth = () => {
  const next = new Date(monthStart.value);
  next.setMonth(next.getMonth() - 1);
  monthStart.value = startOfMonth(next);
};

const goToNextMonth = () => {
  const next = new Date(monthStart.value);
  next.setMonth(next.getMonth() + 1);
  monthStart.value = startOfMonth(next);
};

const goToCurrentMonth = () => {
  monthStart.value = startOfMonth(new Date());
};

const signOut = async () => {
  await supabase.auth.signOut();
  await router.replace('/');
};

onMounted(async () => {
  const { data } = await supabase.auth.getSession();
  sessionToken.value = data.session?.access_token ?? null;
  if (!sessionToken.value) {
    await router.replace({ path: '/dashboard', query: { next: '/agenda' } });
    return;
  }

  authStatus.value = `Signed in as ${data.session?.user.email ?? data.session?.user.phone ?? 'user'}`;
  const me = await authJson<MeResponse>('/api/dashboard/me');
  role.value = me.appUser.role;
  await loadAgenda();
});

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toLocalDateKey(iso: string): string {
  const date = new Date(iso);
  return dateToKey(date);
}

function dateToKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function appointmentStatusClass(status: Appointment['status']): string {
  switch (status) {
    case 'confirmed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'completed':
      return 'bg-brand-50 text-brand-700 border-brand-200';
    case 'cancelled':
    case 'no_show':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(value));
}
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
          to="/dashboard"
          class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Dashboard
        </RouterLink>
        <button
          class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </div>

    <p v-if="uiError" class="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ uiError }}</p>

    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-semibold text-slate-900">Agenda</h1>
          <SpinnerIcon v-if="loading" class="h-4 w-4 text-slate-400" />
        </div>
        <p v-if="role === 'employee'" class="text-sm text-slate-500">Showing your personal agenda.</p>
        <div class="ml-auto flex items-center gap-2">
          <button class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700" @click="goToPreviousMonth">
            Prev
          </button>
          <button class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700" @click="goToCurrentMonth">
            Today
          </button>
          <button class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700" @click="goToNextMonth">
            Next
          </button>
        </div>
      </div>

      <p class="mt-2 text-sm text-slate-500">{{ monthLabel }}</p>

      <div v-if="loading && !appointments.length" class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <div v-for="i in 14" :key="i" class="h-28 animate-pulse rounded-xl bg-slate-100" />
      </div>

      <div v-else class="mt-4 transition-opacity" :class="{ 'opacity-50': loading }">
        <div class="grid grid-cols-7 gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <p v-for="label in weekdayLabels" :key="label" class="px-2 py-1">{{ label }}</p>
        </div>

        <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          <article
            v-for="day in calendarDays"
            :key="day.dateKey"
            class="flex min-h-28 flex-col rounded-xl border p-2"
            :class="[
              day.inCurrentMonth ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50',
              day.isToday ? 'ring-2 ring-brand-200' : '',
            ]"
          >
            <p class="text-xs font-semibold" :class="day.inCurrentMonth ? 'text-slate-800' : 'text-slate-400'">
              {{ day.dayNumber }}
            </p>
            <div class="mt-2 space-y-1 overflow-y-auto">
              <div
                v-for="appointment in day.appointments"
                :key="appointment.id"
                class="rounded-md border px-2 py-1 text-xs"
                :class="appointmentStatusClass(appointment.status)"
              >
                <p class="font-semibold text-slate-900">{{ appointment.customer_name }}</p>
                <p class="text-slate-600">{{ formatTime(appointment.start_at) }}</p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  </main>
</template>
