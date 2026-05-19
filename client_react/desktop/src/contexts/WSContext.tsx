import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { WS_URL } from '../config';

type MsgHandler = (data: unknown) => void;

interface WSContextType {
  send: (msg: object) => void;
  subscribe: (type: string, handler: MsgHandler) => () => void;
  connected: boolean;
}

const WSContext = createContext<WSContextType>({
  send: () => {},
  subscribe: () => () => {},
  connected: false,
});

export function WSProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MsgHandler>>>(new Map());
  const lastDataInitRef = useRef<unknown>(null);
  const reconnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [connected, setConnected] = useState(false);

  function connect() {
    if (!mountedRef.current) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      if (reconnTimerRef.current) { clearTimeout(reconnTimerRef.current); reconnTimerRef.current = null; }
      ws.send(JSON.stringify({ type: 'client_init' }));
      if (mountedRef.current) setConnected(true);
    });

    ws.addEventListener('message', evt => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg.type === 'data_init') lastDataInitRef.current = msg.data;
        const handlers = handlersRef.current.get(msg.type);
        if (handlers) handlers.forEach(h => h(msg.data ?? msg));
      } catch {}
    });

    ws.addEventListener('close', () => {
      if (mountedRef.current) {
        setConnected(false);
        reconnTimerRef.current = setTimeout(connect, 5000);
      }
    });

    ws.addEventListener('error', () => ws.close());
  }

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      if (reconnTimerRef.current) clearTimeout(reconnTimerRef.current);
    };
  }, []);

  function send(msg: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(msg));
  }

  function subscribe(type: string, handler: MsgHandler): () => void {
    if (!handlersRef.current.has(type)) handlersRef.current.set(type, new Set());
    handlersRef.current.get(type)!.add(handler);
    // deliver cached data_init immediately so newly-mounted pages don't miss it
    if (type === 'data_init' && lastDataInitRef.current !== null) {
      const cached = lastDataInitRef.current;
      setTimeout(() => handler(cached), 0);
    }
    return () => { handlersRef.current.get(type)?.delete(handler); };
  }

  return (
    <WSContext.Provider value={{ send, subscribe, connected }}>
      {children}
    </WSContext.Provider>
  );
}

export function useWS() { return useContext(WSContext); }
