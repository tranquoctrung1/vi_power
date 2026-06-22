import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const navigate = useNavigate();
  const { token, user } = useAuthStore();

  useEffect(() => {
    if (!token) navigate('/login', { replace: true });
  }, []);

  return { token, user };
}
