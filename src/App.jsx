import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/common/ProtectedRoute';
import Sidebar from './components/Layout/Sidebar';
import Navbar from './components/Layout/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TimesheetPage from './pages/TimesheetPage';
import ApprovalPage from './pages/ApprovalPage';
import EarningsPage from './pages/EarningsPage';
import UsersPage from './pages/UsersPage';
import ProjectsPage from './pages/ProjectsPage';
import ExportPage from './pages/ExportPage';
import PayrollSettingsPage from './pages/PayrollSettingsPage';

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/timesheet" element={
              <ProtectedRoute roles={['contractor']}><TimesheetPage /></ProtectedRoute>
            } />
            <Route path="/earnings" element={
              <ProtectedRoute roles={['contractor']}><EarningsPage /></ProtectedRoute>
            } />
            <Route path="/approvals" element={
              <ProtectedRoute roles={['admin', 'manager']}><ApprovalPage /></ProtectedRoute>
            } />
            <Route path="/users" element={
              <ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>
            } />
            <Route path="/projects" element={
              <ProtectedRoute roles={['admin']}><ProjectsPage /></ProtectedRoute>
            } />
            <Route path="/exports" element={
              <ProtectedRoute roles={['admin']}><ExportPage /></ProtectedRoute>
            } />
            <Route path="/payroll-settings" element={
              <ProtectedRoute roles={['admin']}><PayrollSettingsPage /></ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/*" element={
        user ? <AppLayout /> : <Navigate to="/login" replace />
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
