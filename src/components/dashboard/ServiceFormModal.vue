<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toErrorMessage } from '../../shared/api';
import { AuthJsonKey, CategoriesKey, RefreshDataKey, ServicesKey } from '../../shared/inject-keys';

const route = useRoute();
const router = useRouter();
const authJson = inject(AuthJsonKey)!;
const refreshData = inject(RefreshDataKey)!;
const services = inject(ServicesKey)!;
const categories = inject(CategoriesKey)!;

const isEdit = computed(() => !!route.params.id);
const existing = computed(() => services.value.find((s) => s.id === route.params.id));

const form = ref({
  name: existing.value?.name ?? '',
  duration_minutes: existing.value?.duration_minutes ?? 30,
  price: existing.value ? existing.value.price_cents / 100 : 25,
  buffer_minutes: existing.value?.buffer_minutes ?? 0,
  thumbnail_url: existing.value?.thumbnail_url ?? '',
  category_id: existing.value?.category_id ?? '',
});

const uiError = ref('');
const busy = ref(false);

const close = () => router.push('/dashboard');

const save = async () => {
  uiError.value = '';
  busy.value = true;
  try {
    await authJson('/api/dashboard/services', {
      method: 'POST',
      body: JSON.stringify({
        id: isEdit.value ? route.params.id : undefined,
        name: form.value.name,
        duration_minutes: Number(form.value.duration_minutes),
        price_cents: Math.round(Number(form.value.price) * 100),
        buffer_minutes: Number(form.value.buffer_minutes),
        thumbnail_url: form.value.thumbnail_url || null,
        category_id: form.value.category_id || null,
        active: true,
      }),
    });
    await refreshData();
    close();
  } catch (e) {
    uiError.value = toErrorMessage(e);
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="close">
    <div class="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl">
      <h3 class="mb-4 text-lg font-semibold text-slate-900">{{ isEdit ? 'Edit service' : 'Add service' }}</h3>
      <p v-if="uiError" class="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ uiError }}</p>
      <form class="grid gap-4 md:grid-cols-2" @submit.prevent="save">
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Service name</label>
          <input v-model="form.name" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="e.g. Haircut" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Duration (minutes)</label>
          <input v-model.number="form.duration_minutes" type="number" min="1" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="30" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Price (€)</label>
          <input v-model.number="form.price" type="number" step="0.01" min="0" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="25.00" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Buffer after (minutes)</label>
          <input v-model.number="form.buffer_minutes" type="number" min="0" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="0" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Thumbnail URL (optional)</label>
          <input v-model="form.thumbnail_url" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="https://..." />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Category (optional)</label>
          <select v-model="form.category_id" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm">
            <option value="">No category</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
          </select>
        </div>
        <div class="md:col-span-2 flex justify-end gap-2">
          <button type="button" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="close">Cancel</button>
          <button class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" :disabled="busy">
            <svg v-if="busy" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-2a8 8 0 01-8-8z" />
            </svg>
            {{ isEdit ? 'Update' : 'Add' }} service
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
