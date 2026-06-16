import { fetchJson } from './shared/api';
import { formatDateTime } from './shared/format';
import type { Appointment } from './shared/types';

export async function mountCancellation(root: HTMLElement): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    root.innerHTML = errorShell('Missing cancellation token.');
    return;
  }

  root.innerHTML = '<div class="mx-auto max-w-xl px-4 py-16 text-center text-slate-600">Loading cancellation page...</div>';

  const appointment = await fetchJson<Appointment>(`/api/cancel?token=${encodeURIComponent(token)}`);

  root.innerHTML = `
    <main class="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
      <section class="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Cancel appointment</p>
        <h1 class="mt-3 text-2xl font-bold text-slate-900">Confirm cancellation</h1>
        <p class="mt-3 text-sm text-slate-600">
          ${appointment.customer_name}, your appointment on ${formatDateTime(appointment.start_at)} is ready to cancel.
        </p>
        <button data-cancel class="mt-6 w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700">
          Cancel appointment
        </button>
        <p data-status class="mt-4 text-sm text-slate-500"></p>
      </section>
    </main>
  `;

  const button = root.querySelector<HTMLButtonElement>('[data-cancel]');
  const status = root.querySelector<HTMLElement>('[data-status]');

  button?.addEventListener('click', async () => {
    if (!status) return;
    button.disabled = true;
    status.textContent = 'Cancelling...';

    try {
      await fetchJson('/api/cancel', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      status.textContent = 'Appointment cancelled. A confirmation has been sent.';
      button.textContent = 'Cancelled';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Cancellation failed.';
      button.disabled = false;
    }
  });
}

function errorShell(message: string): string {
  return `
    <main class="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12">
      <section class="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h1 class="text-2xl font-bold text-slate-900">Cancellation unavailable</h1>
        <p class="mt-3 text-sm text-slate-600">${message}</p>
      </section>
    </main>
  `;
}
