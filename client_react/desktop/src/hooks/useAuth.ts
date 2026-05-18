import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const navigate = useNavigate();
  const { token, user, isTokenExpired, tryRefresh } = useAuthStore();

  useEffect(() => {
    if (!token || isTokenExpired()) {
      tryRefresh().then(ok => {
        if (!ok) navigate('/login', { replace: true });
      });
    }
  }, []);

  return { token, user };
}
