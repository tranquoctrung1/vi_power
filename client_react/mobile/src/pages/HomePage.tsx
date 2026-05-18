import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiGet } from '../api/client';
import BottomNav from '../components/BottomNav';
import { WS_URL } from '../config';

interface Device {
  _id: string;
  deviceid: string;
  deviceName: string;
  location?: string;
  deviceType?: string;
  status: 'active' | 'offline' | 'error' | 'inactive' | 'paused';
}

type FilterType = 'all' | 'active' | 'offline' | 'error' | 'inactive';

const STATUS_ICON_CLS: Record<string, string> = {
  active: 'active', offline: 'offline', error: 'error', inactive: 'inactive', paused: 'offline',
};

function statusBadge(status: string) {
  const map: Record<string, { cls: string; label: string }> = {
    active:   { cls: 'badge-active',   label: 'Hoạt động' },
    offline:  { cls: 'badge-offline',  label: 'Offline' },
    error:    { cls: 'badge-error',    label: 'Lỗi' },
    inactive: { cls: 'badge-inactive', label: 'Tắt' },
    paused:   { cls: 'badge-offline',  label: 'Dừng' },
  };
  const s = map[status] || map.inactive;
  return <span className={`badge ${s.cls}`}><span className={`status-dot ${s.cls.replace('badge-', '')}`} />{s.label}</span>;
}

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
}

export default function HomePage() {
  useAuth();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [powerMap, setPowerMap] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('--');
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadDevices();
    connectWS();
    return () => {
      wsRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function loadDevices() {
    try {
      const res = await apiGet('/devices?limit=1000');
      const json = await res.json();
      setDevices((json.data || json.devices || []).filter((d: Device) => d.deviceid));
    } catch {}
  }

  function connectWS() {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ws.send(JSON.stringify({ type: 'client_init' }));
      setWsConnected(true);
    });

    ws.addEventListener('message', evt => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'data_init') {
          const pm: Record<string, number> = {};
          (msg.data?.dataEnergy || []).forEach((entry: { deviceid: string; data?: { power?: number }[] }) => {
            const latest = entry.data?.[0];
            if (latest) pm[entry.deviceid] = latest.power ?? 0;
          });
          setPowerMap(pm);
          if (msg.data?.devices?.data) setDevices(msg.data.devices.data);
          touchUpdate();
        }
        if (msg.type === 'history_inserted' && msg.data) {
          const d = msg.data;
          if (d.deviceid) {
            setPowerMap(prev => ({ ...prev, [d.deviceid]: d.power ?? prev[d.deviceid] ?? 0 }));
            touchUpdate();
          }
        }
      } catch {}
    });

    ws.addEventListener('close', () => {
      setWsConnected(false);
      timerRef.current = setTimeout(connectWS, 5000);
    });
    ws.addEventListener('error', () => ws.close());
  }

  function touchUpdate() {
    setLastUpdate(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }

  const online = devices.filter(d => d.status === 'active').length;
  const totalPower = Object.values(powerMap).reduce((a, b) => a + (b || 0), 0);

  const filtered = devices.filter(d => {
    if (filter !== 'all') {
      const st = filter === 'offline' ? ['offline', 'paused'] : [filter];
      if (!st.includes(d.status)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (d.deviceName || '').toLowerCase().includes(q) ||
             (d.deviceid || '').toLowerCase().includes(q) ||
             (d.location || '').toLowerCase().includes(q);
    }
    return true;
  });

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'active', label: 'Hoạt động' },
    { id: 'offline', label: 'Offline' },
    { id: 'error', label: 'Lỗi' },
    { id: 'inactive', label: 'Tắt' },
  ];

  return (
    <>
      <header className="app-header">
        <div className="app-header-title">
          <i className="bi bi-lightning-charge-fill" />
          ViPower
        </div>
        <div className="app-header-right">
          <div className="live-dot" style={{ background: wsConnected ? '#22d369' : '#f44b4b' }} />
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{lastUpdate}</span>
        </div>
      </header>

      <div className="app-content">
        <div className="kpi-strip">
          <div className="kpi-box">
            <div className="kpi-box-val">{devices.length}</div>
            <div className="kpi-box-lbl">Thiết bị</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-box-val" style={{ color: 'var(--green)' }}>{online}</div>
            <div className="kpi-box-lbl">Hoạt động</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-box-val">{fmt(totalPower)} kW</div>
            <div className="kpi-box-lbl">Tổng công suất</div>
          </div>
        </div>

        <div className="search-wrap">
          <div className="search-wrap-inner">
            <i className="bi bi-search search-icon" />
            <input className="search-input" type="search" placeholder="Tìm thiết bị..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="chip-row">
          {FILTERS.map(f => (
            <button key={f.id} className={`chip${filter === f.id ? ' active' : ''}`}
              onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="device-list">
          {filtered.length === 0 && <div className="empty-msg">Không có thiết bị nào.</div>}
          {filtered.map(d => {
            const power = powerMap[d.deviceid];
            const cls = STATUS_ICON_CLS[d.status] || 'inactive';
            return (
              <div key={d.deviceid} className={`device-card${d.status !== 'active' ? ' offline' : ''}`}
                onClick={() => navigate(`/device?deviceid=${encodeURIComponent(d.deviceid)}`)}>
                <div className={`device-card-icon ${cls}`}>
                  <i className="bi bi-lightning-charge-fill" />
                </div>
                <div className="device-card-body">
                  <div className="device-card-name">{d.deviceName || d.deviceid}</div>
                  <div className="device-card-sub">
                    {d.location || d.deviceid} · {statusBadge(d.status)}
                  </div>
                </div>
                <div className="device-card-right">
                  <div className="device-card-power">{power != null ? fmt(power, 2) : '--'} kW</div>
                  <div className="device-card-energy">{d.deviceType || '--'}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="spacer-bottom" />
      </div>

      <BottomNav active="home" />
    </>
  );
}
