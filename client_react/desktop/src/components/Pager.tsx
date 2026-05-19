const BTN: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 6, border: 'none',
  cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)',
};

interface PagerProps {
  total: number;
  page: number;
  pageSize: number;
  onChange: (p: number) => void;
}

export default function Pager({ total, page, pageSize, onChange }: PagerProps) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  const win = 5;
  let start = Math.max(1, page - Math.floor(win / 2));
  const end = Math.min(pages, start + win - 1);
  if (end - start + 1 < win) start = Math.max(1, end - win + 1);
  const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
      <button style={{ ...BTN, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
        disabled={page === 1} onClick={() => onChange(1)} title="Đầu">
        <i className="bi bi-chevron-double-left" />
      </button>
      <button style={{ ...BTN, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
        disabled={page === 1} onClick={() => onChange(page - 1)} title="Trước">
        <i className="bi bi-chevron-left" />
      </button>

      {nums.map(n => (
        <button key={n} onClick={() => onChange(n)}
          style={{ ...BTN, background: n === page ? 'var(--accent)' : 'var(--bg-elevated)', color: n === page ? '#fff' : 'var(--text-muted)' }}>
          {n}
        </button>
      ))}

      <button style={{ ...BTN, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
        disabled={page === pages} onClick={() => onChange(page + 1)} title="Sau">
        <i className="bi bi-chevron-right" />
      </button>
      <button style={{ ...BTN, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
        disabled={page === pages} onClick={() => onChange(pages)} title="Cuối">
        <i className="bi bi-chevron-double-right" />
      </button>

      <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 6 }}>
        {from}–{to} / {total.toLocaleString()}
      </span>
    </div>
  );
}
