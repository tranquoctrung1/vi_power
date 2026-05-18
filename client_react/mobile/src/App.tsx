import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AlertsPage from './pages/AlertsPage';
import DevicePage from './pages/DevicePage';
import QRPage from './pages/QRPage';
import ReportPage from './pages/ReportPage';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/device" element={<DevicePage />} />
          <Route path="/qr" element={<QRPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
