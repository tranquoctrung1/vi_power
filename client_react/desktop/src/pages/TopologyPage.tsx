import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet } from '../api/client';
import Layout from '../components/Layout';
import { WS_URL } from '../config';

interface Device {
  _id: string;
  deviceid: string;
  deviceName: string;
  location?: string;
  deviceType?: string;
  status: string;
  displaygroupid?: string;
}

interface DisplayGroup {
  displaygroupid: string;
  name: string;
}

const STATUS_COLOR: Record<string, string> = {
  active: '#22d369', offline: '#f44b4b', error: '#f44b4b', inactive: '#3a506b', paused: '#f5a623',
};

const STATUS_ICON: Record<string, string> = {
  active: 'bi-lightning-charge-fill', offline: 'bi-wifi-off', error: 'bi-exclamation-triangle-fill',
  inactive: 'bi-power', paused: 'bi-pause-circle',
};

export default function TopologyPage() {
  useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DisplayGroup[]>([]);
  const [powerMap, setPowerMap] = useState<Record<string, number>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    load();
    connectWS();
    return () => wsRef.current?.close();
  }, []);

  async function load() {
    try {
      const [devRes, grpRes] = await Promise.allSettled([
        apiGet('/devices?limit=1000'),
        apiGet('/displaygroups'),
      ]);
      if (devRes.status === 'fulfilled') {
        const j = await devRes.value.json();
        setDevices((j.data || j.devices || []).filter((d: Device) => d.deviceid));
      }
      if (grpRes.status === 'fulfilled') {
        const j = await grpRes.value.json();
        setGroups(j.data || []);
      }
    } catch {}
  }

  function connectWS() {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.addEventListener('open', () => {
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
        }
        if (msg.type === 'history_inserted' && msg.data?.deviceid) {
          const d = msg.data;
          setPowerMap(prev => ({ ...prev, [d.deviceid]: d.power ?? prev[d.deviceid] ?? 0 }));
          setDevices(prev => prev.map(dev =>
            dev.deviceid === d.deviceid && d.status ? { ...dev, status: d.status } : dev
          ));
        }
      } catch {}
    });
    ws.addEventListener('close', () => { setWsConnected(false); setTimeout(connectWS, 5000); });
    ws.addEventListener('error', () => ws.close());
  }

  const grouped: Record<string, Device[]> = {};
  const ungrouped: Device[] = [];
  devices.forEach(d => {
    if (d.displaygroupid) {
      if (!grouped[d.displaygroupid]) grouped[d.displaygroupid] = [];
      grouped[d.displaygroupid].push(d);
    } else {
      ungrouped.push(d);
    }
  });

  const topbarRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="status-live" style={{ color: wsConnected ? 'var(--green)' : 'var(--text-muted)' }}>
        <div className="pulse-dot" style={{ background: wsConnected ? 'var(--green)' : 'var(--text-muted)', boxShadow: wsConnected ? '0 0 6px var(--green)' : 'none' }} />
        {wsConnected ? 'REALTIME' : 'OFFLINE'}
      </div>
      <button className="btn-icon" onClick={load} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
    </div>
  );

  const renderGroup = (devs: Device[], label: string, color = 'var(--accent)') => (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        {label}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>
          {devs.filter(d => d.status === 'active').length}/{devs.length} hoạt động
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {devs.map(d => (
          <div key={d.deviceid} className={`topology-node ${d.status}`}
            title={`${d.deviceName} — ${d.status}`}>
            <div className="topology-node-icon">
              <i className={`bi ${STATUS_ICON[d.status] || STATUS_ICON.inactive}`} style={{ color: STATUS_COLOR[d.status] }} />
            </div>
            <div className="topology-node-name">{d.deviceName || d.deviceid}</div>
            <div className="topology-node-val">
              {powerMap[d.deviceid] != null
                ? `${Number(powerMap[d.deviceid]).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kW`
                : d.location || '--'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const GROUP_COLORS = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b', '#ff7043'];

  return (
    <Layout title="Sơ đồ Nhà máy" breadcrumb={['ViPower', 'Hệ thống', 'Sơ đồ']} topbarRight={topbarRight}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, fontSize: 12, color: 'var(--text-muted)' }}>
        {Object.entries(STATUS_COLOR).map(([s, c]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
            {s}
          </div>
        ))}
      </div>

      {groups.length > 0
        ? groups.map((g, i) => {
            const devs = grouped[g.displaygroupid] || [];
            return renderGroup(devs, g.name, GROUP_COLORS[i % GROUP_COLORS.length]);
          })
        : null
      }
      {ungrouped.length > 0 && renderGroup(ungrouped, 'Thiết bị khác', 'var(--text-muted)')}
      {devices.length === 0 && (
        <div className="empty-state"><i className="bi bi-diagram-3" />Không có thiết bị nào.</div>
      )}
    </Layout>
  );
}
