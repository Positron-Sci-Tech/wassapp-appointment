<script setup lang="ts">
import { inject, ref } from 'vue';
import { useRouter } from 'vue-router';
import { toErrorMessage } from '../../shared/api';
import { AuthJsonKey, RefreshDataKey } from '../../shared/inject-keys';

const router = useRouter();
const authJson = inject(AuthJsonKey)!;
const refreshData = inject(RefreshDataKey)!;

const form = ref({
  display_name: '',
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
    const response = await authJson<{ inviteLink: string }>('/api/dashboard/admin/salons', {
      method: 'POST',
      body: JSON.stringify({
        display_name: form.value.display_name,
        email: form.value.email,
      }),
    });
    await refreshData();
    inviteLink.value = response.inviteLink;
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
      <div v-if="inviteLink" class="grid gap-4">
        <h3 class="text-lg font-semibold text-slate-900">Salon created</h3>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Invite link: <a class="underline" :href="inviteLink">{{ inviteLink }}</a>
        </div>
        <div class="flex justify-end">
          <button class="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white" @click="close">Done</button>
        </div>
      </div>
      <template v-else>
        <h3 class="mb-4 text-lg font-semibold text-slate-900">Create salon + invite</h3>
        <p v-if="uiError" class="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ uiError }}</p>
        <form class="grid gap-4" @submit.prevent="save">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Salon / client name</label>
            <input v-model="form.display_name" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="e.g. Barber House" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Owner email</label>
            <input v-model="form.email" type="email" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" placeholder="owner@example.com" />
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="close">Cancel</button>
            <button class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" :disabled="busy">
              <svg v-if="busy" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-2a8 8 0 01-8-8z" />
              </svg>
              Create salon + invite
            </button>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>
