import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface Device {
  deviceid: string;
  deviceName?: string;
  location?: string;
  samplingCycle?: number;
}

interface EnergyRow {
  timestamp: string;
  power?: number;
}

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
}

export default function AnalysisPage() {
  useAuth();
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selDevice, setSelDevice] = useState('all');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, avg: 0, peak: 0 });

  const chart24Ref = useRef<HTMLCanvasElement>(null);
  const chart7Ref = useRef<HTMLCanvasElement>(null);
  const chart24Inst = useRef<Chart | null>(null);
  const chart7Inst = useRef<Chart | null>(null);

  useEffect(() => { loadDevices(); }, []);
  useEffect(() => { loadAnalysis(); }, [selDevice, devices]);

  async function loadDevices() {
    try {
      const res = await apiGet('/devices?limit=1000');
      const json = await res.json();
      setDevices(json.data || json.devices || []);
    } catch {}
  }

  async function loadAnalysis() {
    if (selDevice === 'all' && !devices.length) return;
    setLoading(true);
    try {
      const targets = selDevice === 'all' ? devices : devices.filter(d => d.deviceid === selDevice);
      if (!targets.length) { setLoading(false); return; }

      const now = new Date();
      const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);
      const start7d = new Date(now); start7d.setDate(now.getDate() - 6); start7d.setHours(0, 0, 0, 0);

      const [day24, week7] = await Promise.all([
        Promise.all(targets.map(d =>
          apiGet(`/data/energy/${encodeURIComponent(d.deviceid)}?startTime=${startDay.toISOString()}&endTime=${now.toISOString()}&limit=5000&sort=asc`)
            .then(r => r.json()).then(j => ({ device: d, rows: (j.data || []) as EnergyRow[] }))
            .catch(() => ({ device: d, rows: [] as EnergyRow[] }))
        )),
        Promise.all(targets.map(d =>
          apiGet(`/data/energy/${encodeURIComponent(d.deviceid)}?startTime=${start7d.toISOString()}&endTime=${now.toISOString()}&limit=10000&sort=asc`)
            .then(r => r.json()).then(j => ({ device: d, rows: (j.data || []) as EnergyRow[] }))
            .catch(() => ({ device: d, rows: [] as EnergyRow[] }))
        )),
      ]);

      buildChart24(day24.flatMap(r => r.rows));
      buildChart7(week7.flatMap(r => r.rows), start7d, targets);
    } catch {
      showToast('Lỗi tải dữ liệu phân tích', 'error');
    } finally {
      setLoading(false);
    }
  }

  function buildChart24(rows: EnergyRow[]) {
    const hourBuckets = Array(24).fill(0);
    const hourCounts = Array(24).fill(0);
    let peak = 0;
    rows.forEach(r => {
      const h = new Date(r.timestamp).getHours();
      hourBuckets[h] += (r.power || 0);
      hourCounts[h]++;
      if ((r.power || 0) > peak) peak = r.power || 0;
    });
    const avgPowers = hourBuckets.map((s, i) => hourCounts[i] ? s / hourCounts[i] : 0);
    const totalKwh = rows.length ? rows.reduce((a, r) => a + (r.power || 0) * (60 / 3600), 0) : 0;
    const avgPow = rows.length ? rows.reduce((a, r) => a + (r.power || 0), 0) / rows.length : 0;
    setStats({ total: totalKwh, avg: avgPow, peak });

    const canvas = chart24Ref.current; if (!canvas) return;
    chart24Inst.current?.destroy();
    chart24Inst.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
        datasets: [{
          label: 'kW', data: avgPowers.map(v => +v.toFixed(2)),
          borderColor: '#38aaff', backgroundColor: 'rgba(56,170,255,0.08)',
          borderWidth: 2, pointRadius: 2, tension: 0.35, fill: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#607b99', font: { size: 10 }, maxTicksLimit: 12 }, grid: { color: 'rgba(56,139,253,0.08)' } },
          y: { ticks: { color: '#607b99', font: { size: 11 } }, grid: { color: 'rgba(56,139,253,0.08)' }, beginAtZero: true },
        },
      },
    });
  }

  function buildChart7(rows: EnergyRow[], startDate: Date, _targets: Device[]) {
    const buckets = Array(7).fill(0);
    const counts = Array(7).fill(0);
    rows.forEach(r => {
      const bi = Math.floor((new Date(r.timestamp).getTime() - startDate.getTime()) / 86400000);
      if (bi >= 0 && bi < 7) { buckets[bi] += (r.power || 0); counts[bi]++; }
    });
    const kwhBuckets = buckets.map((s, i) => counts[i] ? (s / counts[i]) * (86400000 / 3600000) : 0);
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const labels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startDate); d.setDate(d.getDate() + i);
      return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
    });

    const canvas = chart7Ref.current; if (!canvas) return;
    chart7Inst.current?.destroy();
    chart7Inst.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'kWh', data: kwhBuckets.map(v => +v.toFixed(1)),
          backgroundColor: 'rgba(168,85,247,0.6)', borderColor: '#a855f7', borderWidth: 1, borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#607b99', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#607b99', font: { size: 11 } }, grid: { color: 'rgba(56,139,253,0.08)' }, beginAtZero: true },
        },
      },
    });
  }

  const topbarRight = (
    <button className="btn-icon" onClick={() => loadAnalysis()} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
  );

  return (
    <Layout title="Phân tích Năng lượng" breadcrumb={['ViPower', 'Giám sát', 'Phân tích']} topbarRight={topbarRight}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Thiết bị:</label>
        <select className="filter-select" value={selDevice} onChange={e => setSelDevice(e.target.value)}>
          <option value="all">Tất cả thiết bị</option>
          {devices.map(d => <option key={d.deviceid} value={d.deviceid}>{d.deviceName || d.deviceid}</option>)}
        </select>
        {loading && <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--accent)', ['--kpi-bg' as string]: 'var(--accent-dim)', ['--kpi-border' as string]: 'rgba(56,170,255,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Điện năng hôm nay</div>
              <div className="kpi-value">{fmt(stats.total, 1)} <sup>kWh</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-lightning-charge-fill" /></div>
          </div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--green)', ['--kpi-bg' as string]: 'var(--green-glow)', ['--kpi-border' as string]: 'rgba(34,211,105,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Công suất trung bình</div>
              <div className="kpi-value">{fmt(stats.avg, 1)} <sup>kW</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-speedometer2" /></div>
          </div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--yellow)', ['--kpi-bg' as string]: 'var(--yellow-glow)', ['--kpi-border' as string]: 'rgba(245,166,35,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Công suất đỉnh</div>
              <div className="kpi-value">{fmt(stats.peak, 1)} <sup>kW</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-graph-up-arrow" /></div>
          </div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--purple)', ['--kpi-bg' as string]: 'rgba(168,85,247,0.1)', ['--kpi-border' as string]: 'rgba(168,85,247,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Tỷ lệ tải</div>
              <div className="kpi-value">
                {stats.peak > 0 ? fmt((stats.avg / stats.peak) * 100, 0) : '--'} <sup>%</sup>
              </div>
            </div>
            <div className="kpi-icon"><i className="bi bi-pie-chart" /></div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-activity" />Công suất 24h hôm nay (kW)</span>
          </div>
          <div className="chart-wrap" style={{ height: 240 }}>
            <canvas ref={chart24Ref} />
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-bar-chart-fill" />Tiêu thụ 7 ngày qua (kWh/ngày)</span>
          </div>
          <div className="chart-wrap" style={{ height: 240 }}>
            <canvas ref={chart7Ref} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
