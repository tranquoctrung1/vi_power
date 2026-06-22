import { create } from 'zustand';
import { API_BASE } from '../config';

interface User {
  _id: string;
  username: string;
  fullName?: string;
  role: string;
  allowedAreas?: string[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('vp_user') || 'null'),

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
        localStorage.setItem('vp_user', JSON.stringify(json.user));
        set({ token: json.token, user: json.user });
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
    localStorage.removeItem('vp_user');
    set({ token: null, user: null });
  },
}));
