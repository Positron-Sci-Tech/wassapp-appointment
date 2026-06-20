import { mountWidget } from './widget';

declare global {
  interface Window {
    WassappAppointmentWidget?: {
      mount: typeof mountWidget;
    };
  }
}

window.WassappAppointmentWidget = {
  mount: mountWidget,
};

export { mountWidget };
