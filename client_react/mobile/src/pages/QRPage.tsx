import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BottomNav from '../components/BottomNav';
import { useToast } from '../components/Toast';
import jsQR from 'jsqr';

type ScanState = 'idle' | 'scanning' | 'found' | 'error';

export default function QRPage() {
  useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setScanState('scanning');
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        videoRef.current.onloadedmetadata = () => scanLoop();
      }
    } catch (e) {
      setScanState('error');
      setErrorMsg('Không thể truy cập camera. Kiểm tra quyền truy cập.');
    }
  }

  function scanLoop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data) {
      handleQRResult(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }

  function handleQRResult(data: string) {
    stopCamera();
    setScanState('found');
    const deviceid = parseDeviceId(data);
    if (deviceid) {
      showToast(`Tìm thấy: ${deviceid}`, 'ok');
      setTimeout(() => navigate(`/device?deviceid=${encodeURIComponent(deviceid)}`), 600);
    } else {
      setErrorMsg(`Mã QR không hợp lệ: ${data}`);
      setScanState('error');
    }
  }

  function parseDeviceId(raw: string): string | null {
    try {
      const url = new URL(raw);
      const id = url.searchParams.get('deviceid') || url.searchParams.get('id');
      if (id) return id;
    } catch {}
    if (/^[A-Za-z0-9_\-]{4,64}$/.test(raw.trim())) return raw.trim();
    return null;
  }

  function retry() {
    setScanState('idle');
    setErrorMsg('');
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-title">
          <i className="bi bi-qr-code-scan" />
          Quét QR
        </div>
      </header>

      <div className="app-content">
        {scanState === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 16px' }}>
            <i className="bi bi-qr-code-scan" style={{ fontSize: 64, color: '#38aaff', marginBottom: 16 }} />
            <div style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center', marginBottom: 24 }}>
              Bấm nút bên dưới để mở camera và quét mã QR trên tủ điện
            </div>
            <button
              onClick={startCamera}
              style={{ background: '#38aaff', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 32px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <i className="bi bi-camera" />
              Mở camera quét QR
            </button>
          </div>
        )}

        {(scanState === 'scanning' || scanState === 'found') && (
          <>
            <div className="qr-viewport">
              <video ref={videoRef} style={{ width: '100%', display: 'block' }} autoPlay muted playsInline />
              <div className="qr-overlay">
                <div className="qr-frame" />
              </div>
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="qr-hint">
              {scanState === 'found'
                ? <><i className="bi bi-check-circle-fill" style={{ color: '#22d369' }} /> Đã nhận diện! Đang chuyển hướng...</>
                : 'Hướng camera vào mã QR trên tủ điện'}
            </div>
          </>
        )}

        {scanState === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px' }}>
            <i className="bi bi-exclamation-circle" style={{ fontSize: 48, color: '#f44b4b', marginBottom: 16 }} />
            <div style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center', marginBottom: 24 }}>{errorMsg}</div>
            <button onClick={retry}
              style={{ background: '#38aaff', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Thử lại
            </button>
          </div>
        )}
      </div>

      <BottomNav active="qr" />
    </>
  );
}
