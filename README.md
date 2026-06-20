# Wassapp Appointment

Multi-tenant appointment platform for salons with:
- **Administrator dashboard** (manage salons/clients and users)
- **Salon dashboard** (services, categories, employees, profile settings)
- **Employee login** (own agenda/appointments)
- **Vanilla JS embeddable booking widget** (no iframe)

## Stack

- Vite + TypeScript
- Vue 3 (dashboard)
- Vue Router + Composition API
- Vanilla JS (widget)
- Tailwind CSS (dashboard styling)
- Supabase Auth + Postgres
- WhatsApp Cloud API (optional)
- Google Calendar integration (optional, controlled by `ENABLE_GOOGLE_CALENDAR`)
- Vercel serverless functions

## Setup

1. Create a Supabase project and run `supabase/schema.sql`.
2. Seed at least one row in `app_users` with role `administrator` for your own auth user.
3. Copy `.env.example` to `.env` and configure:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PUBLIC_BASE_URL`
   - `ENABLE_GOOGLE_CALENDAR` (`true`/`false`)
4. Install and build:

```bash
npm install
npm run build
```

For full-stack local development (frontend + `/api/*`):

```bash
vercel dev
```

## Roles

- **administrator**: software owner, can manage salons/clients and users
- **salon**: manages own profile, categories, services, and employees
- **employee**: logs in with personal credentials and sees own agenda

## Frontend routes

- `/` welcome/intro page with link to dashboard
- `/dashboard` authenticated app dashboard
- `/dashboard/widget-preview` authenticated widget preview page
- `/cancel?token=...` cancellation page

## Widget embedding (no iframe)

Yes, the salon website should load a JS file.

Build output includes:
- `dist/wassapp-appointment-widget.js`

Example usage:

```html
<script type="module" src="https://your-domain.example/wassapp-appointment-widget.js"></script>
<div id="booking-widget"></div>
<script>
  window.WassappAppointmentWidget.mount(document.getElementById('booking-widget'), {
    salonSlug: 'my-salon-slug'
  });
</script>
```

You can also use:

```js
window.WassappAppointment.mount(target, { salonSlug: 'my-salon-slug' });
```

The widget is intentionally styled with a local `<style>` block and semantic class names (`wa-*`) so client-specific CSS overrides are easy.
