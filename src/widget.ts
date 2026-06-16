import { fetchJson, appUrl } from './shared/api';
import { formatCurrency, formatDateTime, startOfTodayInput, localDateTimeToIso } from './shared/format';
import type { Barber, BookingResponse, Service, Slot } from './shared/types';

type WidgetMountOptions = {
  barberId?: string;
};

type BookingFormState = {
  barberId: string;
  serviceId: string;
  date: string;
  slotStartAt: string;
};

const defaultState = (): BookingFormState => ({
  barberId: '',
  serviceId: '',
  date: startOfTodayInput(),
  slotStartAt: '',
});

export async function mountWidget(root: HTMLElement, options: WidgetMountOptions = {}): Promise<void> {
  root.innerHTML = shell();

  const statusEl = root.querySelector<HTMLElement>('[data-widget-status]');
  const barberSelect = root.querySelector<HTMLSelectElement>('[data-barber-select]');
  const serviceSelect = root.querySelector<HTMLSelectElement>('[data-service-select]');
  const dateInput = root.querySelector<HTMLInputElement>('[data-date-input]');
  const slotsContainer = root.querySelector<HTMLElement>('[data-slots]');
  const form = root.querySelector<HTMLFormElement>('[data-booking-form]');
  const submitButton = root.querySelector<HTMLButtonElement>('[data-submit]');
  const confirmation = root.querySelector<HTMLElement>('[data-confirmation]');

  const state = defaultState();
  let barbers: Barber[] = [];

  const setStatus = (message: string, tone: 'info' | 'error' = 'info') => {
    if (!statusEl) return;
    statusEl.className = tone === 'error' ? 'rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700' : 'rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700';
    statusEl.textContent = message;
  };

  const loadBarbers = async () => {
    setStatus('Loading barbers...');
    barbers = await fetchJson<Barber[]>('/api/barbers');

    if (!barbers.length) {
      setStatus('No barbers are available yet.', 'error');
      return;
    }

    if (barberSelect) {
      barberSelect.innerHTML = barbers
        .map((barber) => `<option value="${barber.id}">${barber.display_name}</option>`)
        .join('');
      state.barberId = options.barberId && barbers.some((barber) => barber.id === options.barberId) ? options.barberId : barbers[0].id;
      barberSelect.value = state.barberId;
      barberSelect.closest('.js-barber-wrap')?.classList.toggle('hidden', barbers.length === 1);
    }

    dateInput?.setAttribute('min', startOfTodayInput());
    await loadServices();
  };

  const loadServices = async () => {
    if (!state.barberId) {
      return;
    }

    setStatus('Loading services and slots...');
    const services = await fetchJson<Service[]>(`/api/services?barberId=${encodeURIComponent(state.barberId)}`);
    serviceSelect!.innerHTML = services
      .filter((service) => service.active)
      .map((service) => `<option value="${service.id}">${service.name} · ${service.duration_minutes} min · ${formatCurrency(service.price_cents)}</option>`)
      .join('');

    state.serviceId = services.find((service) => service.active)?.id ?? '';
    if (state.serviceId) {
      serviceSelect!.value = state.serviceId;
    }
    await loadSlots();
  };

  const loadSlots = async () => {
    if (!state.barberId || !state.serviceId || !state.date) {
      slotsContainer!.innerHTML = '<p class="text-sm text-slate-500">Choose a service and date to see time slots.</p>';
      return;
    }

    slotsContainer!.innerHTML = '<p class="text-sm text-slate-500">Loading time slots...</p>';
    const slots = await fetchJson<Slot[]>(
      `/api/slots?barberId=${encodeURIComponent(state.barberId)}&serviceId=${encodeURIComponent(state.serviceId)}&date=${encodeURIComponent(state.date)}`,
    );

    if (!slots.length) {
      slotsContainer!.innerHTML = '<p class="text-sm text-slate-500">No open slots for this day.</p>';
      return;
    }

    slotsContainer!.innerHTML = slots
      .map(
        (slot, index) => `
          <label class="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50">
            <span class="text-sm font-medium text-slate-900">${slot.label}</span>
            <input class="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500" type="radio" name="slot" value="${slot.startAt}" ${index === 0 ? 'checked' : ''} />
          </label>
        `,
      )
      .join('');

    state.slotStartAt = slots[0].startAt;
  };

  root.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.matches('[data-barber-select]')) {
      state.barberId = target.value;
      await loadServices();
      return;
    }

    if (target.matches('[data-service-select]')) {
      state.serviceId = target.value;
      await loadSlots();
      return;
    }

    if (target.matches('[data-date-input]')) {
      state.date = (target as HTMLInputElement).value;
      await loadSlots();
      return;
    }

    if (target.name === 'slot') {
      state.slotStartAt = target.value;
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const slotStartAt = state.slotStartAt || String(formData.get('slot') ?? '');

    if (!state.barberId || !state.serviceId || !slotStartAt) {
      setStatus('Please choose a barber, service, and time slot.', 'error');
      return;
    }

    const payload = {
      barberId: state.barberId,
      serviceId: state.serviceId,
      startAt: slotStartAt,
      customer: {
        name: String(formData.get('customerName') ?? '').trim(),
        phone: String(formData.get('customerPhone') ?? '').trim(),
        email: String(formData.get('customerEmail') ?? '').trim() || undefined,
      },
      notes: String(formData.get('notes') ?? '').trim() || undefined,
      consent: formData.get('consent') === 'on',
    };

    if (!payload.customer.name || !payload.customer.phone || !payload.consent) {
      setStatus('Please add your name, WhatsApp number, and consent.', 'error');
      return;
    }

    submitButton!.disabled = true;
    submitButton!.textContent = 'Booking...';
    setStatus('Submitting booking...');

    try {
      const response = await fetchJson<BookingResponse>('/api/book', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      confirmation!.classList.remove('hidden');
      confirmation!.innerHTML = `
        <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <p class="text-lg font-semibold">Booking confirmed</p>
          <p class="mt-2 text-sm">Reference: ${response.bookingReference}</p>
          <p class="mt-1 text-sm">You will receive a WhatsApp confirmation shortly.</p>
          <p class="mt-3 text-sm">
            Cancel link:
            <a class="font-medium text-emerald-700 underline" href="${response.cancellationUrl}">${response.cancellationUrl}</a>
          </p>
        </div>
      `;
      setStatus('Booking saved successfully.');
      form.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Booking failed.', 'error');
    } finally {
      submitButton!.disabled = false;
      submitButton!.textContent = 'Confirm';
    }
  });

  await loadBarbers();
}

function shell(): string {
  return `
    <main class="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
      <section class="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 p-8 text-white shadow-soft">
          <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Wassapp Appointment</p>
          <h1 class="mt-4 text-3xl font-bold leading-tight">Book a haircut or salon visit in a few taps.</h1>
          <p class="mt-4 max-w-xl text-sm leading-6 text-brand-50">
            GDPR-friendly, mobile-first booking for barbers and salons. Confirmations go to WhatsApp and calendar events are created automatically.
          </p>
        </div>

        <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div data-widget-status class="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">Loading widget...</div>
          <form data-booking-form class="mt-5 space-y-4">
            <div class="js-barber-wrap">
              <label class="mb-1 block text-sm font-medium text-slate-700">Barber</label>
              <select data-barber-select class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500"></select>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Service</label>
              <select data-service-select class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500"></select>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Date</label>
              <input data-date-input type="date" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
            </div>

            <div>
              <p class="mb-2 text-sm font-medium text-slate-700">Available times</p>
              <div data-slots class="grid gap-2"></div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm font-medium text-slate-700">Name</label>
                <input name="customerName" required class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-slate-700">WhatsApp number</label>
                <input name="customerPhone" required placeholder="+31612345678" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
              </div>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Email (optional)</label>
              <input name="customerEmail" type="email" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500" />
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Notes (optional)</label>
              <textarea name="notes" rows="3" class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-500 focus:ring-brand-500"></textarea>
            </div>

            <label class="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <input name="consent" type="checkbox" class="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <span>
                I agree to be contacted about this booking by WhatsApp and understand my data will be stored only for scheduling, reminders, and cancellation handling.
              </span>
            </label>

            <button data-submit type="submit" class="inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
              Confirm
            </button>
          </form>

          <div data-confirmation class="mt-5 hidden"></div>
        </div>
      </section>
    </main>
  `;
}

export function bootstrapWidget(): void {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('App root not found');
  }

  const params = new URLSearchParams(window.location.search);
  void mountWidget(root, { barberId: params.get('barberId') ?? undefined });
}

declare global {
  interface Window {
    WassappAppointment?: {
      mount: (target: HTMLElement, options?: WidgetMountOptions) => Promise<void>;
    };
  }
}

window.WassappAppointment = {
  mount: mountWidget,
};
