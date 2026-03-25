import { signal } from '@preact/signals';
import type { Toast } from '../types/ui.types';

export const toasts = signal<Toast[]>([]);

let toastId = 0;

export function addToast(
  message: string,
  severity: Toast['severity'] = 'info',
  duration = 4000
) {
  const id = String(++toastId);
  toasts.value = [...toasts.value, { id, message, severity, duration }];
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
}

export function removeToast(id: string) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
