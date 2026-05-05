'use strict';

function jwtExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (payload.exp - 30) < Date.now() / 1000;
  } catch { return true; }
}

function getRedirect() {
  return new URLSearchParams(location.search).get('redirect') || 'index.html';
}

(async () => {
  // Valid token still exists → skip login entirely
  const existingToken = localStorage.getItem('token');
  if (existingToken && !jwtExpired(existingToken)) {
    location.replace(getRedirect());
    return;
  }

  // Try silent refresh before showing the form
  const rt = localStorage.getItem('vp_refresh');
  if (rt) {
    try {
      const res  = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const json = await res.json();
      if (json.success) {
        localStorage.setItem('token', json.token);
        location.replace(getRedirect());
        return;
      }
    } catch {}
    // Refresh token invalid/expired — clean up
    localStorage.removeItem('vp_refresh');
  }

  // Show the login form
  document.getElementById('loginWrap').style.display = '';
})();

const form      = document.getElementById('loginForm');
const errEl     = document.getElementById('loginError');
const btnLogin  = document.getElementById('btnLogin');
const btnText   = document.getElementById('btnLoginText');
const spinner   = document.getElementById('btnSpinner');
const passInput = document.getElementById('password');
const eyeBtn    = document.getElementById('btnTogglePass');
const eyeIcon   = document.getElementById('eyeIcon');

eyeBtn.addEventListener('click', () => {
  const show = passInput.type === 'password';
  passInput.type    = show ? 'text' : 'password';
  eyeIcon.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  errEl.textContent = '';

  const username = document.getElementById('username').value.trim();
  const password = passInput.value;

  if (!username || !password) {
    errEl.textContent = 'Vui lòng nhập đầy đủ thông tin';
    return;
  }

  btnLogin.disabled     = true;
  spinner.style.display = '';
  btnText.style.display = 'none';

  try {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();

    if (json.success) {
      localStorage.setItem('token',      json.token);
      localStorage.setItem('vp_refresh', json.refreshToken);
      localStorage.setItem('vp_user',    JSON.stringify(json.user));
      location.replace(getRedirect());
    } else {
      errEl.textContent = 'Sai tên đăng nhập hoặc mật khẩu';
    }
  } catch {
    errEl.textContent = 'Không thể kết nối máy chủ';
  } finally {
    btnLogin.disabled     = false;
    spinner.style.display = 'none';
    btnText.style.display = '';
  }
});
