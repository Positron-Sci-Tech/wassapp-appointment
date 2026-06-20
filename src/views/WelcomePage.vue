<template>
  <main class="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-10">
    <section class="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div class="rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 p-8 text-white shadow-soft">
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Wassapp Appointment</p>
        <h1 class="mt-4 text-3xl font-bold leading-tight">Multi-tenant bookings for salons and barbers.</h1>
        <p class="mt-4 text-sm leading-6 text-brand-50">
          Administrator, salon, and employee roles with embeddable booking widget.
        </p>
      </div>

      <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h2 class="text-xl font-semibold text-slate-900">Get started</h2>
        <p class="mt-2 text-sm text-slate-600">
          Open the dashboard to sign in and manage clients, services, and employees. Use Agenda for appointments.
        </p>
        <RouterLink
          to="/dashboard"
          class="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Open dashboard
        </RouterLink>
      </div>
    </section>
  </main>
</template>
