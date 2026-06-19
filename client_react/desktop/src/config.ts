// Dev: connect directly to Node server on :3005
// Prod: connect via IIS proxy at /vipower/
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string) ||
  `http://${window.location.hostname}:3005/api`;

export const WS_URL =
  (import.meta.env.VITE_WS_URL as string) ||
  `ws://${window.location.hostname}:3005`;

// TanHiep SCADA base URL (redirect về khi bấm nút quay lại)
export const LORA_BASE_URL =
  (import.meta.env.VITE_LORA_BASE_URL as string) ||
  `http://${window.location.hostname}:5555`;
