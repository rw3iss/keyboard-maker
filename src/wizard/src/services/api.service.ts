import { APP_CONFIG } from '../config/app.config';

const BASE_URL = APP_CONFIG.apiUrl;

export async function fetchJSON<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `API error ${res.status}`);
  }
  return res.json();
}

export function apiGet<T>(path: string): Promise<T> {
  return fetchJSON(path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return fetchJSON(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return fetchJSON(path, { method: 'PUT', body: JSON.stringify(body) });
}
