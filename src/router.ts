import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from './shared/supabase';
import WelcomePage from './views/WelcomePage.vue';
import DashboardPage from './views/DashboardPage.vue';
import AgendaPage from './views/AgendaPage.vue';
import WidgetPreviewPage from './views/WidgetPreviewPage.vue';
import CancelPage from './views/CancelPage.vue';
import ServiceFormModal from './components/dashboard/ServiceFormModal.vue';
import CategoryFormModal from './components/dashboard/CategoryFormModal.vue';
import BarberFormModal from './components/dashboard/BarberFormModal.vue';
import AdminSalonFormModal from './components/dashboard/AdminSalonFormModal.vue';

const routes = [
  {
    path: '/',
    name: 'welcome',
    component: WelcomePage,
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardPage,
    children: [
      { path: 'services/new', name: 'service-new', component: ServiceFormModal },
      { path: 'services/:id', name: 'service-edit', component: ServiceFormModal },
      { path: 'categories/new', name: 'category-new', component: CategoryFormModal },
      { path: 'categories/:id', name: 'category-edit', component: CategoryFormModal },
      { path: 'barbers/new', name: 'barber-new', component: BarberFormModal },
      { path: 'barbers/:id', name: 'barber-edit', component: BarberFormModal },
      { path: 'salons/new', name: 'salon-new', component: AdminSalonFormModal },
    ],
  },
  {
    path: '/agenda',
    name: 'agenda',
    component: AgendaPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/dashboard/widget-preview',
    name: 'widget-preview',
    component: WidgetPreviewPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/cancel',
    name: 'cancel',
    component: CancelPage,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) {
    return true;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    return true;
  }

  return { name: 'welcome', query: { next: to.fullPath } };
});
