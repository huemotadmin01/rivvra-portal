import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import ESSCompanyGate from './components/ESSCompanyGate';
import CountryGate from './components/CountryGate';
import OrgAdminGate from './components/OrgAdminGate';
import { Loader2 } from 'lucide-react';

// Public pages (always loaded)
import LandingPage from './pages/LandingPage';
import SignupPage from './pages/SignupPage';
import InviteAcceptPage from './pages/InviteAcceptPage';
// LoginPage removed — users log in via /find-workspace → /org/:slug/login
import OrgLoginPage from './pages/OrgLoginPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import FeaturesPage from './pages/FeaturesPage';
import PricingPage from './pages/PricingPage';
import FindWorkspacePage from './pages/FindWorkspacePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import AppLauncherPage from './pages/AppLauncherPage';
import OnboardingGate from './components/OnboardingGate';
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

// Lazy-loaded: Standalone pages
const MyProfilePage = lazy(() => import('./pages/MyProfilePage'));

// Lazy-loaded: Platform settings
const SettingsGeneral = lazy(() => import('./components/settings/SettingsGeneral'));
const SettingsTeam = lazy(() => import('./components/settings/SettingsTeam'));
const UserDetail = lazy(() => import('./pages/settings/UserDetail'));
const SettingsOutreach = lazy(() => import('./components/settings/SettingsOutreach'));
const SettingsTimesheet = lazy(() => import('./components/settings/SettingsTimesheet'));
const SettingsEmployee = lazy(() => import('./components/settings/SettingsEmployee'));
const SettingsEmailLogs = lazy(() => import('./components/settings/SettingsEmailLogs'));
const SettingsCrm = lazy(() => import('./components/settings/SettingsCrm'));
const SettingsAts = lazy(() => import('./components/settings/SettingsAts'));
const SettingsSign = lazy(() => import('./components/settings/SettingsSign'));
const SettingsContacts = lazy(() => import('./components/settings/SettingsContacts'));
const SettingsCompanies = lazy(() => import('./components/settings/SettingsCompanies'));
const SettingsTodo = lazy(() => import('./components/settings/SettingsTodo'));
const SettingsPayroll = lazy(() => import('./components/settings/SettingsPayroll'));

// Lazy-loaded: To-Do app pages
const TodoDashboard = lazy(() => import('./pages/todo/TodoDashboard'));
const TodoTasks = lazy(() => import('./pages/todo/TodoTasks'));

// Lazy-loaded: Timesheet app pages
const TimesheetDashboard = lazy(() => import('./pages/timesheet/TimesheetDashboard'));
const TimesheetEntry = lazy(() => import('./pages/timesheet/TimesheetEntry'));
const MyAttendancePage = lazy(() => import('./pages/timesheet/MyAttendancePage'));
const TimesheetEarnings = lazy(() => import('./pages/timesheet/TimesheetEarnings'));
const TimesheetApprovals = lazy(() => import('./pages/timesheet/TimesheetApprovals'));
const TimesheetUsers = lazy(() => import('./pages/timesheet/TimesheetUsers'));
const TimesheetPayConfig = lazy(() => import('./pages/timesheet/TimesheetPayConfig'));
const TimesheetProjects = lazy(() => import('./pages/timesheet/TimesheetProjects'));

const TimesheetPayroll = lazy(() => import('./pages/timesheet/TimesheetPayroll'));

// Lazy-loaded: Statutory Payroll pages
const SalaryStructuresPage = lazy(() => import('./pages/payroll/SalaryStructuresPage'));

const StatutoryConfigPage = lazy(() => import('./pages/payroll/StatutoryConfigPage'));
const PTMasterPage = lazy(() => import('./pages/payroll/PTMasterPage'));
const PayrollRunPage = lazy(() => import('./pages/payroll/PayrollRunPage'));
const MySalaryPage = lazy(() => import('./pages/payroll/MySalaryPage'));
const MyPayslipsPage = lazy(() => import('./pages/payroll/MyPayslipsPage'));
const MyFnfReceipt = lazy(() => import('./pages/timesheet/MyFnfReceipt'));
const AlumniPolicyPage = lazy(() => import('./pages/settings/AlumniPolicyPage'));
const AlumniDirectoryPage = lazy(() => import('./pages/employee/AlumniDirectory'));
const TaxDeclarationsPage = lazy(() => import('./pages/payroll/TaxDeclarationsPage'));
const TaxReportsPage = lazy(() => import('./pages/payroll/TaxReportsPage'));
const PayrollDashboardPage = lazy(() => import('./pages/payroll/PayrollDashboardPage'));
const PayrollSettingsPage = lazy(() => import('./pages/payroll/PayrollSettingsPage'));
const MyTaxDeclarationsPage = lazy(() => import('./pages/payroll/MyTaxDeclarationsPage'));
const MyTaxReportPage = lazy(() => import('./pages/payroll/MyTaxReportPage'));
const FnFDashboard = lazy(() => import('./pages/payroll/FnFDashboard'));

const AttendanceApprovals = lazy(() => import('./pages/timesheet/AttendanceApprovals'));
const LeaveApply = lazy(() => import('./pages/timesheet/LeaveApply'));
const LeaveMyRequests = lazy(() => import('./pages/timesheet/LeaveMyRequests'));
const LeaveApprovals = lazy(() => import('./pages/timesheet/LeaveApprovals'));
const LeaveBalances = lazy(() => import('./pages/timesheet/LeaveBalances'));
const LeaveReports = lazy(() => import('./pages/timesheet/LeaveReports'));
const HolidayCalendar = lazy(() => import('./pages/timesheet/HolidayCalendar'));
const MyAssets = lazy(() => import('./pages/timesheet/MyAssets'));

// Lazy-loaded: Knowledge Base
const KnowledgeBasePage = lazy(() => import('./pages/kb/KnowledgeBasePage'));

// Lazy-loaded: Employee app pages
const EmployeeDashboard = lazy(() => import('./pages/employee/EmployeeDashboard'));
const EmployeeDirectory = lazy(() => import('./pages/employee/EmployeeDirectory'));
const OrgChart = lazy(() => import('./pages/employee/OrgChart'));
const EmployeeDepartments = lazy(() => import('./pages/employee/EmployeeDepartments'));
const EmployeeDetail = lazy(() => import('./pages/employee/EmployeeDetail'));
const EmployeeForm = lazy(() => import('./pages/employee/EmployeeForm'));
const EmployeeQuickCreate = lazy(() => import('./pages/employee/EmployeeQuickCreate'));
const EmployeeOnboardingWizard = lazy(() => import('./pages/employee/EmployeeOnboardingWizard'));
const PlanTemplates = lazy(() => import('./pages/employee/PlanTemplates'));
const AssetList = lazy(() => import('./pages/employee/AssetList'));
const AssetDetail = lazy(() => import('./pages/employee/AssetDetail'));
const AssetTypeConfig = lazy(() => import('./pages/employee/AssetTypeConfig'));

// Lazy-loaded: Contacts app pages
const ContactsList = lazy(() => import('./pages/contacts/ContactsList'));
const ContactDetail = lazy(() => import('./pages/contacts/ContactDetail'));
const ContactForm = lazy(() => import('./pages/contacts/ContactForm'));
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

// Lazy-loaded: Invoicing app pages
const InvoicingDashboard = lazy(() => import('./pages/invoicing/InvoicingDashboard'));
const InvoiceList = lazy(() => import('./pages/invoicing/InvoiceList'));
const InvoiceForm = lazy(() => import('./pages/invoicing/InvoiceForm'));
const InvoiceDetail = lazy(() => import('./pages/invoicing/InvoiceDetail'));
const VendorBillList = lazy(() => import('./pages/invoicing/VendorBillList'));
const VendorBillForm = lazy(() => import('./pages/invoicing/VendorBillForm'));
const PaymentsList = lazy(() => import('./pages/invoicing/PaymentsList'));
const ProductCatalog = lazy(() => import('./pages/invoicing/ProductCatalog'));
const BankReconciliation = lazy(() => import('./pages/invoicing/BankReconciliation'));
const FollowUps = lazy(() => import('./pages/invoicing/FollowUps'));
const AgedReceivables = lazy(() => import('./pages/invoicing/AgedReceivables'));
const AgedPayables = lazy(() => import('./pages/invoicing/AgedPayables'));
const TaxReportInv = lazy(() => import('./pages/invoicing/TaxReport'));
const InvoiceAnalysis = lazy(() => import('./pages/invoicing/InvoiceAnalysis'));
const SettingsInvoicing = lazy(() => import('./components/settings/SettingsInvoicing'));
const JournalsConfig = lazy(() => import('./pages/invoicing/JournalsConfig'));
const TaxesConfig = lazy(() => import('./pages/invoicing/TaxesConfig'));
const TdsConfig = lazy(() => import('./pages/invoicing/TdsConfig'));
const PaymentTermsConfig = lazy(() => import('./pages/invoicing/PaymentTermsConfig'));
const InvoicingSettingsPage = lazy(() => import('./components/settings/SettingsInvoicing'));

// Lazy-loaded: Incentive app pages
const IncentiveMyEarnings = lazy(() => import('./pages/incentive/MyEarnings'));
const IncentiveDashboard = lazy(() => import('./pages/incentive/IncentiveDashboard'));
const IncentiveRecordsList = lazy(() => import('./pages/incentive/RecordsList'));
const IncentiveRecordForm = lazy(() => import('./pages/incentive/RecordForm'));
const IncentiveRecordDetail = lazy(() => import('./pages/incentive/RecordDetail'));
const IncentiveRatesTable = lazy(() => import('./pages/incentive/RatesTable'));
const IncentiveSettings = lazy(() => import('./pages/incentive/IncentiveSettings'));

// Lazy-loaded: Super Admin
import SuperAdminRoute from './components/SuperAdminRoute';
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'));
const AdminWorkspacesPage = lazy(() => import('./pages/admin/AdminWorkspacesPage'));
const AdminWorkspaceDetailPage = lazy(() => import('./pages/admin/AdminWorkspaceDetailPage'));
const AdminEmailTemplatesPage = lazy(() => import('./pages/admin/AdminEmailTemplatesPage'));
const AdminPayrollSettingsPage = lazy(() => import('./pages/admin/AdminPayrollSettingsPage'));
const AdminEmployeeSettingsPage = lazy(() => import('./pages/admin/AdminEmployeeSettingsPage'));

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
  return <Navigate to={`/org/${slug}/settings/general`} replace />;
}

// Helper: redirect old /payroll/process (contractor payroll) to unified /payroll/statutory-run
function PayrollProcessRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/org/${slug}/payroll/statutory-run`} replace />;
}

// Helper: redirect old /settings/profile to /my-profile
function SettingsProfileRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/org/${slug}/my-profile`} replace />;
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
            <Route path="/login" element={<Navigate to="/find-workspace" replace />} />
            <Route path="/invite" element={<InviteAcceptPage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
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
              <Route path="/org/:slug/home" element={<OnboardingGate><AppLauncherPage /></OnboardingGate>} />
              <Route path="/org/:slug/my-profile" element={<MyProfilePage />} />

              {/* Employee onboarding wizard — outside AppAccessGate (any authenticated employee can access) */}
              <Route path="/org/:slug/employee/onboarding" element={<ErrorBoundary><EmployeeOnboardingWizard /></ErrorBoundary>} />
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
              <Route path="/org/:slug/settings/profile" element={<SettingsProfileRedirect />} />
              <Route element={<OrgAdminGate />}>
                <Route path="/org/:slug/settings/general" element={<SettingsPageWrapper><SettingsGeneral /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/users/:userId" element={<SettingsPageWrapper><UserDetail /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/users" element={<SettingsPageWrapper><SettingsTeam /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/outreach" element={<SettingsPageWrapper><SettingsOutreach /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/timesheet" element={<SettingsPageWrapper><SettingsTimesheet /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/payroll" element={<SettingsPageWrapper><SettingsPayroll /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/employee" element={<SettingsPageWrapper><SettingsEmployee /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/email-logs" element={<SettingsPageWrapper><SettingsEmailLogs /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/crm" element={<SettingsPageWrapper><SettingsCrm /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/ats" element={<SettingsPageWrapper><SettingsAts /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/sign" element={<SettingsPageWrapper><SettingsSign /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/contacts" element={<SettingsPageWrapper><SettingsContacts /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/companies" element={<SettingsPageWrapper><SettingsCompanies /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/todo" element={<SettingsPageWrapper><SettingsTodo /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/invoicing" element={<SettingsPageWrapper><SettingsInvoicing /></SettingsPageWrapper>} />
              </Route>

              {/* Timesheet (ESS) app routes — gated by timesheet access + country (IN-only for now) + company match */}
              <Route element={<AppAccessGate appId="timesheet" />}>
                <Route element={<CountryGate allowed={['IN']} appName="Employee Self Service" />}>
                <Route element={<ESSCompanyGate />}>
                  <Route path="/org/:slug/timesheet/dashboard" element={<ErrorBoundary><TimesheetDashboard /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-timesheet" element={<ErrorBoundary><TimesheetEntry /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-attendance" element={<ErrorBoundary><MyAttendancePage /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/earnings" element={<ErrorBoundary><TimesheetEarnings /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/approvals" element={<ErrorBoundary><TimesheetApprovals /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/attendance/approvals" element={<ErrorBoundary><AttendanceApprovals /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/users" element={<ErrorBoundary><TimesheetUsers /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/projects" element={<ErrorBoundary><TimesheetProjects /></ErrorBoundary>} />
                  {/* Leave Management */}
                  <Route path="/org/:slug/timesheet/leave/apply" element={<ErrorBoundary><LeaveApply /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/my-requests" element={<ErrorBoundary><LeaveMyRequests /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/approvals" element={<ErrorBoundary><LeaveApprovals /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/balances" element={<ErrorBoundary><LeaveBalances /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/reports" element={<ErrorBoundary><LeaveReports /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/holidays" element={<ErrorBoundary><HolidayCalendar /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-assets" element={<ErrorBoundary><MyAssets /></ErrorBoundary>} />
                  {/* Employee-facing statutory payroll pages */}
                  <Route path="/org/:slug/timesheet/my-salary" element={<ErrorBoundary><MySalaryPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-payslips" element={<ErrorBoundary><MyPayslipsPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-fnf" element={<ErrorBoundary><MyFnfReceipt /></ErrorBoundary>} />
                  <Route path="/org/:slug/settings/alumni-policy" element={<ErrorBoundary><AlumniPolicyPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/alumni" element={<ErrorBoundary><AlumniDirectoryPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/tax/declarations" element={<ErrorBoundary><MyTaxDeclarationsPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/tax/report" element={<ErrorBoundary><MyTaxReportPage /></ErrorBoundary>} />
                </Route>
                </Route>
              </Route>

              {/* Payroll app routes — gated by payroll app admin role + country (IN-only for now) */}
              <Route element={<AppRoleGate appId="payroll" requiredRole="admin" />}>
                <Route element={<CountryGate allowed={['IN']} appName="Payroll" />}>
                  <Route path="/org/:slug/payroll/process" element={<PayrollProcessRedirect />} />
                  <Route path="/org/:slug/payroll/pay-overview" element={<ErrorBoundary><PayrollDashboardPage /></ErrorBoundary>} />

                  <Route path="/org/:slug/payroll/salary-structures" element={<ErrorBoundary><SalaryStructuresPage /></ErrorBoundary>} />

                  <Route path="/org/:slug/payroll/statutory-config" element={<ErrorBoundary><StatutoryConfigPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/pt-master" element={<ErrorBoundary><PTMasterPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/statutory-run" element={<ErrorBoundary><PayrollRunPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/tax-declarations" element={<ErrorBoundary><TaxDeclarationsPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/tax-reports" element={<ErrorBoundary><TaxReportsPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/settings" element={<ErrorBoundary><PayrollSettingsPage /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/fnf" element={<ErrorBoundary><FnFDashboard /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Legacy payroll redirects — old /timesheet/ paths → new /payroll/ paths */}
              <Route path="/org/:slug/timesheet/payroll" element={<Navigate to="../../payroll/process" replace />} />
              <Route path="/org/:slug/timesheet/pay-config" element={<Navigate to="../../payroll/pay-overview" replace />} />


              {/* Knowledge Base — admin-only reader for platform guides.
                  Uses AppRoleGate so org owners/admins automatically have
                  access without needing an explicit appAccess membership
                  entry (matches the pattern payroll uses). */}
              <Route element={<AppRoleGate appId="knowledgeBase" requiredRole="admin" />}>
                <Route path="/org/:slug/knowledge-base" element={<ErrorBoundary><KnowledgeBasePage /></ErrorBoundary>} />
                <Route path="/org/:slug/knowledge-base/:articleSlug" element={<ErrorBoundary><KnowledgeBasePage /></ErrorBoundary>} />
              </Route>

              {/* Employee app routes — gated by employee access */}
              <Route element={<AppAccessGate appId="employee" />}>
                <Route path="/org/:slug/employee/dashboard" element={<ErrorBoundary><EmployeeDashboard /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/directory" element={<ErrorBoundary><EmployeeDirectory /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/org-chart" element={<ErrorBoundary><OrgChart /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/departments" element={<ErrorBoundary><EmployeeDepartments /></ErrorBoundary>} />
                {/* Add/Edit/Plan Templates require employee admin role */}
                <Route element={<AppRoleGate appId="employee" requiredRole="admin" />}>
                  {/* /employee/add now uses the Odoo-style quick-create flow:
                      minimal fields → POST → redirect to the inline-editable
                      EmployeeDetail page. EmployeeForm stays wired to
                      /employee/edit/:id until EmployeeDetail absorbs all
                      remaining edit affordances. */}
                  <Route path="/org/:slug/employee/add" element={<ErrorBoundary><EmployeeQuickCreate /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/edit/:employeeId" element={<ErrorBoundary><EmployeeForm /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/plan-templates" element={<ErrorBoundary><PlanTemplates /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/assets/types" element={<ErrorBoundary><AssetTypeConfig /></ErrorBoundary>} />
                </Route>
                <Route path="/org/:slug/employee/assets" element={<ErrorBoundary><AssetList /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/assets/:assetId" element={<ErrorBoundary><AssetDetail /></ErrorBoundary>} />
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
                <Route path="/org/:slug/contacts/new-record" element={<ErrorBoundary><ContactDetail /></ErrorBoundary>} />
                <Route path="/org/:slug/contacts/:contactId" element={<ErrorBoundary><ContactDetail /></ErrorBoundary>} />
              </Route>

              {/* CRM app routes — gated by crm access */}
              <Route element={<AppAccessGate appId="crm" />}>
                <Route path="/org/:slug/crm/dashboard" element={<ErrorBoundary><CrmDashboard /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/pipeline" element={<ErrorBoundary><CrmPipeline /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities" element={<ErrorBoundary><CrmOpportunities /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities/:opportunityId" element={<ErrorBoundary><CrmOpportunityDetail /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="crm" requiredRole="admin" allowTeamLead />}>
                  <Route path="/org/:slug/crm/reporting" element={<ErrorBoundary><CrmReporting /></ErrorBoundary>} />
                </Route>
                <Route element={<AppRoleGate appId="crm" requiredRole="admin" />}>
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

              {/* To-Do app routes — gated by todo access */}
              <Route element={<AppAccessGate appId="todo" />}>
                <Route path="/org/:slug/todo/dashboard" element={<ErrorBoundary><TodoDashboard /></ErrorBoundary>} />
                <Route path="/org/:slug/todo/tasks" element={<ErrorBoundary><TodoTasks /></ErrorBoundary>} />
              </Route>

              {/* Invoicing app routes — admin only */}
              <Route element={<AppAccessGate appId="invoicing" />}>
                <Route element={<AppRoleGate appId="invoicing" requiredRole="admin" />}>
                  <Route path="/org/:slug/invoicing/dashboard" element={<ErrorBoundary><InvoicingDashboard /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices" element={<ErrorBoundary><InvoiceList /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices/new" element={<ErrorBoundary><InvoiceForm /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices/:invoiceId/edit" element={<ErrorBoundary><InvoiceForm /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices/:invoiceId" element={<ErrorBoundary><InvoiceDetail /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/bills" element={<ErrorBoundary><VendorBillList /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/employee-bills" element={<ErrorBoundary><VendorBillList mode="employee" /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/bills/new" element={<ErrorBoundary><VendorBillForm /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/bills/:billId/edit" element={<ErrorBoundary><VendorBillForm /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/payments" element={<ErrorBoundary><PaymentsList /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/products" element={<ErrorBoundary><ProductCatalog /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reconciliation" element={<ErrorBoundary><BankReconciliation /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/follow-ups" element={<ErrorBoundary><FollowUps /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/receivables" element={<ErrorBoundary><AgedReceivables /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/payables" element={<ErrorBoundary><AgedPayables /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/tax" element={<ErrorBoundary><TaxReportInv /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/analysis" element={<ErrorBoundary><InvoiceAnalysis /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/products" element={<ErrorBoundary><ProductCatalog /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/taxes" element={<ErrorBoundary><TaxesConfig /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/tds" element={<ErrorBoundary><TdsConfig /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/payment-terms" element={<ErrorBoundary><PaymentTermsConfig /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/journals" element={<ErrorBoundary><JournalsConfig /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/settings" element={<ErrorBoundary><InvoicingSettingsPage /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Incentive app routes — member for own earnings, admin for everything else */}
              <Route element={<AppAccessGate appId="incentive" />}>
                {/* Member-accessible */}
                <Route path="/org/:slug/incentive/my-earnings" element={<ErrorBoundary><IncentiveMyEarnings /></ErrorBoundary>} />
                <Route path="/org/:slug/incentive/records/:recordId" element={<ErrorBoundary><IncentiveRecordDetail /></ErrorBoundary>} />
                {/* Admin-only */}
                <Route element={<AppRoleGate appId="incentive" requiredRole="admin" />}>
                  <Route path="/org/:slug/incentive/dashboard" element={<ErrorBoundary><IncentiveDashboard /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/records" element={<ErrorBoundary><IncentiveRecordsList /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/records/new" element={<ErrorBoundary><IncentiveRecordForm /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/records/:recordId/edit" element={<ErrorBoundary><IncentiveRecordForm /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/rates" element={<ErrorBoundary><IncentiveRatesTable /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/settings" element={<ErrorBoundary><IncentiveSettings /></ErrorBoundary>} />
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
            {/* Payroll app legacy redirects — moved from /timesheet/ */}
            <Route path="/timesheet/payroll" element={<OrgRedirect to="/payroll/process" />} />
            <Route path="/timesheet/pay-config" element={<OrgRedirect to="/payroll/pay-overview" />} />

            <Route path="/payroll/*" element={<OrgRedirect />} />
            <Route path="/timesheet/*" element={<OrgRedirect />} />
            <Route path="/employee/*" element={<OrgRedirect />} />
            <Route path="/contacts/*" element={<OrgRedirect />} />
            <Route path="/crm/*" element={<OrgRedirect />} />
            <Route path="/ats/*" element={<OrgRedirect />} />
            <Route path="/sign/*" element={<OrgRedirect />} />
            <Route path="/invoicing/*" element={<OrgRedirect />} />
            <Route path="/incentive/*" element={<OrgRedirect />} />
            <Route path="/todo/*" element={<OrgRedirect />} />
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
              <Route path="/admin/settings/payroll" element={<AdminPayrollSettingsPage />} />
              <Route path="/admin/settings/employee" element={<AdminEmployeeSettingsPage />} />
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
