import type { InjectionKey, Ref } from 'vue';
import type { Barber, Service, ServiceCategory } from './types';

export type AuthJsonFn = <T>(path: string, init?: RequestInit) => Promise<T>;
export type BarberWithServices = Barber & { service_ids: string[] };

export const AuthJsonKey: InjectionKey<AuthJsonFn> = Symbol('authJson');
export const RefreshDataKey: InjectionKey<() => Promise<void>> = Symbol('refreshData');
export const ServicesKey: InjectionKey<Ref<Service[]>> = Symbol('services');
export const CategoriesKey: InjectionKey<Ref<ServiceCategory[]>> = Symbol('categories');
export const BarbersKey: InjectionKey<Ref<BarberWithServices[]>> = Symbol('barbers');
