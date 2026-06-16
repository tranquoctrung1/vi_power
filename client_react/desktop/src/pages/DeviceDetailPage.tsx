import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWS } from '../contexts/WSContext';
import { apiGet } from '../api/client';
import Layout from '../components/Layout';
import { Chart } from 'chart.js';
import '../utils/chartDefaults';

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

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
}

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  active:   { cls: 'badge-active',   label: 'Hoạt động' },
  offline:  { cls: 'badge-offline',  label: 'Offline' },
  error:    { cls: 'badge-error',    label: 'Lỗi' },
  inactive: { cls: 'badge-inactive', label: 'Tắt' },
  paused:   { cls: 'badge-paused',   label: 'Dừng' },
};

export default function DeviceDetailPage() {
  useAuth();
  const navigate = useNavigate();
  const { subscribe, send } = useWS();
  const [params] = useSearchParams();
  const deviceid = params.get('deviceid');

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [tsLabel, setTsLabel] = useState('--');
  const [error, setError] = useState('');
  // netpower is a lifetime cumulative kWh counter; "today" energy = current - baseline at VN
  // midnight. Same method as Dashboard's todayEnergyFromMap, so figures always agree.
  const [todayBaseline, setTodayBaseline] = useState<number | null>(null);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);

  useEffect(() => {
    if (!deviceid) { navigate('/', { replace: true }); return; }
    load();
    send({ type: 'request_energy_today', message: { area: 'all', device: deviceid } });
    const uEnergy = subscribe('energy_today', (d: unknown) => {
      const ev = d as { devices?: { deviceId: string; baseline: number }[] };
      const entry = ev?.devices?.find(x => x.deviceId === deviceid);
      if (entry) setTodayBaseline(entry.baseline);
    });
    const u = subscribe('history_inserted', (d: unknown) => {
      const ev = d as { deviceid?: string; power?: number; netpower?: number; per?: number; timestamp?: string;
        voltageV1N?: number; voltageV2N?: number; voltageV3N?: number;
        currentI1?: number; currentI2?: number; currentI3?: number };
      if (!ev || ev.deviceid !== deviceid) return;
      setChannels(prev => {
        const updated = [...prev];
        const upd = (ch: string, val: number | null | undefined) => {
          const idx = updated.findIndex(c => c.channel === ch);
          if (idx >= 0) updated[idx] = { ...updated[idx], value: val ?? null };
          else if (val != null) updated.push({ channel: ch, value: val });
        };
        upd('power', ev.power); upd('netpower', ev.netpower); upd('per', ev.per);
        upd('voltageV1N', ev.voltageV1N); upd('voltageV2N', ev.voltageV2N); upd('voltageV3N', ev.voltageV3N);
        upd('currentI1', ev.currentI1); upd('currentI2', ev.currentI2); upd('currentI3', ev.currentI3);
        return updated;
      });
      if (ev.timestamp) {
        const dt = new Date(ev.timestamp);
        setTsLabel(`${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')} ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`);
      }
      if (chartInst.current && ev.power != null) {
        const dt = new Date(ev.timestamp || Date.now());
        const lbl = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        chartInst.current.data.labels!.push(lbl);
        (chartInst.current.data.datasets[0].data as number[]).push(ev.power);
        if (chartInst.current.data.labels!.length > 60) {
          chartInst.current.data.labels!.shift();
          (chartInst.current.data.datasets[0].data as number[]).shift();
        }
        chartInst.current.update('none');
      }
    });
    return () => { u(); uEnergy(); chartInst.current?.destroy(); };
  }, [deviceid]);

  function get(ch: string): number | null {
    return channels.find(c => c.channel === ch)?.value ?? null;
  }

  async function load() {
    try {
      const devRes = await apiGet(`/devices/deviceid/${encodeURIComponent(deviceid!)}`);
      const devJson = await devRes.json();
      if (!devJson.data) throw new Error(devJson.message || 'Không tìm thấy thiết bị');
      setDevice(devJson.data);

      const [chRes, chartRes] = await Promise.allSettled([
        apiGet(`/latest-data/${encodeURIComponent(deviceid!)}`),
        apiGet(`/data/energy/${encodeURIComponent(deviceid!)}?startTime=${new Date(Date.now() - 86400000).toISOString()}&endTime=${new Date().toISOString()}&sort=asc&limit=500`),
      ]);

      if (chRes.status === 'fulfilled') {
        const j = await chRes.value.json();
        const chs: ChannelData[] = j.data || [];
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được thông tin');
    }
  }

  function buildChart(data: { timestamp: string; power?: number }[]) {
    const canvas = chartRef.current;
    if (!canvas || !data.length) return;
    chartInst.current?.destroy();
    const sorted = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const labels = sorted.map(d => {
      const dt = new Date(d.timestamp);
      return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    });
    chartInst.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'kW', data: sorted.map(d => d.power ?? 0), borderColor: '#38aaff', backgroundColor: 'rgba(56,170,255,0.08)', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: true }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#607b99', font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: 'rgba(56,139,253,0.06)' } },
          y: { ticks: { color: '#607b99', font: { size: 11 } }, grid: { color: 'rgba(56,139,253,0.06)' }, beginAtZero: true },
        },
      },
    });
  }


  const v = (ch: string, d = 1) => { const val = get(ch); return val != null ? fmt(val, d) : '--'; };

  const topbarRight = (
    <button className="btn-ghost" onClick={() => navigate(-1)}><i className="bi bi-arrow-left" />Quay lại</button>
  );

  if (error) {
    return (
      <Layout title="Thiết bị" topbarRight={topbarRight}>
        <div className="empty-state"><i className="bi bi-exclamation-circle" style={{ color: 'var(--red)' }} />{error}</div>
      </Layout>
    );
  }

  if (!device) {
    return (
      <Layout title="Đang tải..." topbarRight={topbarRight}>
        <div className="loading-wrap"><div className="spinner" /></div>
      </Layout>
    );
  }

  const statusBadge = STATUS_BADGE[device.status] || STATUS_BADGE.inactive;

  return (
    <Layout title={device.deviceName || deviceid || 'Thiết bị'}
      breadcrumb={['ViPower', 'Thiết bị', device.deviceName || deviceid || '']}
      topbarRight={topbarRight}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{device.location || ''}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>Cập nhật: {tsLabel}</span>
      </div>

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Công suất hiện tại</div>
              <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                {v('power', 2)} <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>kW</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Hệ số công suất</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                {get('per') != null ? fmt(get('per')! * 100, 1) : '--'} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>%</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Điện năng hôm nay</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {get('netpower') != null && todayBaseline != null ? fmt(Math.max(0, get('netpower')! - todayBaseline), 2) : '--'} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>kWh</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-bottom" style={{ marginBottom: 14 }}>
        {['voltageV1N', 'voltageV2N', 'voltageV3N'].map((ch, i) => (
          <div key={ch} className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>V{i + 1}-N</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>{v(ch)} V</div>
          </div>
        ))}
        {['currentI1', 'currentI2', 'currentI3'].map((ch, i) => (
          <div key={ch} className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>I{i + 1}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--purple)' }}>{v(ch, 2)} A</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><i className="bi bi-activity" />Biểu đồ 24 giờ gần nhất</span>
        </div>
        <div className="chart-wrap" style={{ height: 260 }}>
          <canvas ref={chartRef} />
        </div>
      </div>
    </Layout>
  );
}
