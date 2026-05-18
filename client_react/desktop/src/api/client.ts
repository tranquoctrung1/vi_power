import { API_BASE } from '../config';
import { useAuthStore } from '../stores/authStore';

let refreshing: Promise<boolean> | null = null;

function getHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    headers: { ...getHeaders(), ...(init.headers as Record<string, string> || {}) },
  });

  if (res.status !== 401) return res;

  if (input.includes('/auth/refresh') || input.includes('/auth/login')) return res;

  if (!refreshing) {
    refreshing = useAuthStore.getState().tryRefresh().finally(() => { refreshing = null; });
  }
  const ok = await refreshing;

  if (!ok) {
    useAuthStore.getState().logout();
    window.location.replace('/login');
    return res;
  }

  return fetch(input, {
    ...init,
    headers: { ...getHeaders(), ...(init.headers as Record<string, string> || {}) },
  });
}

export const apiGet = (path: string) =>
  apiFetch(`${API_BASE}${path}`);

export const apiPost = (path: string, body?: unknown) =>
  apiFetch(`${API_BASE}${path}`, { method: 'POST', body: JSON.stringify(body) });

export const apiPut = (path: string, body?: unknown) =>
  apiFetch(`${API_BASE}${path}`, { method: 'PUT', body: JSON.stringify(body) });

export const apiPatch = (path: string, body?: unknown) =>
  apiFetch(`${API_BASE}${path}`, { method: 'PATCH', body: JSON.stringify(body) });

export const apiDelete = (path: string) =>
  apiFetch(`${API_BASE}${path}`, { method: 'DELETE' });
