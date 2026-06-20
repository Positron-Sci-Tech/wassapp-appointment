import { fetchJson } from './shared/api';
import { formatCurrency, startOfTodayInput } from './shared/format';
import type { Barber, BookingResponse, Service, ServiceCategory, Slot } from './shared/types';

type WidgetMountOptions = {
  salonSlug?: string;
  barberId?: string;
};

type WidgetBootstrapResponse = {
  salon: {
    id: string;
    slug: string | null;
    display_name: string;
    allow_multi_service_selection: boolean;
  };
  barbers: Barber[];
  services: Service[];
  categories: ServiceCategory[];
  serviceIdsByBarber: Record<string, string[]>;
};

type BookingFormState = {
  salonSlug: string;
  barberId: string;
  serviceIds: string[];
  date: string;
  slotStartAt: string;
};

const defaultState = (): BookingFormState => ({
  salonSlug: '',
  barberId: '',
  serviceIds: [],
  date: startOfTodayInput(),
  slotStartAt: '',
});

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function mountWidget(root: HTMLElement, options: WidgetMountOptions = {}): Promise<void> {
  root.innerHTML = shell();

  const statusEl = root.querySelector<HTMLElement>('[data-widget-status]');
  const barbersContainer = root.querySelector<HTMLElement>('[data-barbers]');
  const servicesContainer = root.querySelector<HTMLElement>('[data-services]');
  const dateInput = root.querySelector<HTMLInputElement>('[data-date-input]');
  const slotsContainer = root.querySelector<HTMLElement>('[data-slots]');
  const form = root.querySelector<HTMLFormElement>('[data-booking-form]');
  const submitButton = root.querySelector<HTMLButtonElement>('[data-submit]');
  const confirmation = root.querySelector<HTMLElement>('[data-confirmation]');
  const serviceHint = root.querySelector<HTMLElement>('[data-service-hint]');
  const salonTitle = root.querySelector<HTMLElement>('[data-salon-title]');

  const state = defaultState();
  let barbers: Barber[] = [];
  let services: Service[] = [];
  let categories: ServiceCategory[] = [];
  let serviceIdsByBarber: Record<string, string[]> = {};
  let allowMultiService = false;

  const setStatus = (message: string, tone: 'info' | 'error' = 'info') => {
    if (!statusEl) return;
    statusEl.className = tone === 'error' ? 'wa-status wa-status-error' : 'wa-status wa-status-info';
    statusEl.textContent = message;
  };

  const updateServicesView = async () => {
    if (!servicesContainer) return;
    const assignedIds = new Set(serviceIdsByBarber[state.barberId] ?? []);
    const availableServices = services.filter((service) => assignedIds.has(service.id) && service.active);

    if (!availableServices.length) {
      servicesContainer.innerHTML = '<p class="wa-empty">No services available for this barber.</p>';
      state.serviceIds = [];
      await loadSlots();
      return;
    }

    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const byCategory = new Map<string, Service[]>();
    for (const service of availableServices) {
      const key = service.category_id ?? '_uncategorized';
      const list = byCategory.get(key) ?? [];
      list.push(service);
      byCategory.set(key, list);
    }

    const orderedKeys = Array.from(byCategory.keys()).sort((a, b) => {
      if (a === '_uncategorized') return 1;
      if (b === '_uncategorized') return -1;
      const first = categoryMap.get(a);
      const second = categoryMap.get(b);
      return (first?.sort_order ?? 0) - (second?.sort_order ?? 0);
    });

    const rows = orderedKeys
      .map((key) => {
        const label = key === '_uncategorized' ? 'Other services' : categoryMap.get(key)?.name ?? 'Services';
        const cards = (byCategory.get(key) ?? [])
          .map((service) => {
            const selected = state.serviceIds.includes(service.id);
            const thumb = service.thumbnail_url ? `<img class="wa-card-thumb" src="${esc(service.thumbnail_url)}" alt="${esc(service.name)}" />` : '<div class="wa-card-thumb wa-card-thumb-placeholder"></div>';
            return `
              <button type="button" data-service-card="${service.id}" class="wa-card ${selected ? 'is-selected' : ''}">
                ${thumb}
                <span class="wa-card-title">${esc(service.name)}</span>
                <span class="wa-card-meta">${service.duration_minutes} min · ${formatCurrency(service.price_cents)}</span>
              </button>
            `;
          })
          .join('');
        return `<section class="wa-group"><h3 class="wa-group-title">${esc(label)}</h3><div class="wa-grid">${cards}</div></section>`;
      })
      .join('');

    servicesContainer.innerHTML = rows;
    await loadSlots();
  };

  const loadSlots = async () => {
    if (!slotsContainer) return;
    if (!state.barberId || !state.serviceIds.length || !state.date) {
      slotsContainer.innerHTML = '<p class="wa-empty">Choose barber, service, and date to see time slots.</p>';
      return;
    }

    slotsContainer.innerHTML = '<p class="wa-empty">Loading time slots...</p>';
    const slots = await fetchJson<Slot[]>(
      `/api/slots?barberId=${encodeURIComponent(state.barberId)}&serviceIds=${encodeURIComponent(state.serviceIds.join(','))}&date=${encodeURIComponent(state.date)}`,
    );

    if (!slots.length) {
      slotsContainer.innerHTML = '<p class="wa-empty">No open slots for this day.</p>';
      return;
    }

    slotsContainer.innerHTML = slots
      .map(
        (slot, index) => `
          <label class="wa-slot">
            <span>${esc(slot.label)}</span>
            <input type="radio" name="slot" value="${slot.startAt}" ${index === 0 ? 'checked' : ''} />
          </label>
        `,
      )
      .join('');
    state.slotStartAt = slots[0].startAt;
  };

  const loadBootstrap = async () => {
    const salonSlugFromQuery = new URLSearchParams(window.location.search).get('salonSlug') ?? undefined;
    const salonSlug = options.salonSlug ?? salonSlugFromQuery;
    if (!salonSlug) {
      setStatus('Missing salon slug. Use mount(target, { salonSlug }).', 'error');
      return;
    }

    setStatus('Loading salon...');
    const data = await fetchJson<WidgetBootstrapResponse>(`/api/widget?salonSlug=${encodeURIComponent(salonSlug)}`);
    state.salonSlug = salonSlug;
    barbers = data.barbers;
    services = data.services;
    categories = data.categories;
    serviceIdsByBarber = data.serviceIdsByBarber;
    allowMultiService = data.salon.allow_multi_service_selection;

    if (salonTitle) {
      salonTitle.textContent = data.salon.display_name;
    }
    if (serviceHint) {
      serviceHint.textContent = allowMultiService ? 'You can select multiple services.' : 'Choose one service.';
    }
    if (!barbers.length) {
      setStatus('No barbers are available yet.', 'error');
      return;
    }

    state.barberId = options.barberId && barbers.some((barber) => barber.id === options.barberId) ? options.barberId : barbers[0].id;
    if (dateInput) {
      dateInput.value = state.date;
      dateInput.min = startOfTodayInput();
    }

    if (barbersContainer) {
      barbersContainer.innerHTML = barbers
        .map((barber) => {
          const selected = barber.id === state.barberId;
          const thumb = barber.thumbnail_url ? `<img class="wa-card-thumb" src="${esc(barber.thumbnail_url)}" alt="${esc(barber.display_name)}" />` : '<div class="wa-card-thumb wa-card-thumb-placeholder"></div>';
          return `
            <button type="button" data-barber-card="${barber.id}" class="wa-card ${selected ? 'is-selected' : ''}">
              ${thumb}
              <span class="wa-card-title">${esc(barber.display_name)}</span>
            </button>
          `;
        })
        .join('');
    }

    const initialAssigned = serviceIdsByBarber[state.barberId] ?? [];
    state.serviceIds = initialAssigned.length ? [initialAssigned[0]] : [];
    await updateServicesView();
    setStatus('Ready');
  };

  root.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const barberButton = target.closest<HTMLElement>('[data-barber-card]');
    if (barberButton) {
      state.barberId = barberButton.dataset.barberCard ?? '';
      const assigned = serviceIdsByBarber[state.barberId] ?? [];
      state.serviceIds = assigned.length ? [assigned[0]] : [];
      root.querySelectorAll<HTMLElement>('[data-barber-card]').forEach((element) => {
        element.classList.toggle('is-selected', element.dataset.barberCard === state.barberId);
      });
      await updateServicesView();
      return;
    }

    const serviceButton = target.closest<HTMLElement>('[data-service-card]');
    if (serviceButton) {
      const id = serviceButton.dataset.serviceCard ?? '';
      if (!id) return;
      if (allowMultiService) {
        if (state.serviceIds.includes(id)) {
          state.serviceIds = state.serviceIds.filter((serviceId) => serviceId !== id);
        } else {
          state.serviceIds = [...state.serviceIds, id];
        }
      } else {
        state.serviceIds = [id];
      }
      root.querySelectorAll<HTMLElement>('[data-service-card]').forEach((element) => {
        element.classList.toggle('is-selected', state.serviceIds.includes(element.dataset.serviceCard ?? ''));
      });
      await loadSlots();
    }
  });

  root.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    if (target.matches('[data-date-input]')) {
      state.date = target.value;
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

    if (!state.barberId || !state.serviceIds.length || !slotStartAt) {
      setStatus('Please choose a barber, service, and time slot.', 'error');
      return;
    }

    const payload = {
      salonSlug: state.salonSlug,
      barberId: state.barberId,
      serviceIds: state.serviceIds,
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

    if (!submitButton) return;
    submitButton.disabled = true;
    submitButton.textContent = 'Booking...';
    setStatus('Submitting booking...');

    try {
      const response = await fetchJson<BookingResponse>('/api/book', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (confirmation) {
        confirmation.classList.remove('wa-hidden');
        confirmation.innerHTML = `
          <div class="wa-confirmation">
            <p class="wa-confirmation-title">Booking confirmed</p>
            <p>Reference: ${esc(response.bookingReference)}</p>
            <p>Cancel link: <a href="${esc(response.cancellationUrl)}">${esc(response.cancellationUrl)}</a></p>
          </div>
        `;
      }
      setStatus('Booking saved successfully.');
      form.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Booking failed.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Confirm';
    }
  });

  await loadBootstrap();
}

function shell(): string {
  return `
    <style>
      .wa-widget { max-width: 760px; margin: 0 auto; font-family: Inter, Arial, sans-serif; color: #0f172a; }
      .wa-card-wrap, .wa-panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; }
      .wa-title { margin: 0 0 4px; font-size: 24px; }
      .wa-subtitle { margin: 0 0 12px; color: #475569; }
      .wa-status { margin-bottom: 12px; border-radius: 12px; padding: 10px 12px; font-size: 14px; }
      .wa-status-info { background: #f1f5f9; color: #334155; }
      .wa-status-error { background: #fff1f2; color: #9f1239; }
      .wa-section { margin-top: 16px; }
      .wa-label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; }
      .wa-help { margin: -4px 0 8px; font-size: 13px; color: #64748b; }
      .wa-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
      .wa-group { margin-top: 10px; }
      .wa-group-title { margin: 0 0 8px; font-size: 14px; color: #475569; }
      .wa-card { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; width: 100%; border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; padding: 10px; cursor: pointer; text-align: left; }
      .wa-card:hover { border-color: #6366f1; }
      .wa-card.is-selected { border-color: #4f46e5; background: #eef2ff; }
      .wa-card-thumb { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: #e2e8f0; }
      .wa-card-thumb-placeholder { border: 1px dashed #94a3b8; }
      .wa-card-title { font-weight: 600; }
      .wa-card-meta { font-size: 12px; color: #475569; }
      .wa-date, .wa-input, .wa-textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font-size: 14px; box-sizing: border-box; }
      .wa-slot { display: flex; align-items: center; justify-content: space-between; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
      .wa-row { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
      .wa-consent { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #334155; margin-top: 10px; }
      .wa-submit { width: 100%; margin-top: 12px; border: 0; border-radius: 10px; padding: 12px; background: #4f46e5; color: #fff; font-weight: 600; cursor: pointer; }
      .wa-submit[disabled] { opacity: 0.6; cursor: not-allowed; }
      .wa-empty { margin: 0; color: #64748b; font-size: 14px; }
      .wa-confirmation { border: 1px solid #86efac; background: #f0fdf4; border-radius: 12px; margin-top: 12px; padding: 12px; font-size: 14px; }
      .wa-confirmation-title { font-weight: 700; margin: 0 0 8px; }
      .wa-hidden { display: none; }
      @media (max-width: 640px) { .wa-row { grid-template-columns: 1fr; } }
    </style>
    <main class="wa-widget">
      <section class="wa-card-wrap">
        <h1 class="wa-title" data-salon-title>Book an appointment</h1>
        <p class="wa-subtitle">Choose your barber, services, and preferred time.</p>
      </section>
      <section class="wa-panel">
        <div data-widget-status class="wa-status wa-status-info">Loading widget...</div>
        <form data-booking-form>
          <div class="wa-section">
            <p class="wa-label">Barber</p>
            <div data-barbers class="wa-grid"></div>
          </div>
          <div class="wa-section">
            <p class="wa-label">Services</p>
            <p class="wa-help" data-service-hint></p>
            <div data-services></div>
          </div>
          <div class="wa-section">
            <label class="wa-label">Date</label>
            <input data-date-input type="date" class="wa-date" />
          </div>
          <div class="wa-section">
            <p class="wa-label">Available times</p>
            <div data-slots></div>
          </div>
          <div class="wa-section wa-row">
            <div>
              <label class="wa-label">Name</label>
              <input name="customerName" required class="wa-input" />
            </div>
            <div>
              <label class="wa-label">WhatsApp number</label>
              <input name="customerPhone" required placeholder="+31612345678" class="wa-input" />
            </div>
          </div>
          <div class="wa-section">
            <label class="wa-label">Email (optional)</label>
            <input name="customerEmail" type="email" class="wa-input" />
          </div>
          <div class="wa-section">
            <label class="wa-label">Notes (optional)</label>
            <textarea name="notes" rows="3" class="wa-textarea"></textarea>
          </div>
          <label class="wa-consent">
            <input name="consent" type="checkbox" />
            <span>I agree to be contacted about this booking and understand my data is used for scheduling only.</span>
          </label>
          <button data-submit type="submit" class="wa-submit">Confirm</button>
        </form>
        <div data-confirmation class="wa-hidden"></div>
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
  void mountWidget(root, {
    salonSlug: params.get('salonSlug') ?? undefined,
    barberId: params.get('barberId') ?? undefined,
  });
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
