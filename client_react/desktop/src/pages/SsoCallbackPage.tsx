import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { API_BASE } from "../config";

/**
 * /sso-callback?token=...&refreshToken=...
 *
 * Server redirect vào đây sau khi verify SSO thành công.
 * Page này lưu token vào store rồi redirect về dashboard.
 */
export default function SsoCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const refreshToken = params.get("refreshToken");

    if (!token || !refreshToken) {
      return;
    }

    // Lấy thông tin user từ /api/auth/me
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) throw new Error(json.message || "Xác thực thất bại");

        const user = json.data;
        localStorage.setItem("token", token);
        localStorage.setItem("vp_refresh", refreshToken);
        localStorage.setItem("vp_user", JSON.stringify(user));
        useAuthStore.setState({ token, refreshToken, user });

        navigate("/", { replace: true });
      })
      .catch((err) => {
        setError(err.message || "Đăng nhập SSO thất bại");
      });
  }, []);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <i
          className="bi bi-exclamation-triangle"
          style={{ fontSize: 40, color: "var(--red)" }}
        />
        <div style={{ fontWeight: 600 }}>{error}</div>
        <button
          className="btn-primary"
          onClick={() => navigate("/login", { replace: true })}
        >
          Đăng nhập thủ công
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div className="spinner" />
      <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
        Đang xác thực SSO...
      </div>
    </div>
  );
}
