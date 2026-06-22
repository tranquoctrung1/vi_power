import { API_BASE } from '../config';
import { useAuthStore } from '../stores/authStore';

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

  if (res.status === 401 && !input.includes('/auth/login')) {
    useAuthStore.getState().logout();
    window.location.replace('/login');
  }

  return res;
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
