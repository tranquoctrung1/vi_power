import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { WSProvider } from './contexts/WSContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AlertsPage from './pages/AlertsPage';
import DevicesPage from './pages/DevicesPage';
import ReportPage from './pages/ReportPage';
import AnalysisPage from './pages/AnalysisPage';
import ActivityPage from './pages/ActivityPage';
import UsersPage from './pages/UsersPage';
import APIKeysPage from './pages/APIKeysPage';
import TopologyPage from './pages/TopologyPage';
import DeviceDetailPage from './pages/DeviceDetailPage';

export default function App() {
  return (
    <HashRouter>
      <WSProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<DashboardPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/apikeys" element={<APIKeysPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/device" element={<DeviceDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
      </WSProvider>
    </HashRouter>
  );
}
