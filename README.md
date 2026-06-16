# Wassapp Appointment

Vanilla TypeScript + Vite appointment booking widget for barbers and salons.

## Stack

- Vite + Vanilla TypeScript
- Tailwind CSS
- Supabase Auth + Postgres
- Google Calendar API via service account
- WhatsApp Cloud API
- Vercel serverless functions

## Setup

1. Create a Supabase project and run `supabase/schema.sql`.
2. Enable Supabase Auth for email/password and phone OTP.
3. Copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PUBLIC_BASE_URL`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_BILLING_PRICE_ID`
   - `STRIPE_UNIT_AMOUNT_CENTS`
4. Create a Google Cloud service account, enable the Calendar API, and share the barber calendar with the service account email.
5. Create a Meta WhatsApp Cloud API app, connect the barber number, and save the phone number ID and access token in the dashboard settings.
6. In Stripe, create a monthly subscription price with usage-based billing at 25 cents per unit, then register the price ID and webhook endpoint.
7. Install dependencies and run the app.

```bash
npm install
npm run build
```

For local full-stack work, run the app with Vercel CLI so the `/api` routes are available.

```bash
vercel dev
```

For the frontend only, you can still use:

```bash
npm run dev
```

## Project routes

- `/` widget
- `/dashboard` barber admin UI
- `/cancel?token=...` cancellation confirmation page
- `/api/*` Vercel serverless endpoints

## Widget embedding

The app exposes `window.WassappAppointment.mount(target, options)` for embedding the widget in another page.

## Deployment

1. Deploy to Vercel.
2. Set the environment variables in the Vercel project.
3. Make sure the build command is `npm run build`.
4. Point your barber site to the deployed widget or mount it via the exported global.

## Notes

- The dashboard supports Supabase email/password and phone OTP.
- Calendar and WhatsApp connections are stored per barber profile in Supabase.
- Google Calendar events are created with the barber's selected calendar ID.
- Stripe usage is recorded on each confirmed appointment and invoiced monthly through Stripe Billing.
