<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toErrorMessage } from '../../shared/api';
import { AuthJsonKey, BarbersKey, RefreshDataKey, ServicesKey } from '../../shared/inject-keys';

const route = useRoute();
const router = useRouter();
const authJson = inject(AuthJsonKey)!;
const refreshData = inject(RefreshDataKey)!;
const services = inject(ServicesKey)!;
const barbers = inject(BarbersKey)!;

const isEdit = computed(() => !!route.params.id);
const existing = computed(() => barbers.value.find((b) => b.id === route.params.id));

const form = ref({
  display_name: existing.value?.display_name ?? '',
  thumbnail_url: existing.value?.thumbnail_url ?? '',
  timezone: existing.value?.timezone ?? 'Europe/Amsterdam',
  active: existing.value?.active ?? true,
  service_ids: existing.value ? [...existing.value.service_ids] : ([] as string[]),
  email: '',
});

const uiError = ref('');
const busy = ref(false);
const inviteLink = ref('');

const close = () => router.push('/dashboard');

const save = async () => {
  uiError.value = '';
  busy.value = true;
  try {
    const response = await authJson<{ inviteLink?: string }>('/api/dashboard/barbers', {
      method: 'POST',
      body: JSON.stringify({
        id: isEdit.value ? route.params.id : undefined,
        display_name: form.value.display_name,
        thumbnail_url: form.value.thumbnail_url || null,
        timezone: form.value.timezone,
        active: form.value.active,
        service_ids: form.value.service_ids,
        email: form.value.email || undefined,
      }),
    });
    await refreshData();
    inviteLink.value = response.inviteLink ?? '';
    if (!inviteLink.value) {
      close();
    }
  } catch (e) {
    uiError.value = toErrorMessage(e);
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="close">
    <div class="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
      <div v-if="inviteLink" class="grid gap-4">
        <h3 class="text-lg font-semibold text-slate-900">Employee saved</h3>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Invite link: <a class="underline" :href="inviteLink">{{ inviteLink }}</a>
        </div>
        <div class="flex justify-end">
          <button class="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" @click="close">Done</button>
        </div>
      </div>
      <template v-else>
        <h3 class="mb-4 text-lg font-semibold text-slate-900">{{ isEdit ? 'Edit employee' : 'Add employee' }}</h3>
        <p v-if="uiError" class="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ uiError }}</p>
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="save">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Display name</label>
            <input v-model="form.display_name" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="e.g. Anna" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Thumbnail URL (optional)</label>
            <input v-model="form.thumbnail_url" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="https://..." />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Timezone</label>
            <input v-model="form.timezone" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="Europe/Amsterdam" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Employee email (optional — sends invite)</label>
            <input v-model="form.email" type="email" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="anna@example.com" />
          </div>
          <div class="md:col-span-2 grid gap-2">
            <label class="text-sm font-medium text-slate-700">Services this employee offers</label>
            <div class="grid gap-2 sm:grid-cols-2">
              <label v-for="service in services" :key="service.id" class="inline-flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                <input v-model="form.service_ids" type="checkbox" :value="service.id" />
                <span>{{ service.name }}</span>
              </label>
            </div>
          </div>
          <label class="md:col-span-2 inline-flex items-center gap-2 text-sm text-slate-700">
            <input v-model="form.active" type="checkbox" />
            Active
          </label>
          <div class="md:col-span-2 flex justify-end gap-2">
            <button type="button" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="close">Cancel</button>
            <button class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" :disabled="busy">
              <svg v-if="busy" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-2a8 8 0 01-8-8z" />
              </svg>
              {{ isEdit ? 'Update' : 'Add' }} employee
            </button>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>
