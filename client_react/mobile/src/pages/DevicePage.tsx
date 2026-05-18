import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiGet } from '../api/client';
import BottomNav from '../components/BottomNav';
import { WS_URL } from '../config';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface DeviceInfo {
  deviceid: string;
  deviceName: string;
  location?: string;
  deviceType?: string;
  status: string;
  samplingCycle?: number;
}

interface ChannelData {
  channel: string;
  value: number | null;
  timestamp?: string;
}

interface EnergyRecord {
  timestamp: string;
  power?: number;
}

interface AlertRecord {
  _id: string;
  message?: string;
  severity: string;
  createdAt?: string;
  timestamp?: string;
  isComplete?: boolean;
  resolved?: boolean;
}

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
}

function relTime(ts?: string): string {
  if (!ts) return '--';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s trước`;
  if (s < 3600) return `${Math.floor(s / 60)}p trước`;
  if (s < 86400) return `${Math.floor(s / 3600)}h trước`;
  return `${Math.floor(s / 86400)}d trước`;
}

function statusBadge(status: string) {
  const map: Record<string, { cls: string; label: string }> = {
    active:   { cls: 'badge-active',  label: 'Hoạt động' },
    offline:  { cls: 'badge-offline', label: 'Offline' },
    error:    { cls: 'badge-error',   label: 'Lỗi' },
    inactive: { cls: 'badge-inactive',label: 'Tắt' },
    paused:   { cls: 'badge-offline', label: 'Dừng' },
  };
  const s = map[status] || map.inactive;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export default function DevicePage() {
  useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const deviceid = params.get('deviceid');

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [error, setError] = useState('');
  const [tsLabel, setTsLabel] = useState('--');

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!deviceid) { navigate('/', { replace: true }); return; }
    loadPage();
    connectWS();
    return () => {
      wsRef.current?.close();
      if (wsTimer.current) clearTimeout(wsTimer.current);
      chartInst.current?.destroy();
    };
  }, [deviceid]);

  function get(ch: string): number | null {
    return channels.find(c => c.channel === ch)?.value ?? null;
  }

  async function loadPage() {
    try {
      const devRes = await apiGet(`/devices/deviceid/${encodeURIComponent(deviceid!)}`);
      const devJson = await devRes.json();
      if (!devJson.data) throw new Error(devJson.message || 'Không tìm thấy thiết bị');
      setDevice(devJson.data);

      const [chRes, chartRes] = await Promise.allSettled([
        apiGet(`/latest-data/${encodeURIComponent(deviceid!)}`),
        apiGet(`/data/energy/${encodeURIComponent(deviceid!)}?startTime=${new Date(Date.now() - 86400000).toISOString()}&endTime=${new Date().toISOString()}&sort=asc&limit=500`),
      ]);

      let chs: ChannelData[] = [];
      if (chRes.status === 'fulfilled') {
        const j = await chRes.value.json();
        chs = j.data || [];
        setChannels(chs);
        const latestTs = chs.reduce((max, c) => {
          const t = c.timestamp ? new Date(c.timestamp).getTime() : 0;
          return t > max ? t : max;
        }, 0);
        if (latestTs) {
          const d = new Date(latestTs);
          setTsLabel(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`);
        }
      }

      if (chartRes.status === 'fulfilled') {
        const j = await chartRes.value.json();
        buildChart(j.data || []);
      }

      loadDeviceAlerts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không tải được thông tin');
    }
  }

  function buildChart(data: EnergyRecord[]) {
    const canvas = chartRef.current;
    if (!canvas || !data.length) return;
    chartInst.current?.destroy();
    const sorted = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const labels = sorted.map(d => {
      const dt = new Date(d.timestamp);
      return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    });
    const powers = sorted.map(d => d.power ?? 0);
    chartInst.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Công suất (kW)', data: powers, borderColor: '#38aaff', backgroundColor: 'rgba(56,170,255,0.08)', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: true }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#607b99', font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(56,139,253,0.08)' } },
          y: { ticks: { color: '#607b99', font: { size: 10 } }, grid: { color: 'rgba(56,139,253,0.08)' }, beginAtZero: true },
        },
      },
    });
  }

  async function loadDeviceAlerts() {
    try {
      const res = await apiGet(`/alerts/device/${encodeURIComponent(deviceid!)}?limit=10`);
      const json = await res.json();
      setAlerts(json.data || []);
    } catch {}
  }

  function connectWS() {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.addEventListener('open', () => {
      if (wsTimer.current) clearTimeout(wsTimer.current);
      ws.send(JSON.stringify({ type: 'client_init' }));
    });
    ws.addEventListener('message', evt => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'history_inserted' && msg.data?.deviceid === deviceid) {
          const d = msg.data;
          setChannels(prev => {
            const updated = [...prev];
            const update = (ch: string, val: number | null) => {
              const idx = updated.findIndex(c => c.channel === ch);
              if (idx >= 0) updated[idx] = { ...updated[idx], value: val };
              else if (val != null) updated.push({ channel: ch, value: val });
            };
            update('power', d.power); update('netpower', d.netpower);
            update('per', d.per); update('voltageV1N', d.voltageV1N);
            update('voltageV2N', d.voltageV2N); update('voltageV3N', d.voltageV3N);
            update('currentI1', d.currentI1); update('currentI2', d.currentI2); update('currentI3', d.currentI3);
            return updated;
          });
          if (d.timestamp) {
            const dt = new Date(d.timestamp);
            setTsLabel(`${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')} ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`);
          }
          if (chartInst.current && d.power != null) {
            const dt = new Date(d.timestamp || Date.now());
            const lbl = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            chartInst.current.data.labels!.push(lbl);
            (chartInst.current.data.datasets[0].data as number[]).push(d.power);
            if (chartInst.current.data.labels!.length > 30) {
              chartInst.current.data.labels!.shift();
              (chartInst.current.data.datasets[0].data as number[]).shift();
            }
            chartInst.current.update('none');
          }
        }
      } catch {}
    });
    ws.addEventListener('close', () => { wsTimer.current = setTimeout(connectWS, 5000); });
    ws.addEventListener('error', () => ws.close());
  }

  const sevMap: Record<string, { icon: string; color: string }> = {
    critical: { icon: 'bi-x-octagon-fill', color: '#f44b4b' },
    warning:  { icon: 'bi-exclamation-triangle-fill', color: '#f5a623' },
    info:     { icon: 'bi-info-circle-fill', color: '#38aaff' },
    ok:       { icon: 'bi-check-circle-fill', color: '#22d369' },
  };

  if (error) {
    return (
      <>
        <header className="app-header">
          <button className="btn-back" onClick={() => navigate(-1)}><i className="bi bi-chevron-left" /></button>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Thiết bị</div>
          <div />
        </header>
        <div className="app-content">
          <div className="empty-msg">
            <i className="bi bi-exclamation-circle" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
            {error}
          </div>
        </div>
        <BottomNav active="home" />
      </>
    );
  }

  if (!device) {
    return (
      <>
        <header className="app-header"><div className="app-header-title">Đang tải...</div></header>
        <div className="app-content"><div className="loading-wrap"><div className="spinner" /></div></div>
        <BottomNav active="home" />
      </>
    );
  }

  const v = (ch: string, d = 1) => { const val = get(ch); return val != null ? fmt(val, d) : '--'; };

  return (
    <>
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button className="btn-back" onClick={() => navigate(-1)}><i className="bi bi-chevron-left" /></button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{device.deviceName || deviceid}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{device.location || ''}</div>
          </div>
        </div>
        {statusBadge(device.status)}
      </header>

      <div className="app-content">
        <div className="data-grid" style={{ padding: '12px 16px 0' }}>
          <div className="data-box" style={{ gridColumn: '1/-1' }}>
            <div className="data-box-lbl">
              Công suất hiện tại
              <span style={{ float: 'right', fontSize: 10, color: 'var(--dim)', fontWeight: 400 }}>{tsLabel}</span>
            </div>
            <div className="data-box-val" style={{ fontSize: 28, color: '#38aaff' }}>
              {v('power', 2)} <span className="data-box-unit">kW</span>
            </div>
          </div>
          <div className="data-box">
            <div className="data-box-lbl">Hệ số công suất</div>
            <div className="data-box-val" style={{ color: '#22d369' }}>{v('per', 1)} <span className="data-box-unit">%</span></div>
          </div>
          <div className="data-box">
            <div className="data-box-lbl">Net Power</div>
            <div className="data-box-val">{v('netpower', 2)} <span className="data-box-unit">kW</span></div>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="section-title">Điện áp pha — trung tính</div>
          <div className="data-grid">
            {['voltageV1N', 'voltageV2N', 'voltageV3N'].map((ch, i) => (
              <div key={ch} className="data-box">
                <div className="data-box-lbl">V{i+1}-N</div>
                <div className="data-box-val" style={{ color: '#f5a623' }}>{v(ch)} <span className="data-box-unit">V</span></div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="section-title">Dòng điện</div>
          <div className="data-grid">
            {['currentI1', 'currentI2', 'currentI3'].map((ch, i) => (
              <div key={ch} className="data-box">
                <div className="data-box-lbl">I{i+1}</div>
                <div className="data-box-val" style={{ color: '#a855f7' }}>{v(ch, 2)} <span className="data-box-unit">A</span></div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="section-title">Biểu đồ 24 giờ gần nhất</div>
          <div className="chart-wrap">
            <canvas ref={chartRef} className="chart-canvas" />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="section-title">Thông tin thiết bị</div>
          <div className="info-list">
            {[
              ['Mã thiết bị', device.deviceid],
              ['Loại', device.deviceType || '--'],
              ['Vị trí', device.location || '--'],
              ['Chu kỳ lấy mẫu', `${device.samplingCycle || 60}s`],
            ].map(([lbl, val]) => (
              <div key={lbl} className="info-row">
                <span className="info-row-lbl">{lbl}</span>
                <span className="info-row-val">{val}</span>
              </div>
            ))}
            <div className="info-row">
              <span className="info-row-lbl">Trạng thái</span>
              <span className="info-row-val">{statusBadge(device.status)}</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="section-title">Cảnh báo gần đây</div>
          {alerts.length === 0 ? (
            <div className="empty-msg" style={{ padding: '16px' }}>Không có cảnh báo nào.</div>
          ) : (
            <div className="alert-list">
              {alerts.slice(0, 8).map(a => {
                const s = sevMap[a.severity] || sevMap.info;
                const resolved = a.isComplete || a.resolved;
                return (
                  <div key={a._id} className={`alert-item ${a.severity || 'info'}${resolved ? ' alert-resolved' : ''}`}>
                    <i className={`bi ${s.icon} alert-icon`} style={{ color: s.color }} />
                    <div className="alert-body">
                      <div className="alert-device">{a.message || '--'}</div>
                      <div className="alert-time">{relTime(a.createdAt || a.timestamp)}{resolved ? ' · Đã xử lý' : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="spacer-bottom" />
      </div>

      <BottomNav active="home" />
    </>
  );
}
