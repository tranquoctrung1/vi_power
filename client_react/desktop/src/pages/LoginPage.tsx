import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { token, isTokenExpired, tryRefresh, login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token && !isTokenExpired()) {
      navigate('/', { replace: true });
      return;
    }
    tryRefresh().then(ok => {
      if (ok) navigate('/', { replace: true });
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username || !password) { setError('Vui lòng nhập đầy đủ thông tin'); return; }
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (result.success) {
      navigate('/', { replace: true });
    } else {
      setError(result.error || 'Đăng nhập thất bại');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-icon"><i className="bi bi-lightning-charge-fill" /></div>
          <span className="logo-text" style={{ fontSize: 22, fontWeight: 700 }}>ViPower</span>
        </div>
        <div className="login-title">Đăng nhập hệ thống</div>
        <div className="login-subtitle">Giám sát năng lượng nhà máy xử lý nước</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Tên đăng nhập</label>
            <div className="input-wrap">
              <i className="bi bi-person input-icon" />
              <input className="form-input" type="text" value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username" autoComplete="username" autoFocus />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Mật khẩu</label>
            <div className="input-wrap">
              <i className="bi bi-lock input-icon" />
              <input className="form-input" type={showPass ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password" />
              <button type="button" className="btn-eye" onClick={() => setShowPass(!showPass)}>
                <i className={`bi ${showPass ? 'bi-eye-slash' : 'bi-eye'}`} />
              </button>
            </div>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="btn-login" type="submit" disabled={loading}>
            {loading
              ? <><i className="bi bi-arrow-repeat" style={{ animation: 'spin 0.8s linear infinite' }} /> Đang đăng nhập...</>
              : 'Đăng nhập'}
          </button>
        </form>

        <div className="login-footer">ViPower © 2025 — Hệ thống giám sát năng lượng</div>
      </div>
    </div>
  );
}
