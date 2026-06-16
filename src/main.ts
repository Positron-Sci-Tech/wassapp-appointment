import './styles.css';
import { bootstrapWidget, mountWidget } from './widget';
import { mountDashboard } from './dashboard';
import { mountCancellation } from './cancel';

const root = document.getElementById('app');

if (!root) {
  throw new Error('App root not found');
}

const pathname = window.location.pathname;

if (pathname.startsWith('/dashboard')) {
  void mountDashboard(root);
} else if (pathname.startsWith('/cancel')) {
  void mountCancellation(root);
} else {
  bootstrapWidget();
}

declare global {
  interface Window {
    WassappAppointment?: {
      mount: typeof mountWidget;
    };
  }
}
