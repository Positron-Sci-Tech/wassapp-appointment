<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { supabase } from '../shared/supabase';
import { fetchJson } from '../shared/api';
import { mountWidget } from '../widget';
import type { AppUser, Barber, Salon } from '../shared/types';

type MeResponse = {
  appUser: AppUser;
  salon: Salon | null;
  barber: Barber | null;
};

const rootEl = ref<HTMLElement | null>(null);
const salonSlug = ref('');
const status = ref('Loading preview...');
const error = ref('');
const loading = ref(true);
const previewBusy = ref(false);

const loadDefaultSalon = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Missing session');
  }

  const me = await fetchJson<MeResponse>('/api/dashboard/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (me.salon?.slug) {
    salonSlug.value = me.salon.slug;
  }
};

const mountPreview = async () => {
  if (!rootEl.value) return;
  if (!salonSlug.value) {
    error.value = 'Set a salon slug first.';
    return;
  }

  error.value = '';
  previewBusy.value = true;
  status.value = 'Rendering widget preview...';
  try {
    await mountWidget(rootEl.value, { salonSlug: salonSlug.value });
    status.value = 'Preview loaded.';
  } finally {
    previewBusy.value = false;
  }
};

onMounted(async () => {
  try {
    await loadDefaultSalon();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load preview.';
  } finally {
    loading.value = false;
    // Wait for Vue to render the v-else branch so rootEl becomes available.
    await nextTick();
  }

  if (salonSlug.value) {
    await mountPreview().catch((err) => {
      error.value = err instanceof Error ? err.message : 'Failed to load widget.';
    });
  } else if (!error.value) {
    status.value = 'No salon slug found for this account.';
  }
});
</script>

<template>
  <main class="mx-auto min-h-screen max-w-6xl px-4 py-8">
    <div class="mb-6 flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Widget preview</p>
        <p class="mt-1 text-sm text-slate-500">Private preview route for authenticated dashboard users.</p>
      </div>
      <RouterLink to="/dashboard" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Back to dashboard
      </RouterLink>
    </div>

    <section class="mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
      <div class="flex flex-col gap-3 md:flex-row md:items-end">
        <div class="flex-1">
          <label class="mb-1 block text-sm font-medium text-slate-700">Salon slug</label>
          <input v-model="salonSlug" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="your-salon-slug" />
        </div>
        <button
          class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          :disabled="previewBusy"
          @click="mountPreview"
        >
          <svg v-if="previewBusy" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-2a8 8 0 01-8-8z" />
          </svg>
          Reload preview
        </button>
      </div>
      <p class="mt-3 text-sm text-slate-500">{{ status }}</p>
      <p v-if="error" class="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</p>
    </section>

    <section v-if="loading" class="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-soft">
      Loading preview...
    </section>
    <section v-else ref="rootEl"></section>
  </main>
</template>
