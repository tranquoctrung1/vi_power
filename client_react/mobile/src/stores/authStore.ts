import { create } from 'zustand';
import { API_BASE } from '../config';

interface User {
  _id: string;
  username: string;
  fullName?: string;
  role: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  tryRefresh: () => Promise<boolean>;
  isTokenExpired: () => boolean;
}

function jwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (payload.exp - 30) < Date.now() / 1000;
  } catch {
    return true;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('vp_refresh'),
  user: JSON.parse(localStorage.getItem('vp_user') || 'null'),

  isTokenExpired: () => {
    const { token } = get();
    if (!token) return true;
    return jwtExpired(token);
  },

  tryRefresh: async () => {
    const rt = get().refreshToken;
    if (!rt) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const json = await res.json();
      if (json.success) {
        localStorage.setItem('token', json.token);
        set({ token: json.token });
        return true;
      }
    } catch {}
    localStorage.removeItem('vp_refresh');
    set({ refreshToken: null });
    return false;
  },

  login: async (username, password) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (json.success) {
        localStorage.setItem('token', json.token);
        localStorage.setItem('vp_refresh', json.refreshToken);
        localStorage.setItem('vp_user', JSON.stringify(json.user));
        set({ token: json.token, refreshToken: json.refreshToken, user: json.user });
        return { success: true };
      }
      return { success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' };
    } catch {
      return { success: false, error: 'Không thể kết nối máy chủ' };
    }
  },

  logout: async () => {
    const token = get().token;
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      }).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('vp_refresh');
    localStorage.removeItem('vp_user');
    set({ token: null, refreshToken: null, user: null });
  },
}));
