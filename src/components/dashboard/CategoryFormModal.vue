<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toErrorMessage } from '../../shared/api';
import { AuthJsonKey, CategoriesKey, RefreshDataKey } from '../../shared/inject-keys';

const route = useRoute();
const router = useRouter();
const authJson = inject(AuthJsonKey)!;
const refreshData = inject(RefreshDataKey)!;
const categories = inject(CategoriesKey)!;

const isEdit = computed(() => !!route.params.id);
const existing = computed(() => categories.value.find((c) => c.id === route.params.id));

const form = ref({
  name: existing.value?.name ?? '',
});

const uiError = ref('');
const busy = ref(false);

const close = () => router.push('/dashboard');

const save = async () => {
  uiError.value = '';
  busy.value = true;
  try {
    await authJson('/api/dashboard/categories', {
      method: 'POST',
      body: JSON.stringify({
        id: isEdit.value ? route.params.id : undefined,
        name: form.value.name,
        sort_order: categories.value.length,
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
    <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
      <h3 class="mb-4 text-lg font-semibold text-slate-900">{{ isEdit ? 'Edit category' : 'Add category' }}</h3>
      <p v-if="uiError" class="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ uiError }}</p>
      <form class="grid gap-4" @submit.prevent="save">
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Category name</label>
          <input v-model="form.name" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="e.g. Hair" />
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="close">Cancel</button>
          <button class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" :disabled="busy">
            <svg v-if="busy" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-2a8 8 0 01-8-8z" />
            </svg>
            {{ isEdit ? 'Update' : 'Add' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
