import { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PlatformProvider } from './context/PlatformContext';
import { OrgProvider } from './context/OrgContext';
import { CompanyProvider } from './context/CompanyContext';
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
import ResetPasswordPage from './pages/ResetPasswordPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
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
const SettingsEmailLogs = lazy(() => import('./components/settings/SettingsEmailLogs'));
const SettingsCrm = lazy(() => import('./components/settings/SettingsCrm'));
const SettingsAts = lazy(() => import('./components/settings/SettingsAts'));
const SettingsSign = lazy(() => import('./components/settings/SettingsSign'));
const SettingsContacts = lazy(() => import('./components/settings/SettingsContacts'));
const SettingsCompanies = lazy(() => import('./components/settings/SettingsCompanies'));

// Lazy-loaded: Timesheet app pages
const TimesheetDashboard = lazy(() => import('./pages/timesheet/TimesheetDashboard'));
const TimesheetEntry = lazy(() => import('./pages/timesheet/TimesheetEntry'));
const TimesheetEarnings = lazy(() => import('./pages/timesheet/TimesheetEarnings'));
const TimesheetApprovals = lazy(() => import('./pages/timesheet/TimesheetApprovals'));
const TimesheetUsers = lazy(() => import('./pages/timesheet/TimesheetUsers'));
const TimesheetPayConfig = lazy(() => import('./pages/timesheet/TimesheetPayConfig'));
const TimesheetProjects = lazy(() => import('./pages/timesheet/TimesheetProjects'));
const TimesheetExport = lazy(() => import('./pages/timesheet/TimesheetExport'));
const TimesheetPayroll = lazy(() => import('./pages/timesheet/TimesheetPayroll'));

// Lazy-loaded: Employee app pages
const EmployeeDirectory = lazy(() => import('./pages/employee/EmployeeDirectory'));
const EmployeeDepartments = lazy(() => import('./pages/employee/EmployeeDepartments'));
const EmployeeDetail = lazy(() => import('./pages/employee/EmployeeDetail'));
const EmployeeForm = lazy(() => import('./pages/employee/EmployeeForm'));

// Lazy-loaded: Contacts app pages
const ContactsList = lazy(() => import('./pages/contacts/ContactsList'));
const ContactDetail = lazy(() => import('./pages/contacts/ContactDetail'));
const ContactsConfig = lazy(() => import('./pages/contacts/ContactsConfig'));

// Lazy-loaded: ATS app pages
const AtsPipeline = lazy(() => import('./pages/ats/AtsPipeline'));
const AtsApplications = lazy(() => import('./pages/ats/AtsApplications'));
const AtsApplicationDetail = lazy(() => import('./pages/ats/AtsApplicationDetail'));
const AtsJobPositions = lazy(() => import('./pages/ats/AtsJobPositions'));
const AtsJobDetail = lazy(() => import('./pages/ats/AtsJobDetail'));
const AtsCandidates = lazy(() => import('./pages/ats/AtsCandidates'));
const AtsReporting = lazy(() => import('./pages/ats/AtsReporting'));
const AtsConfig = lazy(() => import('./pages/ats/AtsConfig'));

// Lazy-loaded: CRM app pages
const CrmDashboard = lazy(() => import('./pages/crm/CrmDashboard'));
const CrmPipeline = lazy(() => import('./pages/crm/CrmPipeline'));
const CrmOpportunities = lazy(() => import('./pages/crm/CrmOpportunities'));
const CrmOpportunityDetail = lazy(() => import('./pages/crm/CrmOpportunityDetail'));
const CrmReporting = lazy(() => import('./pages/crm/CrmReporting'));
const CrmConfigStages = lazy(() => import('./pages/crm/CrmConfigStages'));
const CrmConfigTags = lazy(() => import('./pages/crm/CrmConfigTags'));
const CrmConfigLostReasons = lazy(() => import('./pages/crm/CrmConfigLostReasons'));

// Lazy-loaded: Sign app pages
const SignDashboard = lazy(() => import('./pages/sign/SignDashboard'));
const SignTemplates = lazy(() => import('./pages/sign/SignTemplates'));
const SignTemplateEditor = lazy(() => import('./pages/sign/SignTemplateEditor'));
const SignRequests = lazy(() => import('./pages/sign/SignRequests'));
const SignRequestDetail = lazy(() => import('./pages/sign/SignRequestDetail'));
const SignConfig = lazy(() => import('./pages/sign/SignConfig'));
const PublicSigningPage = lazy(() => import('./pages/sign/PublicSigningPage'));

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
      <CompanyProvider>
        <PlatformLayout />
      </CompanyProvider>
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

function CrmConfigRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/org/${slug}/crm/config/stages`} replace />;
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
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Org-specific public pages — no auth required */}
            <Route path="/org/:slug/login" element={<OrgLoginPage />} />
            <Route path="/org/:slug/invite" element={<InviteAcceptPage />} />

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
                <Route path="/org/:slug/settings/email-logs" element={<SettingsPageWrapper><SettingsEmailLogs /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/crm" element={<SettingsPageWrapper><SettingsCrm /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/ats" element={<SettingsPageWrapper><SettingsAts /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/sign" element={<SettingsPageWrapper><SettingsSign /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/contacts" element={<SettingsPageWrapper><SettingsContacts /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/companies" element={<SettingsPageWrapper><SettingsCompanies /></SettingsPageWrapper>} />
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
                <Route path="/org/:slug/timesheet/payroll" element={<ErrorBoundary><TimesheetPayroll /></ErrorBoundary>} />
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

              {/* Contacts app routes — gated by contacts access */}
              <Route element={<AppAccessGate appId="contacts" />}>
                <Route path="/org/:slug/contacts/list" element={<ErrorBoundary><ContactsList /></ErrorBoundary>} />
                <Route path="/org/:slug/contacts/companies" element={<ErrorBoundary><ContactsList filterType="company" /></ErrorBoundary>} />
                <Route path="/org/:slug/contacts/individuals" element={<ErrorBoundary><ContactsList filterType="individual" /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="contacts" requiredRole="admin" />}>
                  <Route path="/org/:slug/contacts/config" element={<ErrorBoundary><ContactsConfig /></ErrorBoundary>} />
                </Route>
                <Route path="/org/:slug/contacts/:contactId" element={<ErrorBoundary><ContactDetail /></ErrorBoundary>} />
              </Route>

              {/* CRM app routes — gated by crm access */}
              <Route element={<AppAccessGate appId="crm" />}>
                <Route path="/org/:slug/crm/dashboard" element={<ErrorBoundary><CrmDashboard /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/pipeline" element={<ErrorBoundary><CrmPipeline /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities" element={<ErrorBoundary><CrmOpportunities /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities/:opportunityId" element={<ErrorBoundary><CrmOpportunityDetail /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="crm" requiredRole="admin" />}>
                  <Route path="/org/:slug/crm/reporting" element={<ErrorBoundary><CrmReporting /></ErrorBoundary>} />
                  <Route path="/org/:slug/crm/config" element={<CrmConfigRedirect />} />
                  <Route path="/org/:slug/crm/config/stages" element={<ErrorBoundary><CrmConfigStages /></ErrorBoundary>} />
                  <Route path="/org/:slug/crm/config/tags" element={<ErrorBoundary><CrmConfigTags /></ErrorBoundary>} />
                  <Route path="/org/:slug/crm/config/lost-reasons" element={<ErrorBoundary><CrmConfigLostReasons /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* ATS app routes — gated by ats access */}
              <Route element={<AppAccessGate appId="ats" />}>
                <Route path="/org/:slug/ats/pipeline" element={<ErrorBoundary><AtsPipeline /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/applications" element={<ErrorBoundary><AtsApplications /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/applications/:applicationId" element={<ErrorBoundary><AtsApplicationDetail /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs" element={<ErrorBoundary><AtsJobPositions /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs/:jobId" element={<ErrorBoundary><AtsJobDetail /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/candidates" element={<ErrorBoundary><AtsCandidates /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="ats" requiredRole="admin" />}>
                  <Route path="/org/:slug/ats/reporting" element={<ErrorBoundary><AtsReporting /></ErrorBoundary>} />
                  <Route path="/org/:slug/ats/config" element={<ErrorBoundary><AtsConfig /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Sign app routes — gated by sign access */}
              <Route element={<AppAccessGate appId="sign" />}>
                <Route path="/org/:slug/sign/dashboard" element={<ErrorBoundary><SignDashboard /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/requests" element={<ErrorBoundary><SignRequests /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/requests/:requestId" element={<ErrorBoundary><SignRequestDetail /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/templates" element={<ErrorBoundary><SignTemplates /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/templates/:templateId/edit" element={<ErrorBoundary><SignTemplateEditor /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="sign" requiredRole="admin" />}>
                  <Route path="/org/:slug/sign/config" element={<ErrorBoundary><SignConfig /></ErrorBoundary>} />
                </Route>
              </Route>
            </Route>

            {/* ============================================================ */}
            {/* PUBLIC SIGNING PAGE — no auth required, token-based access    */}
            {/* ============================================================ */}
            <Route path="/sign/public/:requestId/:signerId/:token" element={<PublicSigningPage />} />

            {/* ============================================================ */}
            {/* LEGACY ROUTES — /home, /outreach/*, /timesheet/*, /settings/* */}
            {/* These redirect to org-scoped routes using OrgRedirect.        */}
            {/* Extension & bookmarks keep working through these redirects.   */}
            {/* ============================================================ */}
            <Route path="/home" element={<OrgRedirect to="/home" />} />
            <Route path="/outreach/*" element={<OrgRedirect />} />
            <Route path="/timesheet/*" element={<OrgRedirect />} />
            <Route path="/employee/*" element={<OrgRedirect />} />
            <Route path="/contacts/*" element={<OrgRedirect />} />
            <Route path="/crm/*" element={<OrgRedirect />} />
            <Route path="/ats/*" element={<OrgRedirect />} />
            <Route path="/sign/*" element={<OrgRedirect />} />
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
