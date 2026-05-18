import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiGet } from '../api/client';
import Layout from '../components/Layout';
import { WS_URL } from '../config';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface Device {
  _id: string;
  deviceid: string;
  deviceName: string;
  location?: string;
  deviceType?: string;
  status: string;
  displaygroupid?: string;
}

interface AlertItem {
  _id: string;
  deviceid: string;
  message: string;
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
  if (s < 60) return `${s}s trước`;
  if (s < 3600) return `${Math.floor(s / 60)}p trước`;
  if (s < 86400) return `${Math.floor(s / 3600)}h trước`;
  return `${Math.floor(s / 86400)}d trước`;
}

const SEV_CONFIG: Record<string, { icon: string; color: string }> = {
  critical: { icon: 'bi-x-octagon-fill',            color: '#f44b4b' },
  warning:  { icon: 'bi-exclamation-triangle-fill', color: '#f5a623' },
  info:     { icon: 'bi-info-circle-fill',           color: '#38aaff' },
  ok:       { icon: 'bi-check-circle-fill',          color: '#22d369' },
};

const STATUS_DOT: Record<string, string> = {
  active: '#22d369', offline: '#f44b4b', error: '#f44b4b', inactive: '#3a506b', paused: '#f5a623',
};

function currentShift(): { label: string; start: number; end: number } {
  const h = new Date().getHours();
  if (h < 8)  return { label: 'Ca A', start: 0,  end: 8  };
  if (h < 16) return { label: 'Ca B', start: 8,  end: 16 };
  return           { label: 'Ca C', start: 16, end: 24 };
}

export default function DashboardPage() {
  useAuth();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [powerMap, setPowerMap] = useState<Record<string, number>>({});
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('--:--:--');
  const [kpiEnergy, setKpiEnergy] = useState(0);
  const [, setKpiPower] = useState(0);
  const [peakToday, setPeakToday] = useState(0);
  const [topConsumers, setTopConsumers] = useState<{ deviceid: string; name: string; kwh: number }[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);

  // history buffer for main chart (last 60 points)
  const historyRef = useRef<{ t: string; v: number }[]>([]);

  useEffect(() => {
    loadInitial();
    connectWS();
    const clockTick = setInterval(() => {}, 1000);
    return () => {
      wsRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
      chartInst.current?.destroy();
      clearInterval(clockTick);
    };
  }, []);

  async function loadInitial() {
    try {
      const [devRes, alertRes] = await Promise.allSettled([
        apiGet('/devices?limit=1000'),
        apiGet('/alerts?resolved=false&limit=50'),
      ]);
      if (devRes.status === 'fulfilled') {
        const j = await devRes.value.json();
        const devs: Device[] = (j.data || j.devices || []).filter((d: Device) => d.deviceid);
        setDevices(devs);
        const dm: Record<string, string> = {};
        devs.forEach(d => { dm[d.deviceid] = d.deviceName || d.deviceid; });
        setDeviceMap(dm);
      }
      if (alertRes.status === 'fulfilled') {
        const j = await alertRes.value.json();
        setAlerts((j.data || []).filter((a: AlertItem) => !a.isComplete && !a.resolved).slice(0, 10));
      }

      // Load today's energy
      const now = new Date();
      const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);
      const allDevRes = await apiGet('/devices?limit=1000');
      const allDevJson = await allDevRes.json();
      const devids: string[] = (allDevJson.data || allDevJson.devices || []).map((d: Device) => d.deviceid);

      if (devids.length) {
        const results = await Promise.allSettled(
          devids.map(id => apiGet(`/data/energy/${encodeURIComponent(id)}?startTime=${startDay.toISOString()}&endTime=${now.toISOString()}&limit=2000&sort=asc`).then(r => r.json()))
        );
        let totalKwh = 0;
        let peakPower = 0;
        const devKwh: { deviceid: string; kwh: number }[] = [];

        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return;
          const rows: { power?: number; timestamp: string }[] = r.value.data || [];
          let devKwhSum = 0;
          rows.forEach(row => {
            totalKwh += (row.power || 0) * (60 / 3600);
            devKwhSum += (row.power || 0) * (60 / 3600);
            if ((row.power || 0) > peakPower) peakPower = row.power || 0;
          });
          if (devids[i]) devKwh.push({ deviceid: devids[i], kwh: devKwhSum });

          if (i === 0) {
            historyRef.current = rows.slice(-60).map(row => ({ t: row.timestamp, v: row.power || 0 }));
          }
        });

        setKpiEnergy(totalKwh);
        setPeakToday(peakPower);

        const top = devKwh.sort((a, b) => b.kwh - a.kwh).slice(0, 5).map(d => ({
          deviceid: d.deviceid,
          name: devids.includes(d.deviceid)
            ? (allDevJson.data || allDevJson.devices || []).find((dev: Device) => dev.deviceid === d.deviceid)?.deviceName || d.deviceid
            : d.deviceid,
          kwh: d.kwh,
        }));
        setTopConsumers(top);

        buildMainChart();
      }
    } catch {}
  }

  function buildMainChart() {
    const canvas = chartRef.current;
    if (!canvas) return;
    const history = historyRef.current;
    chartInst.current?.destroy();
    chartInst.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels: history.map(h => {
          const d = new Date(h.t);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }),
        datasets: [{
          label: 'kW', data: history.map(h => h.v),
          borderColor: '#38aaff', backgroundColor: 'rgba(56,170,255,0.08)',
          borderWidth: 2, pointRadius: 0, tension: 0.35, fill: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#607b99', font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: 'rgba(56,139,253,0.06)' } },
          y: { ticks: { color: '#607b99', font: { size: 11 } }, grid: { color: 'rgba(56,139,253,0.06)' }, beginAtZero: true },
        },
      },
    });
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
            if (latest?.power != null) pm[entry.deviceid] = latest.power;
          });
          setPowerMap(pm);
          if (msg.data?.devices?.data) {
            const devs = msg.data.devices.data;
            setDevices(devs);
            const dm: Record<string, string> = {};
            devs.forEach((d: Device) => { dm[d.deviceid] = d.deviceName || d.deviceid; });
            setDeviceMap(dm);
          }
          const totalPow = Object.values(pm).reduce((a: number, b: number) => a + b, 0);
          setKpiPower(totalPow);
          touchUpdate();
        }
        if (msg.type === 'history_inserted' && msg.data) {
          const d = msg.data;
          if (d.deviceid && d.power != null) {
            setPowerMap(prev => ({ ...prev, [d.deviceid]: d.power }));
            setKpiPower(() => {
              const pm2: Record<string, number> = { ...powerMap, [d.deviceid]: d.power as number };
              return Object.values(pm2).reduce((a: number, b: number) => a + (b || 0), 0);
            });
            if (d.power > peakToday) setPeakToday(d.power);

            if (chartInst.current && d.timestamp) {
              const dt = new Date(d.timestamp);
              const lbl = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
              chartInst.current.data.labels!.push(lbl);
              (chartInst.current.data.datasets[0].data as number[]).push(d.power);
              if (chartInst.current.data.labels!.length > 60) {
                chartInst.current.data.labels!.shift();
                (chartInst.current.data.datasets[0].data as number[]).shift();
              }
              chartInst.current.update('none');
            }
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
  const shift = currentShift();
  const activeAlerts = alerts.filter(a => !a.isComplete && !a.resolved).length;

  const topbarRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="status-live">
        <div className="pulse-dot" style={{ background: wsConnected ? 'var(--green)' : 'var(--red)', boxShadow: wsConnected ? '0 0 6px var(--green)' : 'none', animation: wsConnected ? '' : 'none' }} />
        REALTIME
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{lastUpdate}</span>
      <button className="btn-icon" onClick={loadInitial} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
    </div>
  );

  return (
    <Layout title="Dashboard Năng Lượng" breadcrumb={['ViPower', 'Nhà máy Xử lý Nước', 'Dashboard']} topbarRight={topbarRight}>
      {/* Shift bar */}
      <div className="shift-bar">
        <i className="bi bi-clock-history" style={{ color: 'var(--text-muted)', fontSize: 14 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Ca làm việc</span>
        <div className="shift-sep">|</div>
        {[{ label: 'Ca A', start: 0, end: 8 }, { label: 'Ca B', start: 8, end: 16 }, { label: 'Ca C', start: 16, end: 24 }].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className={`shift-badge${s.label === shift.label ? ' active' : ''}`}>{s.label}</span>
            <span className="shift-range">{String(s.start).padStart(2, '0')}:00 – {String(s.end).padStart(2, '0')}:00</span>
          </div>
        ))}
      </div>

      {/* Peak banner */}
      <div className="peak-banner">
        <div className="peak-banner-title"><i className="bi bi-lightning-fill" /><span>Peak Demand</span></div>
        <div className="peak-banner-item">
          <span className="label">Hôm nay – Đỉnh</span>
          <span className="val yellow">{fmt(peakToday, 1)} kW</span>
        </div>
        <div className="peak-banner-sep" />
        <div className="peak-banner-item">
          <span className="label">Công suất hiện tại</span>
          <span className="val" style={{ fontSize: 16, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{fmt(totalPower, 1)} kW</span>
        </div>
        <div className="peak-banner-sep" />
        <div className="peak-progress-wrap">
          <div className="peak-progress-label">
            <span>Mức dùng hiện tại vs. Đỉnh hôm nay</span>
            <span style={{ color: 'var(--yellow)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {peakToday > 0 ? fmt((totalPower / peakToday) * 100, 0) : '--'}%
            </span>
          </div>
          <div className="peak-bar-track">
            <div className="peak-bar-fill" style={{ width: `${peakToday > 0 ? Math.min(100, (totalPower / peakToday) * 100) : 0}%`, background: 'linear-gradient(90deg,#22d369,#f5a623)' }} />
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--accent)', ['--kpi-bg' as string]: 'var(--accent-dim)', ['--kpi-border' as string]: 'var(--border-bright)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Điện năng hôm nay</div>
              <div className="kpi-value">{fmt(kpiEnergy, 1)} <sup>kWh</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-lightning-charge-fill" /></div>
          </div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--green)', ['--kpi-bg' as string]: 'var(--green-glow)', ['--kpi-border' as string]: 'rgba(34,211,105,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Công suất tức thời</div>
              <div className="kpi-value">{fmt(totalPower, 1)} <sup>kW</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-speedometer2" /></div>
          </div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--yellow)', ['--kpi-bg' as string]: 'var(--yellow-glow)', ['--kpi-border' as string]: 'rgba(245,166,35,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Thiết bị online</div>
              <div className="kpi-value">{online} <sup>/{devices.length}</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-hdd-stack" /></div>
          </div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--red)', ['--kpi-bg' as string]: 'var(--red-glow)', ['--kpi-border' as string]: 'rgba(244,75,75,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Cảnh báo active</div>
              <div className="kpi-value">{activeAlerts} <sup>active</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-bell-fill" /></div>
          </div>
        </div>
      </div>

      <div className="section-row">
        <span className="section-label">Biểu đồ công suất & trạng thái</span>
        <div className="section-line" />
      </div>

      <div className="grid-main">
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-activity" />Công suất thời gian thực</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Toàn nhà máy</span>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
            </div>
          </div>
          <div className="chart-wrap" style={{ height: 240 }}>
            <canvas ref={chartRef} />
          </div>
          <div className="chart-insight-bar">
            <div className="chart-insight-item">
              <span className="chart-insight-label">Công suất hiện tại</span>
              <span className="chart-insight-val accent">{fmt(totalPower, 1)} kW</span>
            </div>
            <div className="chart-insight-item">
              <span className="chart-insight-label">Đỉnh hôm nay</span>
              <span className="chart-insight-val yellow">{fmt(peakToday, 1)} kW</span>
            </div>
            <div className="chart-insight-item">
              <span className="chart-insight-label">Điện năng hôm nay</span>
              <span className="chart-insight-val green">{fmt(kpiEnergy, 1)} kWh</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-hdd-stack" />Trạng thái thiết bị</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{online}/{devices.length} online</span>
          </div>
          <div className="area-status-list">
            {devices.slice(0, 8).map(d => (
              <div key={d.deviceid} className="area-row" style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/device?deviceid=${encodeURIComponent(d.deviceid)}`)}>
                <div className="area-dot" style={{ background: STATUS_DOT[d.status] || '#3a506b' }} />
                <div className="area-name" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.deviceName || d.deviceid}
                </div>
                <div className="area-val" style={{ fontSize: 12 }}>
                  {powerMap[d.deviceid] != null ? `${fmt(powerMap[d.deviceid], 1)} kW` : '--'}
                </div>
              </div>
            ))}
            {devices.length > 8 && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0', cursor: 'pointer' }}
                onClick={() => navigate('/devices')}>
                +{devices.length - 8} thiết bị khác
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="section-row">
        <span className="section-label">Phân tích thiết bị & cảnh báo</span>
        <div className="section-line" />
      </div>

      <div className="grid-bottom">
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-sort-down" />Top tiêu thụ cao nhất</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>kWh hôm nay</span>
          </div>
          <div className="consumer-list">
            {topConsumers.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}><i className="bi bi-bar-chart" />Chưa có dữ liệu</div>
            ) : topConsumers.map((c, i) => {
              const maxKwh = topConsumers[0]?.kwh || 1;
              return (
                <div key={c.deviceid} className="consumer-row">
                  <div className="consumer-rank">{i + 1}</div>
                  <div className="consumer-name">{c.name}</div>
                  <div className="consumer-bar-wrap">
                    <div className="consumer-bar" style={{ width: `${(c.kwh / maxKwh) * 100}%` }} />
                  </div>
                  <div className="consumer-val">{fmt(c.kwh, 1)} kWh</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-hdd-network" />Danh sách thiết bị</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{devices.length} thiết bị</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {devices.slice(0, 8).map(d => (
              <div key={d.deviceid} className="device-mini-row"
                onClick={() => navigate(`/device?deviceid=${encodeURIComponent(d.deviceid)}`)}>
                <div className="device-mini-dot" style={{ background: STATUS_DOT[d.status] || '#3a506b' }} />
                <div className="device-mini-name">{d.deviceName || d.deviceid}</div>
                <div className="device-mini-power">
                  {powerMap[d.deviceid] != null ? `${fmt(powerMap[d.deviceid], 1)} kW` : '--'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-exclamation-triangle" />Cảnh báo gần nhất</span>
            <button style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => navigate('/alerts')}>Xem tất cả →</button>
          </div>
          {alerts.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>
              <i className="bi bi-bell-slash" />Không có cảnh báo nào.
            </div>
          ) : (
            <div className="alert-list-wrap">
              {alerts.slice(0, 6).map(a => {
                const s = SEV_CONFIG[a.severity] || SEV_CONFIG.info;
                return (
                  <div key={a._id} className={`alert-row ${a.severity || 'info'}`}>
                    <i className={`bi ${s.icon} alert-row-icon`} style={{ color: s.color }} />
                    <div className="alert-row-body">
                      <div className="alert-row-device">{deviceMap[a.deviceid] || a.deviceid || '--'}</div>
                      <div className="alert-row-msg">{a.message || '--'}</div>
                      <div className="alert-row-meta">{relTime(a.createdAt || a.timestamp)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
