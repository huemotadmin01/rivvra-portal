import { HashRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PlatformProvider } from './context/PlatformContext';
import { OrgProvider } from './context/OrgContext';
import ErrorBoundary from './components/ErrorBoundary';
import PlatformLayout from './components/platform/PlatformLayout';
import ProtectedRoute from './components/ProtectedRoute';
import OrgRedirect from './components/OrgRedirect';
import AppAccessGate from './components/AppAccessGate';
import OrgAdminGate from './components/OrgAdminGate';

import LandingPage from './pages/LandingPage';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import InviteAcceptPage from './pages/InviteAcceptPage';
import OrgLoginPage from './pages/OrgLoginPage';
import PrivacyPage from './pages/PrivacyPage';
import FeaturesPage from './pages/FeaturesPage';
import PricingPage from './pages/PricingPage';
import FindWorkspacePage from './pages/FindWorkspacePage';
import AppLauncherPage from './pages/AppLauncherPage';
import UpgradePage from './pages/UpgradePage';

// Outreach app pages
import DashboardPage from './pages/DashboardPage';
import EngagePage from './pages/EngagePage';
import SequenceWizardPage from './pages/SequenceWizardPage';
import LeadsPage from './pages/LeadsPage';
import MyListsPage from './pages/MyListsPage';
import TeamDashboardPage from './pages/TeamDashboardPage';
import TeamContactsPage from './pages/TeamContactsPage';
import TeamListsPage from './pages/TeamListsPage';

// Platform settings
import SettingsGeneral from './components/settings/SettingsGeneral';
import SettingsTeam from './components/settings/SettingsTeam';
import SettingsOutreach from './components/settings/SettingsOutreach';
import SettingsTimesheet from './components/settings/SettingsTimesheet';

// Timesheet app pages
import TimesheetDashboard from './pages/timesheet/TimesheetDashboard';
import TimesheetEntry from './pages/timesheet/TimesheetEntry';
import TimesheetEarnings from './pages/timesheet/TimesheetEarnings';
import TimesheetApprovals from './pages/timesheet/TimesheetApprovals';
import TimesheetUsers from './pages/timesheet/TimesheetUsers';
import TimesheetProjects from './pages/timesheet/TimesheetProjects';
import TimesheetExport from './pages/timesheet/TimesheetExport';

// Employee app pages
import EmployeeDirectory from './pages/employee/EmployeeDirectory';
import EmployeeDepartments from './pages/employee/EmployeeDepartments';
import EmployeeDetail from './pages/employee/EmployeeDetail';
import EmployeeForm from './pages/employee/EmployeeForm';

// Super Admin
import SuperAdminRoute from './components/SuperAdminRoute';
import AdminLayout from './components/admin/AdminLayout';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminOverviewPage from './pages/admin/AdminOverviewPage';
import AdminWorkspacesPage from './pages/admin/AdminWorkspacesPage';
import AdminWorkspaceDetailPage from './pages/admin/AdminWorkspaceDetailPage';
import AdminEmailTemplatesPage from './pages/admin/AdminEmailTemplatesPage';

// Simple wrapper for settings pages — adds consistent header + padding
function SettingsPageWrapper({ children }) {
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-dark-400 mt-1">Manage your platform, apps & team</p>
      </div>
      {children}
    </div>
  );
}

// Wrapper that provides org context for /org/:slug/* routes
function OrgPlatformLayout() {
  return (
    <OrgProvider>
      <PlatformLayout />
    </OrgProvider>
  );
}

// Helper: redirect from /org/:slug/settings to /org/:slug/settings/general
function OrgSettingsRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/org/${slug}/settings/general`} replace />;
}

// Helper: redirect from /org/:slug/outreach/settings to /org/:slug/settings
function OrgOutreachSettingsRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/org/${slug}/settings`} replace />;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <ErrorBoundary>
      <Router>
        <PlatformProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite" element={<InviteAcceptPage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/find-workspace" element={<FindWorkspacePage />} />

            {/* Org-specific login — public, no auth required */}
            <Route path="/org/:slug/login" element={<OrgLoginPage />} />

            {/* ============================================================ */}
            {/* ORG-SCOPED ROUTES — /org/:slug/...                           */}
            {/* These are the primary routes for multi-tenant navigation.     */}
            {/* ============================================================ */}
            <Route element={<ProtectedRoute><OrgPlatformLayout /></ProtectedRoute>}>
              <Route path="/org/:slug/home" element={<AppLauncherPage />} />
              <Route path="/org/:slug/upgrade" element={<UpgradePage />} />

              {/* Outreach app routes — gated by outreach access */}
              <Route element={<AppAccessGate appId="outreach" />}>
                <Route path="/org/:slug/outreach/dashboard" element={<DashboardPage />} />
                <Route path="/org/:slug/outreach/engage" element={<EngagePage />} />
                <Route path="/org/:slug/outreach/engage/new-sequence" element={<SequenceWizardPage />} />
                <Route path="/org/:slug/outreach/engage/edit-sequence/:sequenceId" element={<SequenceWizardPage />} />
                <Route path="/org/:slug/outreach/leads" element={<LeadsPage />} />
                <Route path="/org/:slug/outreach/lists" element={<MyListsPage />} />
                <Route path="/org/:slug/outreach/settings" element={<OrgOutreachSettingsRedirect />} />
                <Route path="/org/:slug/outreach/team-dashboard" element={<TeamDashboardPage />} />
                <Route path="/org/:slug/outreach/team-contacts" element={<TeamContactsPage />} />
                <Route path="/org/:slug/outreach/team-lists" element={<TeamListsPage />} />
              </Route>

              {/* Platform settings — gated by org admin/owner role */}
              <Route element={<OrgAdminGate />}>
                <Route path="/org/:slug/settings" element={<OrgSettingsRedirect />} />
                <Route path="/org/:slug/settings/general" element={<SettingsPageWrapper><SettingsGeneral /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/users" element={<SettingsPageWrapper><SettingsTeam /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/outreach" element={<SettingsPageWrapper><SettingsOutreach /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/timesheet" element={<SettingsPageWrapper><SettingsTimesheet /></SettingsPageWrapper>} />
              </Route>

              {/* Timesheet app routes — gated by timesheet access */}
              <Route element={<AppAccessGate appId="timesheet" />}>
                <Route path="/org/:slug/timesheet/dashboard" element={<TimesheetDashboard />} />
                <Route path="/org/:slug/timesheet/my-timesheet" element={<TimesheetEntry />} />
                <Route path="/org/:slug/timesheet/earnings" element={<TimesheetEarnings />} />
                <Route path="/org/:slug/timesheet/approvals" element={<TimesheetApprovals />} />
                <Route path="/org/:slug/timesheet/users" element={<TimesheetUsers />} />
                <Route path="/org/:slug/timesheet/projects" element={<TimesheetProjects />} />
                <Route path="/org/:slug/timesheet/export" element={<TimesheetExport />} />
              </Route>

              {/* Employee app routes — gated by employee access */}
              <Route element={<AppAccessGate appId="employee" />}>
                <Route path="/org/:slug/employee/directory" element={<EmployeeDirectory />} />
                <Route path="/org/:slug/employee/departments" element={<EmployeeDepartments />} />
                <Route path="/org/:slug/employee/add" element={<EmployeeForm />} />
                <Route path="/org/:slug/employee/edit/:employeeId" element={<EmployeeForm />} />
                <Route path="/org/:slug/employee/:employeeId" element={<EmployeeDetail />} />
              </Route>
            </Route>

            {/* ============================================================ */}
            {/* LEGACY ROUTES — /home, /outreach/*, /timesheet/*, /settings/* */}
            {/* These redirect to org-scoped routes using OrgRedirect.        */}
            {/* Extension & bookmarks keep working through these redirects.   */}
            {/* ============================================================ */}
            <Route path="/home" element={<OrgRedirect to="/home" />} />
            <Route path="/outreach/*" element={<OrgRedirect />} />
            <Route path="/timesheet/*" element={<OrgRedirect />} />
            <Route path="/employee/*" element={<OrgRedirect />} />
            <Route path="/settings" element={<OrgRedirect to="/settings" />} />
            <Route path="/settings/*" element={<OrgRedirect />} />

            {/* Oldest legacy redirects — extension uses these */}
            <Route path="/dashboard" element={<OrgRedirect to="/home" />} />
            <Route path="/engage" element={<OrgRedirect to="/outreach/engage" />} />
            <Route path="/engage/new-sequence" element={<OrgRedirect to="/outreach/engage/new-sequence" />} />
            <Route path="/engage/edit-sequence/:sequenceId" element={<OrgRedirect to="/outreach/engage/edit-sequence/:sequenceId" />} />
            <Route path="/leads" element={<OrgRedirect to="/outreach/leads" />} />
            <Route path="/lists" element={<OrgRedirect to="/outreach/lists" />} />
            <Route path="/team-dashboard" element={<OrgRedirect to="/outreach/team-dashboard" />} />
            <Route path="/team-contacts" element={<OrgRedirect to="/outreach/team-contacts" />} />
            <Route path="/team-lists" element={<OrgRedirect to="/outreach/team-lists" />} />
            <Route path="/onboarding" element={<OrgRedirect to="/home" />} />
            <Route path="/search" element={<OrgRedirect to="/home" />} />
            <Route path="/app/*" element={<OrgRedirect to="/home" />} />

            {/* ============================================================ */}
            {/* SUPER ADMIN ROUTES — /admin/*                              */}
            {/* Completely independent from org layout.                     */}
            {/* ============================================================ */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route element={<SuperAdminRoute><AdminLayout /></SuperAdminRoute>}>
              <Route path="/admin" element={<AdminOverviewPage />} />
              <Route path="/admin/workspaces" element={<AdminWorkspacesPage />} />
              <Route path="/admin/workspaces/:orgId" element={<AdminWorkspaceDetailPage />} />
              <Route path="/admin/email-templates" element={<AdminEmailTemplatesPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PlatformProvider>
      </Router>
      </ErrorBoundary>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
