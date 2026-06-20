<script setup lang="ts">
import { inject, ref } from 'vue';
import { useRouter } from 'vue-router';
import { toErrorMessage } from '../../shared/api';
import { formatCurrency } from '../../shared/format';
import type { Service, ServiceCategory } from '../../shared/types';
import { AuthJsonKey, RefreshDataKey } from '../../shared/inject-keys';
import SpinnerIcon from '../SpinnerIcon.vue';

const props = defineProps<{
  services: Service[];
  categories: ServiceCategory[];
  loading?: boolean;
}>();

const router = useRouter();
const authJson = inject(AuthJsonKey)!;
const refreshData = inject(RefreshDataKey)!;

const uiError = ref('');
const busy = ref(false);

const deleteService = async (id: string) => {
  uiError.value = '';
  busy.value = true;
  try {
    await authJson('/api/dashboard/services', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await refreshData();
  } catch (e) {
    uiError.value = toErrorMessage(e);
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <article class="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h2 class="text-xl font-semibold text-slate-900">Services</h2>
        <SpinnerIcon v-if="loading || busy" class="h-4 w-4 text-slate-400" />
      </div>
      <button class="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" @click="router.push('/dashboard/services/new')">
        Add service
      </button>
    </div>
    <p v-if="uiError" class="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ uiError }}</p>
    <div v-if="loading && !services.length" class="mt-4 space-y-2">
      <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-xl bg-slate-100" />
    </div>
    <div v-else class="mt-4 grid gap-3 transition-opacity" :class="{ 'opacity-50 pointer-events-none': loading || busy }">
      <div v-for="service in services" :key="service.id" class="rounded-xl border border-slate-200 p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <img v-if="service.thumbnail_url" :src="service.thumbnail_url" class="h-10 w-10 rounded-lg object-cover" />
            <div v-else class="h-10 w-10 rounded-lg bg-slate-100"></div>
            <div>
              <p class="font-semibold text-slate-900">{{ service.name }}</p>
              <p class="text-sm text-slate-500">{{ service.duration_minutes }} min · {{ formatCurrency(service.price_cents) }}</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="rounded-lg border border-slate-300 px-3 py-1 text-sm" @click="router.push(`/dashboard/services/${service.id}`)">Edit</button>
            <button class="rounded-lg border border-rose-300 px-3 py-1 text-sm text-rose-700" @click="deleteService(service.id)">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>
