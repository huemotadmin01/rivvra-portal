import { lazy, Suspense } from 'react';
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
import AppRoleGate from './components/AppRoleGate';
import OrgAdminGate from './components/OrgAdminGate';
import { Loader2 } from 'lucide-react';

// Public pages (always loaded)
import LandingPage from './pages/LandingPage';
import SignupPage from './pages/SignupPage';
import InviteAcceptPage from './pages/InviteAcceptPage';
import OrgLoginPage from './pages/OrgLoginPage';
import PrivacyPage from './pages/PrivacyPage';
import FeaturesPage from './pages/FeaturesPage';
import PricingPage from './pages/PricingPage';
import FindWorkspacePage from './pages/FindWorkspacePage';
import AppLauncherPage from './pages/AppLauncherPage';
import UpgradePage from './pages/UpgradePage';

// Lazy-loaded: Outreach app pages
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const EngagePage = lazy(() => import('./pages/EngagePage'));
const SequenceWizardPage = lazy(() => import('./pages/SequenceWizardPage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const MyListsPage = lazy(() => import('./pages/MyListsPage'));
const TeamDashboardPage = lazy(() => import('./pages/TeamDashboardPage'));
const TeamContactsPage = lazy(() => import('./pages/TeamContactsPage'));
const TeamListsPage = lazy(() => import('./pages/TeamListsPage'));

// Lazy-loaded: Platform settings
const SettingsProfile = lazy(() => import('./components/settings/SettingsProfile'));
const SettingsGeneral = lazy(() => import('./components/settings/SettingsGeneral'));
const SettingsTeam = lazy(() => import('./components/settings/SettingsTeam'));
const SettingsOutreach = lazy(() => import('./components/settings/SettingsOutreach'));
const SettingsTimesheet = lazy(() => import('./components/settings/SettingsTimesheet'));
const SettingsEmployee = lazy(() => import('./components/settings/SettingsEmployee'));

// Lazy-loaded: Timesheet app pages
const TimesheetDashboard = lazy(() => import('./pages/timesheet/TimesheetDashboard'));
const TimesheetEntry = lazy(() => import('./pages/timesheet/TimesheetEntry'));
const TimesheetEarnings = lazy(() => import('./pages/timesheet/TimesheetEarnings'));
const TimesheetApprovals = lazy(() => import('./pages/timesheet/TimesheetApprovals'));
const TimesheetUsers = lazy(() => import('./pages/timesheet/TimesheetUsers'));
const TimesheetPayConfig = lazy(() => import('./pages/timesheet/TimesheetPayConfig'));
const TimesheetProjects = lazy(() => import('./pages/timesheet/TimesheetProjects'));
const TimesheetExport = lazy(() => import('./pages/timesheet/TimesheetExport'));

// Lazy-loaded: Employee app pages
const EmployeeDirectory = lazy(() => import('./pages/employee/EmployeeDirectory'));
const EmployeeDepartments = lazy(() => import('./pages/employee/EmployeeDepartments'));
const EmployeeDetail = lazy(() => import('./pages/employee/EmployeeDetail'));
const EmployeeForm = lazy(() => import('./pages/employee/EmployeeForm'));

// Lazy-loaded: Super Admin
import SuperAdminRoute from './components/SuperAdminRoute';
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'));
const AdminWorkspacesPage = lazy(() => import('./pages/admin/AdminWorkspacesPage'));
const AdminWorkspaceDetailPage = lazy(() => import('./pages/admin/AdminWorkspaceDetailPage'));
const AdminEmailTemplatesPage = lazy(() => import('./pages/admin/AdminEmailTemplatesPage'));

// Suspense fallback for lazy-loaded routes
function PageLoader() {
  return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-dark-400 animate-spin" /></div>;
}

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
  return <Navigate to={`/org/${slug}/settings/profile`} replace />;
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
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<Navigate to="/signup" replace />} />
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

              {/* Platform settings — profile is accessible to all, rest gated by admin */}
              <Route path="/org/:slug/settings" element={<OrgSettingsRedirect />} />
              <Route path="/org/:slug/settings/profile" element={<SettingsPageWrapper><SettingsProfile /></SettingsPageWrapper>} />
              <Route element={<OrgAdminGate />}>
                <Route path="/org/:slug/settings/general" element={<SettingsPageWrapper><SettingsGeneral /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/users" element={<SettingsPageWrapper><SettingsTeam /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/outreach" element={<SettingsPageWrapper><SettingsOutreach /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/timesheet" element={<SettingsPageWrapper><SettingsTimesheet /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/employee" element={<SettingsPageWrapper><SettingsEmployee /></SettingsPageWrapper>} />
              </Route>

              {/* Timesheet app routes — gated by timesheet access */}
              <Route element={<AppAccessGate appId="timesheet" />}>
                <Route path="/org/:slug/timesheet/dashboard" element={<ErrorBoundary><TimesheetDashboard /></ErrorBoundary>} />
                <Route path="/org/:slug/timesheet/my-timesheet" element={<ErrorBoundary><TimesheetEntry /></ErrorBoundary>} />
                <Route path="/org/:slug/timesheet/earnings" element={<ErrorBoundary><TimesheetEarnings /></ErrorBoundary>} />
                <Route path="/org/:slug/timesheet/approvals" element={<ErrorBoundary><TimesheetApprovals /></ErrorBoundary>} />
                <Route path="/org/:slug/timesheet/users" element={<ErrorBoundary><TimesheetUsers /></ErrorBoundary>} />
                <Route path="/org/:slug/timesheet/pay-config" element={<ErrorBoundary><TimesheetPayConfig /></ErrorBoundary>} />
                <Route path="/org/:slug/timesheet/projects" element={<ErrorBoundary><TimesheetProjects /></ErrorBoundary>} />
                <Route path="/org/:slug/timesheet/export" element={<ErrorBoundary><TimesheetExport /></ErrorBoundary>} />
              </Route>

              {/* Employee app routes — gated by employee access */}
              <Route element={<AppAccessGate appId="employee" />}>
                <Route path="/org/:slug/employee/directory" element={<ErrorBoundary><EmployeeDirectory /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/departments" element={<ErrorBoundary><EmployeeDepartments /></ErrorBoundary>} />
                {/* Add/Edit require employee admin role */}
                <Route element={<AppRoleGate appId="employee" requiredRole="admin" />}>
                  <Route path="/org/:slug/employee/add" element={<ErrorBoundary><EmployeeForm /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/edit/:employeeId" element={<ErrorBoundary><EmployeeForm /></ErrorBoundary>} />
                </Route>
                <Route path="/org/:slug/employee/:employeeId" element={<ErrorBoundary><EmployeeDetail /></ErrorBoundary>} />
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
          </Suspense>
        </PlatformProvider>
      </Router>
      </ErrorBoundary>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
