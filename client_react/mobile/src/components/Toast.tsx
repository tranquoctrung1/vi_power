import { useState, createContext, useContext, useCallback } from 'react';

interface ToastItem { id: number; msg: string; type: 'info' | 'ok' | 'warn' | 'error'; }

interface ToastContextValue { showToast: (msg: string, type?: ToastItem['type']) => void; }

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  let nextId = 0;

  const showToast = useCallback((msg: string, type: ToastItem['type'] = 'info') => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const icons: Record<string, string> = {
    info: 'bi-info-circle-fill', ok: 'bi-check-circle-fill',
    warn: 'bi-exclamation-triangle-fill', error: 'bi-x-circle-fill',
  };
  const colors: Record<string, string> = {
    info: '#38aaff', ok: '#22d369', warn: '#f5a623', error: '#f44b4b',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast-msg">
            <i className={`bi ${icons[t.type]}`} style={{ color: colors[t.type] }} />
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
