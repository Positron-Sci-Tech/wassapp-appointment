<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { fetchJson } from '../shared/api';
import { formatDateTime } from '../shared/format';
import type { Appointment } from '../shared/types';

const route = useRoute();
const loading = ref(true);
const error = ref('');
const status = ref('');
const appointment = ref<Appointment | null>(null);
const cancelling = ref(false);

const token = computed(() => String(route.query.token ?? ''));

const load = async () => {
  if (!token.value) {
    error.value = 'Missing cancellation token.';
    loading.value = false;
    return;
  }

  try {
    appointment.value = await fetchJson<Appointment>(`/api/cancel?token=${encodeURIComponent(token.value)}`);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load appointment.';
  } finally {
    loading.value = false;
  }
};

const cancelAppointment = async () => {
  if (!token.value || !appointment.value) return;
  cancelling.value = true;
  status.value = 'Cancelling...';

  try {
    await fetchJson('/api/cancel', {
      method: 'POST',
      body: JSON.stringify({ token: token.value }),
    });
    status.value = 'Appointment cancelled. A confirmation has been sent.';
  } catch (err) {
    status.value = err instanceof Error ? err.message : 'Cancellation failed.';
    cancelling.value = false;
  }
};

onMounted(() => {
  void load();
});
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
    <section class="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Cancel appointment</p>

      <p v-if="loading" class="mt-3 text-sm text-slate-600">Loading cancellation page...</p>

      <template v-else-if="error">
        <h1 class="mt-3 text-2xl font-bold text-slate-900">Cancellation unavailable</h1>
        <p class="mt-3 text-sm text-slate-600">{{ error }}</p>
      </template>

      <template v-else-if="appointment">
        <h1 class="mt-3 text-2xl font-bold text-slate-900">Confirm cancellation</h1>
        <p class="mt-3 text-sm text-slate-600">
          {{ appointment.customer_name }}, your appointment on {{ formatDateTime(appointment.start_at) }} is ready to cancel.
        </p>
        <button
          :disabled="cancelling"
          class="mt-6 w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          @click="cancelAppointment"
        >
          {{ cancelling ? 'Cancelled' : 'Cancel appointment' }}
        </button>
        <p class="mt-4 text-sm text-slate-500">{{ status }}</p>
      </template>
    </section>
  </main>
</template>
