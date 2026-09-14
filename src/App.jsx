import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PlatformProvider } from './context/PlatformContext';
import { OrgProvider } from './context/OrgContext';
import { CompanyProvider } from './context/CompanyContext';
import { PolicyAckProvider } from './context/PolicyAckContext';
import ErrorBoundary from './components/ErrorBoundary';
import StagingBanner from './components/StagingBanner';
import PlanLimitListener from './components/PlanLimitListener';
import AnalyticsRouteListener from './components/AnalyticsRouteListener';
// The app shell is lazy so the public marketing routes never download it.
const PlatformLayoutV2 = lazy(() => import('./components/platform/v2/PlatformLayoutV2'));
// Lazy: the assistant (and DOMPurify) never load on the marketing routes.
const AssistantPanel = lazy(() => import('./components/assistant/AssistantPanel'));
import ProtectedRoute from './components/ProtectedRoute';
import BootRing from './components/BootRing';
import OrgRedirect from './components/OrgRedirect';
import AppAccessGate from './components/AppAccessGate';
import { useOrg } from './context/OrgContext';
import { resolveDefaultRoute, getAppById } from './config/apps';
import AppRoleGate from './components/AppRoleGate';
import ESSCompanyGate from './components/ESSCompanyGate';
import CountryGate from './components/CountryGate';
import OrgAdminGate from './components/OrgAdminGate';
import { Loader2 } from 'lucide-react';

// Public pages (always loaded)
import LandingPage from './pages/LandingPage';
const SignupPage = lazy(() => import('./pages/SignupPage'));
// /invite and /org/:slug/invite are outside OrgProvider, so PageSwitch
// (useOrg throws there) cannot gate them. Ships directly; legacy unreferenced.
const InviteAcceptPage = lazy(() => import('./pages/InviteAcceptPageV2'));
// Universal (Salesforce-style) login at /login — resolves org from email,
// then routes to /org/:slug/home. Branded /org/:slug/login still available.
const UniversalLoginPage = lazy(() => import('./pages/UniversalLoginPage'));
// /org/:slug/login is outside OrgProvider, so PageSwitch (useOrg throws
// there) cannot gate it. Ships directly; legacy kept unreferenced.
const OrgLoginPage = lazy(() => import('./pages/OrgLoginPageV2'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
import FeaturesPage from './pages/FeaturesPage';
import PricingPage from './pages/PricingPage';
// /find-workspace is outside OrgProvider, so PageSwitch (which calls useOrg,
// and useOrg throws outside the provider) cannot gate it. Ships directly;
// legacy ./pages/FindWorkspacePage is kept unreferenced for a one-line revert.
const FindWorkspacePage = lazy(() => import('./pages/FindWorkspacePageV2'));
// /reset-password is outside OrgProvider, so PageSwitch (useOrg throws
// there) cannot gate it. Ships directly; legacy kept unreferenced.
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPageV2'));
// /forgot-password is outside OrgProvider, so PageSwitch (useOrg throws
// there) cannot gate it. Ships directly; legacy kept unreferenced.
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPageV2'));
const AppLauncherPage = lazy(() => import('./pages/AppLauncherPage'));
const OnboardingHubPage = lazy(() => import('./pages/OnboardingHubPage'));
import OnboardingGate from './components/OnboardingGate';
const UpgradePage = lazy(() => import('./pages/UpgradePage'));

// Lazy-loaded: Outreach app pages
const DashboardPageV2 = lazy(() => import('./pages/DashboardPageV2'));
const EngagePageV2 = lazy(() => import('./pages/EngagePageV2'));
const SequenceWizardPageV2 = lazy(() => import('./pages/SequenceWizardPageV2'));
const TeamDashboardPageV2 = lazy(() => import('./pages/TeamDashboardPageV2'));

// Lazy-loaded: Standalone pages
const MyProfilePageV2 = lazy(() => import('./pages/MyProfilePageV2'));

// Lazy-loaded: Platform settings
const SettingsGeneralV2 = lazy(() => import('./components/settings/SettingsGeneralV2'));
const SettingsTeamV2 = lazy(() => import('./components/settings/SettingsTeamV2'));
const UserDetailV2 = lazy(() => import('./pages/settings/UserDetailV2'));
const SettingsOutreachV2 = lazy(() => import('./components/settings/SettingsOutreachV2'));
const SettingsTimesheetV2 = lazy(() => import('./components/settings/SettingsTimesheetV2'));
const SettingsEmployeeV2 = lazy(() => import('./components/settings/SettingsEmployeeV2'));
const SettingsPoliciesV2 = lazy(() => import('./components/settings/SettingsPoliciesV2'));
const MyPoliciesV2 = lazy(() => import('./pages/ess/MyPoliciesV2'));
const MyDocumentsV2 = lazy(() => import('./pages/ess/MyDocumentsV2'));
// /document-vault is a top-level route outside OrgProvider (deliberately —
// ex-employees reach it with no org membership), so PageSwitch cannot gate
// it. Ships directly; the legacy file is kept unreferenced.
const DocumentVault = lazy(() => import('./pages/DocumentVaultV2'));
const SettingsEmailLogsV2 = lazy(() => import('./components/settings/SettingsEmailLogsV2'));
const SettingsCrmV2 = lazy(() => import('./components/settings/SettingsCrmV2'));
const SettingsAtsV2 = lazy(() => import('./components/settings/SettingsAtsV2'));
const SettingsSignV2 = lazy(() => import('./components/settings/SettingsSignV2'));
const SettingsContactsV2 = lazy(() => import('./components/settings/SettingsContactsV2'));
const SettingsCompaniesV2 = lazy(() => import('./components/settings/SettingsCompaniesV2'));
const SettingsTodoV2 = lazy(() => import('./components/settings/SettingsTodoV2'));
const SettingsPayrollV2 = lazy(() => import('./components/settings/SettingsPayrollV2'));

// Lazy-loaded: Expenses app pages
const ExpenseDetailV2 = lazy(() => import('./pages/expenses/ExpenseDetailV2'));

// Lazy-loaded: To-Do app pages
const TodoDashboardV2 = lazy(() => import('./pages/todo/TodoDashboardV2'));
const TodoTasksV2 = lazy(() => import('./pages/todo/TodoTasksV2'));
const TodoTeamTasksV2 = lazy(() => import('./pages/todo/TodoTeamTasksV2'));

// Lazy-loaded: Timesheet app pages


// Lazy-loaded: Statutory Payroll pages
const SalaryStructuresPageV2 = lazy(() => import('./pages/payroll/SalaryStructuresPageV2'));

const StatutoryConfigPageV2 = lazy(() => import('./pages/payroll/StatutoryConfigPageV2'));
const PTMasterPageV2 = lazy(() => import('./pages/payroll/PTMasterPageV2'));
const PayrollRunPageV2 = lazy(() => import('./pages/payroll/PayrollRunPageV2'));
const AlumniPolicyPageV2 = lazy(() => import('./pages/settings/AlumniPolicyPageV2'));
const TaxDeclarationsPageV2 = lazy(() => import('./pages/payroll/TaxDeclarationsPageV2'));
const TaxReportsPageV2 = lazy(() => import('./pages/payroll/TaxReportsPageV2'));
const PayrollDashboardPageV2 = lazy(() => import('./pages/payroll/PayrollDashboardPageV2'));
const PayrollSettingsPageV2 = lazy(() => import('./pages/payroll/PayrollSettingsPageV2'));
const FnFDashboardV2 = lazy(() => import('./pages/payroll/FnFDashboardV2'));


// Lazy-loaded: Knowledge Base
const KnowledgeBasePage = lazy(() => import('./pages/kb/KnowledgeBasePage'));

// Lazy-loaded: Employee app pages
const EmployeeDashboardV2 = lazy(() => import('./pages/employee/EmployeeDashboardV2'));
const EmployeeDirectoryV2 = lazy(() => import('./pages/employee/EmployeeDirectoryV2'));
const OrgChartV2 = lazy(() => import('./pages/employee/OrgChartV2'));
const EmployeeDepartmentsV2 = lazy(() => import('./pages/employee/EmployeeDepartmentsV2'));
const EmployeeDetail = lazy(() => import('./pages/employee/EmployeeDetail'));
const EmployeeDetailV2 = lazy(() => import('./pages/employee/EmployeeDetailV2'));
const EmployeeForm = lazy(() => import('./pages/employee/EmployeeForm'));
const EmployeeFormV2 = lazy(() => import('./pages/employee/EmployeeFormV2'));
const EmployeeQuickCreateV2 = lazy(() => import('./pages/employee/EmployeeQuickCreateV2'));
const EmployeeOnboardingWizardV2 = lazy(() => import('./pages/employee/EmployeeOnboardingWizardV2'));
const PlanTemplatesV2 = lazy(() => import('./pages/employee/PlanTemplatesV2'));
const AssetListV2 = lazy(() => import('./pages/employee/AssetListV2'));
const AssetDetailV2 = lazy(() => import('./pages/employee/AssetDetailV2'));
const AssetTypeConfigV2 = lazy(() => import('./pages/employee/AssetTypeConfigV2'));

// Lazy-loaded: app pages (all v2 — the legacy set was deleted 2026-09-14).
const ContactsListV2 = lazy(() => import('./pages/contacts/ContactsListV2'));
const AtsCandidatesV2 = lazy(() => import('./pages/ats/AtsCandidatesV2'));
const AlumniDirectoryV2 = lazy(() => import('./pages/employee/AlumniDirectoryV2'));
const AtsMyApprovalsV2 = lazy(() => import('./pages/ats/AtsMyApprovalsV2'));
const AtsConfigV2 = lazy(() => import('./pages/ats/AtsConfigV2'));
const CrmConfigStagesV2 = lazy(() => import('./pages/crm/CrmConfigStagesV2'));
const CrmConfigTagsV2 = lazy(() => import('./pages/crm/CrmConfigTagsV2'));
const CrmConfigLostReasonsV2 = lazy(() => import('./pages/crm/CrmConfigLostReasonsV2'));
const ContactsConfigV2 = lazy(() => import('./pages/contacts/ContactsConfigV2'));
const ContactDetailV2 = lazy(() => import('./pages/contacts/ContactDetailV2'));
const LeadsPageV2 = lazy(() => import('./pages/LeadsPageV2'));
const MyListsPageV2 = lazy(() => import('./pages/MyListsPageV2'));
const TeamListsPageV2 = lazy(() => import('./pages/TeamListsPageV2'));
const TeamContactsPageV2 = lazy(() => import('./pages/TeamContactsPageV2'));
const AtsJobPositionsV2 = lazy(() => import('./pages/ats/AtsJobPositionsV2'));
const AtsApplicationsV2 = lazy(() => import('./pages/ats/AtsApplicationsV2'));
const CrmOpportunitiesV2 = lazy(() => import('./pages/crm/CrmOpportunitiesV2'));
const DocumentsListV2 = lazy(() => import('./pages/documents/DocumentsListV2'));
const ExpenseListV2 = lazy(() => import('./pages/expenses/ExpenseListV2'));
const LeaveBalancesV2 = lazy(() => import('./pages/timesheet/LeaveBalancesV2'));
const MyAssetsV2 = lazy(() => import('./pages/timesheet/MyAssetsV2'));
const TimesheetDashboardV2 = lazy(() => import('./pages/timesheet/TimesheetDashboardV2'));
const TimesheetEntryV2 = lazy(() => import('./pages/timesheet/TimesheetEntryV2'));
const MyAttendancePageV2 = lazy(() => import('./pages/timesheet/MyAttendancePageV2'));
const TimesheetUsersV2 = lazy(() => import('./pages/timesheet/TimesheetUsersV2'));
const LeaveApplyV2 = lazy(() => import('./pages/timesheet/LeaveApplyV2'));
const TimesheetApprovalsV2 = lazy(() => import('./pages/timesheet/TimesheetApprovalsV2'));
const AttendanceApprovalsV2 = lazy(() => import('./pages/timesheet/AttendanceApprovalsV2'));
const LeaveApprovalsV2 = lazy(() => import('./pages/timesheet/LeaveApprovalsV2'));
const TimesheetProjectsV2 = lazy(() => import('./pages/timesheet/TimesheetProjectsV2'));
const MyTaxDeclarationsPageV2 = lazy(() => import('./pages/payroll/MyTaxDeclarationsPageV2'));
const MyTaxReportPageV2 = lazy(() => import('./pages/payroll/MyTaxReportPageV2'));
const MySalaryPageV2 = lazy(() => import('./pages/payroll/MySalaryPageV2'));
const MyPayslipsPageV2 = lazy(() => import('./pages/payroll/MyPayslipsPageV2'));
const TimesheetEarningsV2 = lazy(() => import('./pages/timesheet/TimesheetEarningsV2'));
const MyFnfReceiptV2 = lazy(() => import('./pages/timesheet/MyFnfReceiptV2'));
const HolidayCalendarV2 = lazy(() => import('./pages/timesheet/HolidayCalendarV2'));
const LeaveMyRequestsV2 = lazy(() => import('./pages/timesheet/LeaveMyRequestsV2'));
const LeaveHistoryV2 = lazy(() => import('./pages/timesheet/LeaveHistoryV2'));
const LeaveReportsV2 = lazy(() => import('./pages/timesheet/LeaveReportsV2'));

// Lazy-loaded: Contacts app pages
const ContactDetail = lazy(() => import('./pages/contacts/ContactDetail'));

// Lazy-loaded: ATS app pages
const AtsPipelineV2 = lazy(() => import('./pages/ats/AtsPipelineV2'));
const AtsApplicationDetailV2 = lazy(() => import('./pages/ats/AtsApplicationDetailV2'));
const AtsJobDetailV2 = lazy(() => import('./pages/ats/AtsJobDetailV2'));
const AtsJobNewV2 = lazy(() => import('./pages/ats/AtsJobNewV2'));
const AtsCandidateDetailV2 = lazy(() => import('./pages/ats/AtsCandidateDetailV2'));
const AtsCandidateNewV2 = lazy(() => import('./pages/ats/AtsCandidateNewV2'));
const AtsApplicationNewV2 = lazy(() => import('./pages/ats/AtsApplicationNewV2'));
const AtsDashboardV2 = lazy(() => import('./pages/ats/AtsDashboardV2'));

// Lazy-loaded: CRM app pages
const CrmDashboardV2 = lazy(() => import('./pages/crm/CrmDashboardV2'));
const AssistantPageV2 = lazy(() => import('./pages/assistant/AssistantPageV2'));
const CrmPipelineV2 = lazy(() => import('./pages/crm/CrmPipelineV2'));
const CrmOpportunityDetailV2 = lazy(() => import('./pages/crm/CrmOpportunityDetailV2'));
const CrmOpportunityNewV2 = lazy(() => import('./pages/crm/CrmOpportunityNewV2'));

// Lazy-loaded: Sign app pages
const SignDashboardV2 = lazy(() => import('./pages/sign/SignDashboardV2'));
const SignTemplatesV2 = lazy(() => import('./pages/sign/SignTemplatesV2'));
const SignTemplateEditorV2 = lazy(() => import('./pages/sign/SignTemplateEditorV2'));
const SignRequestsV2 = lazy(() => import('./pages/sign/SignRequestsV2'));
const SignRequestDetailV2 = lazy(() => import('./pages/sign/SignRequestDetailV2'));
const SignConfigV2 = lazy(() => import('./pages/sign/SignConfigV2'));
const PublicSigningRoute = lazy(() => import('./pages/sign/PublicSigningRoute'));

// Lazy-loaded: Public careers (no auth)
const CareersHome = lazy(() => import('./pages/careers/CareersHome'));
const CareersJobDetail = lazy(() => import('./pages/careers/CareersJobDetail'));

// Lazy-loaded: Documents app pages
const DocumentDetailV2 = lazy(() => import('./pages/documents/DocumentDetailV2'));
const DocumentsManageFoldersV2 = lazy(() => import('./pages/documents/documentsConfigV2').then(m => ({ default: m.ManageFoldersV2 })));
const DocumentsManageTagsV2 = lazy(() => import('./pages/documents/documentsConfigV2').then(m => ({ default: m.ManageTagsV2 })));

// Lazy-loaded: Invoicing app pages
const InvoicingDashboardV2 = lazy(() => import('./pages/invoicing/InvoicingDashboardV2'));
const InvoiceDetailV2 = lazy(() => import('./pages/invoicing/InvoiceDetailV2'));
const InvoiceListV2 = lazy(() => import('./pages/invoicing/InvoiceListV2'));
const PaymentTermsConfigV2 = lazy(() => import('./pages/invoicing/PaymentTermsConfigV2'));
const TaxesConfigV2 = lazy(() => import('./pages/invoicing/TaxesConfigV2'));
const ProductCatalogV2 = lazy(() => import('./pages/invoicing/ProductCatalogV2'));
const TaxReportInvV2 = lazy(() => import('./pages/invoicing/TaxReportV2'));
const GstReconciliationV2 = lazy(() => import('./pages/invoicing/GstReconciliationV2'));
const ProfitabilityV2 = lazy(() => import('./pages/invoicing/ProfitabilityV2'));
const BankReconciliationV2 = lazy(() => import('./pages/invoicing/BankReconciliationV2'));
const FollowUpsV2 = lazy(() => import('./pages/invoicing/FollowUpsV2'));
const InvoiceFormV2 = lazy(() => import('./pages/invoicing/InvoiceFormV2'));
const VendorBillFormV2 = lazy(() => import('./pages/invoicing/VendorBillFormV2'));
const TdsReportInvV2 = lazy(() => import('./pages/invoicing/TdsReportV2'));
const SettingsInvoicingV2 = lazy(() => import('./components/settings/SettingsInvoicingV2'));
const TdsConfigV2 = lazy(() => import('./pages/invoicing/TdsConfigV2'));
const ExpenseCategoriesConfigV2 = lazy(() => import('./pages/invoicing/ExpenseCategoriesConfigV2'));
const JournalsConfigV2 = lazy(() => import('./pages/invoicing/JournalsConfigV2'));
const VendorBillListV2 = lazy(() => import('./pages/invoicing/VendorBillListV2'));
const PaymentsListV2 = lazy(() => import('./pages/invoicing/PaymentsListV2'));
const AgedReceivablesV2 = lazy(() => import('./pages/invoicing/AgedReceivablesV2'));
const AgedPayablesV2 = lazy(() => import('./pages/invoicing/AgedPayablesV2'));
const InvoiceAnalysisV2 = lazy(() => import('./pages/invoicing/InvoiceAnalysisV2'));

// Lazy-loaded: Incentive app pages
const IncentiveMyEarningsV2 = lazy(() => import('./pages/incentive/MyEarningsV2'));
const IncentiveDashboardV2 = lazy(() => import('./pages/incentive/IncentiveDashboardV2'));
const IncentiveRecordsListV2 = lazy(() => import('./pages/incentive/RecordsListV2'));
const IncentiveRecordFormV2 = lazy(() => import('./pages/incentive/RecordFormV2'));
const IncentiveRecordDetailV2 = lazy(() => import('./pages/incentive/RecordDetailV2'));
const IncentiveRatesTableV2 = lazy(() => import('./pages/incentive/RatesTableV2'));
// IncentiveSettings was moved into the global Settings hub at
// /org/:slug/settings/incentive — see components/settings/SettingsIncentive.
const SettingsIncentive = lazy(() => import('./components/settings/SettingsIncentive'));
const SettingsIncentiveV2 = lazy(() => import('./components/settings/SettingsIncentiveV2'));

// Lazy-loaded: Super Admin
import SuperAdminRoute from './components/SuperAdminRoute';
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
// /admin/login is outside OrgProvider. Ships directly; legacy unreferenced.
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPageV2'));
// /admin/* lives outside OrgProvider, so PageSwitch (which calls useOrg, and
// useOrg THROWS with no provider) cannot gate this route. The v2 page ships
// directly; the legacy file is kept unreferenced so this is a one-line revert.
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPageV2'));
// /admin/* lives outside OrgProvider, so PageSwitch (which calls useOrg, and
// useOrg THROWS with no provider) cannot gate this route. The v2 page ships
// directly; the legacy file is kept unreferenced so this is a one-line revert.
const AdminWorkspacesPage = lazy(() => import('./pages/admin/AdminWorkspacesPageV2'));
// /admin/* lives outside OrgProvider, so PageSwitch (which calls useOrg, and
// useOrg THROWS with no provider) cannot gate this route. The v2 page ships
// directly; the legacy file is kept unreferenced so this is a one-line revert.
const AdminWorkspaceDetailPage = lazy(() => import('./pages/admin/AdminWorkspaceDetailPageV2'));
// /admin/* lives outside OrgProvider, so PageSwitch (which calls useOrg, and
// useOrg THROWS with no provider) cannot gate this route. The v2 page ships
// directly; the legacy file is kept unreferenced so this is a one-line revert.
const AdminEmailTemplatesPage = lazy(() => import('./pages/admin/AdminEmailTemplatesPageV2'));
// /admin/* lives outside OrgProvider, so PageSwitch (which calls useOrg, and
// useOrg THROWS with no provider) cannot gate this route. The v2 page ships
// directly; the legacy file is kept unreferenced so this is a one-line revert.
const AdminAnnouncementsPage = lazy(() => import('./pages/admin/AdminAnnouncementsPageV2'));
// /admin/* lives outside OrgProvider, so PageSwitch (which calls useOrg, and
// useOrg THROWS with no provider) cannot gate this route. The v2 page ships
// directly; the legacy file is kept unreferenced so this is a one-line revert.
const AdminKbReviewPage = lazy(() => import('./pages/admin/AdminKbReviewPageV2'));
// /admin/* lives outside OrgProvider, so PageSwitch (which calls useOrg, and
// useOrg THROWS with no provider) cannot gate this route. The v2 page ships
// directly; the legacy file is kept unreferenced so this is a one-line revert.
const AdminPayrollSettingsPage = lazy(() => import('./pages/admin/AdminPayrollSettingsPageV2'));
// /admin/* lives outside OrgProvider, so PageSwitch (which calls useOrg, and
// useOrg THROWS with no provider) cannot gate this route. The v2 page ships
// directly; the legacy file is kept unreferenced so this is a one-line revert.
const AdminEmployeeSettingsPage = lazy(() => import('./pages/admin/AdminEmployeeSettingsPageV2'));

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

// The v2 shell is the only shell. The per-org `uiV2` flag and the legacy
// PlatformLayout that it used to select were removed on 2026-09-14 after
// every org had been on v2 since 2026-08-26 with zero legacy users; the
// flag still rides on the org payload but nothing reads it here.
function ShellSwitch() {
  const { currentOrg, loading } = useOrg();

  // Hold until the org is known. `currentOrg` starts null and the
  // localStorage cache hydrates in an effect, AFTER the first render; mounting
  // the shell before that fires every sidebar fetch against no org. The
  // spinner deliberately mirrors ProtectedRoute's so the auth spinner flows
  // into this one as one continuous loading state. Gate on
  // `loading && !currentOrg`, never `loading` alone — silent revalidation
  // sets loading with an org already in hand.
  if (loading && !currentOrg) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg, #020617)' }}
      >
        <BootRing />
      </div>
    );
  }

  return <PlatformLayoutV2 />;
}

// Wrapper that provides org context for /org/:slug/* routes
function OrgPlatformLayout() {
  return (
    <OrgProvider>
      <CompanyProvider>
        <PolicyAckProvider>
          <ShellSwitch />
          {/* Ask Rivvra — floating org-wide assistant. Rendered on every
              in-shell route; the SERVER decides whether this user has
              anything to ask about (capabilities), the panel just obeys. */}
          <Suspense fallback={null}><AssistantPanel /></Suspense>
        </PolicyAckProvider>
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

// 2026-05-14: CRM Reporting merged into Dashboard. Old URL kept as a
// redirect so existing bookmarks and email links survive. The page now
// renders its analytical sections inline (admin/lead-gated).
function CrmReportingRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/org/${slug}/crm/dashboard`} replace />;
}

// 2026-05-14: bare /org/:slug/crm lands role-aware via the app's
// defaultRoute resolver — Admin/Lead → /crm/dashboard, others →
// /crm/pipeline. Mirrors the ATS pattern wired the same day.
function CrmIndexRedirect() {
  const { slug } = useParams();
  const { getAppRole } = useOrg();
  const target = resolveDefaultRoute(getAppById('crm'), getAppRole('crm'));
  return <Navigate to={`/org/${slug}${target || '/crm/pipeline'}`} replace />;
}

// Helper: redirect old /incentive/settings (relocated into the global
// Settings hub on 2026-04-25) so existing bookmarks/links don't 404.
function IncentiveSettingsRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/org/${slug}/settings/incentive`} replace />;
}

// 2026-05-14: ATS "Reporting" renamed to "Dashboard" (page is a role-aware
// landing, not a static report). Old URL kept as a redirect so existing
// bookmarks, email links, and external references survive.
function AtsReportingRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/org/${slug}/ats/dashboard`} replace />;
}

// 2026-05-14: bare /org/:slug/ats lands on the ATS Dashboard (the
// universal landing). resolveDefaultRoute is kept on the call path so
// any future role-aware variant lands here cleanly without touching
// the routing.
function AtsIndexRedirect() {
  const { slug } = useParams();
  const { getAppRole } = useOrg();
  const target = resolveDefaultRoute(getAppById('ats'), getAppRole('ats'));
  return <Navigate to={`/org/${slug}${target || '/ats/dashboard'}`} replace />;
}

function App() {
  return (
    <AuthProvider>
      <StagingBanner />
      <ToastProvider>
      <PlanLimitListener />
      <ErrorBoundary>
      <Router>
        <AnalyticsRouteListener />
        <PlatformProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<UniversalLoginPage />} />
            <Route path="/invite" element={<InviteAcceptPage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/contact" element={<SupportPage />} />
            <Route path="/find-workspace" element={<FindWorkspacePage />} />
            {/* Document Vault — permanent, identity-scoped document access for
                any authenticated user, incl. fully-archived ex-employees who no
                longer have an active workspace. Auth-only (no org membership). */}
            <Route path="/document-vault" element={<ProtectedRoute><ErrorBoundary><DocumentVault /></ErrorBoundary></ProtectedRoute>} />
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
              {/* Ask Rivvra, full page (Phase 4): conversation list per company +
                  the same renderer as the floating panel. V2-only surface. */}
              <Route path="/org/:slug/assistant" element={<ErrorBoundary><AssistantPageV2 /></ErrorBoundary>} />
              {/* Onboarding hub — a permanent destination, reachable from the
                  sidebar rail long after the first-run card is dismissed.
                  Owner/admin only (2026-09-06): every task is an admin action
                  (post the first job, invite users, configure payroll), so a
                  plain member reaching it could only look at work they cannot
                  do. The teaser card and the "Setup NN%" chip are gated to
                  match, so nothing points a member here in the first place. */}
              <Route element={<OrgAdminGate />}>
                <Route path="/org/:slug/getting-started" element={<ErrorBoundary><OnboardingHubPage /></ErrorBoundary>} />
              </Route>
              <Route path="/org/:slug/my-profile" element={<MyProfilePageV2 />} />
              {/* Company Policies (ESS) — any authenticated member with a linked
                  employee record; intentionally NOT behind an app/country gate. */}
              <Route path="/org/:slug/my-policies" element={<ErrorBoundary><MyPoliciesV2 /></ErrorBoundary>} />
              {/* My Documents (ESS) — HR-shared documents; same gating as policies. */}
              <Route path="/org/:slug/my-documents" element={<ErrorBoundary><MyDocumentsV2 /></ErrorBoundary>} />

              {/* Employee onboarding wizard — outside AppAccessGate (any authenticated employee can access) */}
              <Route path="/org/:slug/employee/onboarding" element={<ErrorBoundary><EmployeeOnboardingWizardV2 /></ErrorBoundary>} />
              <Route path="/org/:slug/upgrade" element={<UpgradePage />} />

              {/* Outreach app routes — gated by outreach access */}
              <Route element={<AppAccessGate appId="outreach" />}>
                <Route path="/org/:slug/outreach/dashboard" element={<ErrorBoundary><DashboardPageV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/outreach/engage" element={<ErrorBoundary><EngagePageV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/outreach/engage/new-sequence" element={<SequenceWizardPageV2 />} />
                <Route path="/org/:slug/outreach/engage/edit-sequence/:sequenceId" element={<SequenceWizardPageV2 />} />
                <Route path="/org/:slug/outreach/leads" element={<LeadsPageV2 />} />
                <Route path="/org/:slug/outreach/leads/:leadId" element={<LeadsPageV2 />} />
                <Route path="/org/:slug/outreach/lists" element={<MyListsPageV2 />} />
                <Route path="/org/:slug/outreach/lists/:leadId" element={<MyListsPageV2 />} />
                <Route path="/org/:slug/outreach/settings" element={<OrgOutreachSettingsRedirect />} />
                <Route path="/org/:slug/outreach/team-dashboard" element={<ErrorBoundary><TeamDashboardPageV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/outreach/team-contacts" element={<TeamContactsPageV2 />} />
                <Route path="/org/:slug/outreach/team-contacts/:leadId" element={<TeamContactsPageV2 />} />
                <Route path="/org/:slug/outreach/team-lists" element={<TeamListsPageV2 />} />
                <Route path="/org/:slug/outreach/team-lists/:leadId" element={<TeamListsPageV2 />} />
              </Route>

              {/* Platform settings — profile is accessible to all, rest gated by admin */}
              <Route path="/org/:slug/settings" element={<OrgSettingsRedirect />} />
              <Route path="/org/:slug/settings/profile" element={<SettingsProfileRedirect />} />
              <Route element={<OrgAdminGate />}>
                <Route path="/org/:slug/settings/general" element={<SettingsPageWrapper><SettingsGeneralV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/users/:userId" element={<SettingsPageWrapper><UserDetailV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/users" element={<SettingsPageWrapper><SettingsTeamV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/outreach" element={<SettingsPageWrapper><SettingsOutreachV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/timesheet" element={<SettingsPageWrapper><SettingsTimesheetV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/payroll" element={<SettingsPageWrapper><SettingsPayrollV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/employee" element={<SettingsPageWrapper><SettingsEmployeeV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/policies" element={<SettingsPageWrapper><SettingsPoliciesV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/email-logs" element={<SettingsPageWrapper><SettingsEmailLogsV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/crm" element={<SettingsPageWrapper><SettingsCrmV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/ats" element={<SettingsPageWrapper><SettingsAtsV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/sign" element={<SettingsPageWrapper><SettingsSignV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/contacts" element={<SettingsPageWrapper><SettingsContactsV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/companies" element={<SettingsPageWrapper><SettingsCompaniesV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/companies/new" element={<SettingsPageWrapper><SettingsCompaniesV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/companies/:companyId" element={<SettingsPageWrapper><SettingsCompaniesV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/todo" element={<SettingsPageWrapper><SettingsTodoV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/invoicing" element={<SettingsPageWrapper><SettingsInvoicingV2 /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/incentive" element={<SettingsPageWrapper><SettingsIncentiveV2 /></SettingsPageWrapper>} />
              </Route>

              {/* Timesheet (ESS) app routes — gated by timesheet access + country (IN-only for now) + company match */}
              <Route element={<AppAccessGate appId="timesheet" />}>
                <Route element={<CountryGate allowed={['IN']} appName="Employee Self Service" />}>
                <Route element={<ESSCompanyGate />}>
                  <Route path="/org/:slug/timesheet/dashboard" element={<ErrorBoundary><TimesheetDashboardV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-timesheet" element={<ErrorBoundary><TimesheetEntryV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-attendance" element={<ErrorBoundary><MyAttendancePageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/earnings" element={<ErrorBoundary><TimesheetEarningsV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/approvals" element={<ErrorBoundary><TimesheetApprovalsV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/attendance/approvals" element={<ErrorBoundary><AttendanceApprovalsV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/users" element={<ErrorBoundary><TimesheetUsersV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/projects" element={<ErrorBoundary><TimesheetProjectsV2 /></ErrorBoundary>} />
                  {/* Leave Management */}
                  <Route path="/org/:slug/timesheet/leave/apply" element={<ErrorBoundary><LeaveApplyV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/my-requests" element={<ErrorBoundary><LeaveMyRequestsV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/approvals" element={<ErrorBoundary><LeaveApprovalsV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/balances" element={<ErrorBoundary><LeaveBalancesV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/balances/:employeeId" element={<ErrorBoundary><LeaveHistoryV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/reports" element={<ErrorBoundary><LeaveReportsV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/holidays" element={<ErrorBoundary><HolidayCalendarV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-assets" element={<ErrorBoundary><MyAssetsV2 /></ErrorBoundary>} />
                  {/* In-shell aliases (2026-09-08): the ESS sidebar links here so
                      Documents/Profile keep the sidebar and app context. The bare
                      /my-documents and /my-profile routes above stay for employees
                      without ESS access and for links already sent out. */}
                  <Route path="/org/:slug/timesheet/my-documents" element={<ErrorBoundary><MyDocumentsV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-profile" element={<ErrorBoundary><MyProfilePageV2 /></ErrorBoundary>} />
                  {/* Employee-facing statutory payroll pages */}
                  <Route path="/org/:slug/timesheet/my-salary" element={<ErrorBoundary><MySalaryPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-payslips" element={<ErrorBoundary><MyPayslipsPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-fnf" element={<ErrorBoundary><MyFnfReceiptV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/settings/alumni-policy" element={<ErrorBoundary><AlumniPolicyPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/alumni" element={<ErrorBoundary><AlumniDirectoryV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/tax/declarations" element={<ErrorBoundary><MyTaxDeclarationsPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/tax/report" element={<ErrorBoundary><MyTaxReportPageV2 /></ErrorBoundary>} />
                </Route>
                </Route>
              </Route>

              {/* Payroll app routes — gated by payroll app admin role + country (IN-only for now) */}
              <Route element={<AppRoleGate appId="payroll" requiredRole="admin" />}>
                <Route element={<CountryGate allowed={['IN']} appName="Payroll" />}>
                  <Route path="/org/:slug/payroll/process" element={<PayrollProcessRedirect />} />
                  <Route path="/org/:slug/payroll/pay-overview" element={<ErrorBoundary><PayrollDashboardPageV2 /></ErrorBoundary>} />

                  <Route path="/org/:slug/payroll/salary-structures" element={<ErrorBoundary><SalaryStructuresPageV2 /></ErrorBoundary>} />

                  <Route path="/org/:slug/payroll/statutory-config" element={<ErrorBoundary><StatutoryConfigPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/pt-master" element={<ErrorBoundary><PTMasterPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/statutory-run" element={<ErrorBoundary><PayrollRunPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/tax-declarations" element={<ErrorBoundary><TaxDeclarationsPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/tax-reports" element={<ErrorBoundary><TaxReportsPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/settings" element={<ErrorBoundary><PayrollSettingsPageV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/fnf" element={<ErrorBoundary><FnFDashboardV2 /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Legacy payroll redirects — old /timesheet/ paths → new /payroll/ paths */}
              <Route path="/org/:slug/timesheet/payroll" element={<Navigate to="../../payroll/process" replace />} />
              <Route path="/org/:slug/timesheet/pay-config" element={<Navigate to="../../payroll/pay-overview" replace />} />


              {/* Knowledge Base — readable by any member with the app enabled
                  (requiredRole="member"); org owners/admins pass automatically
                  via AppRoleGate's isOrgAdmin bypass. Article visibility is
                  further filtered per-app server-side, and authoring stays
                  admin-gated within the page. */}
              <Route element={<AppRoleGate appId="knowledgeBase" requiredRole="member" />}>
                <Route path="/org/:slug/knowledge-base" element={<ErrorBoundary><KnowledgeBasePage /></ErrorBoundary>} />
                <Route path="/org/:slug/knowledge-base/:articleSlug" element={<ErrorBoundary><KnowledgeBasePage /></ErrorBoundary>} />
              </Route>

              {/* Employee app routes — gated by employee access */}
              <Route element={<AppAccessGate appId="employee" />}>
                <Route path="/org/:slug/employee/dashboard" element={<ErrorBoundary><EmployeeDashboardV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/directory" element={<ErrorBoundary><EmployeeDirectoryV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/org-chart" element={<ErrorBoundary><OrgChartV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/departments" element={<ErrorBoundary><EmployeeDepartmentsV2 /></ErrorBoundary>} />
                {/* Add/Edit/Plan Templates require employee admin role */}
                <Route element={<AppRoleGate appId="employee" requiredRole="admin" />}>
                  {/* /employee/add now uses the Odoo-style quick-create flow:
                      minimal fields → POST → redirect to the inline-editable
                      EmployeeDetail page. EmployeeForm stays wired to
                      /employee/edit/:id until EmployeeDetail absorbs all
                      remaining edit affordances. */}
                  <Route path="/org/:slug/employee/add" element={<ErrorBoundary><EmployeeQuickCreateV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/edit/:employeeId" element={<ErrorBoundary><EmployeeFormV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/plan-templates" element={<ErrorBoundary><PlanTemplatesV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/assets/types" element={<ErrorBoundary><AssetTypeConfigV2 /></ErrorBoundary>} />
                </Route>
                <Route path="/org/:slug/employee/assets" element={<ErrorBoundary><AssetListV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/assets/:assetId" element={<ErrorBoundary><AssetDetailV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/:employeeId" element={<ErrorBoundary><EmployeeDetailV2 /></ErrorBoundary>} />
              </Route>

              {/* Contacts app routes — gated by contacts access */}
              <Route element={<AppAccessGate appId="contacts" />}>
                <Route path="/org/:slug/contacts/list" element={<ErrorBoundary><ContactsListV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/contacts/companies" element={<ErrorBoundary><ContactsListV2 filterType="company" /></ErrorBoundary>} />
                <Route path="/org/:slug/contacts/individuals" element={<ErrorBoundary><ContactsListV2 filterType="individual" /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="contacts" requiredRole="admin" />}>
                  <Route path="/org/:slug/contacts/config" element={<ErrorBoundary><ContactsConfigV2 /></ErrorBoundary>} />
                </Route>
                <Route path="/org/:slug/contacts/new-record" element={<ErrorBoundary><ContactDetail /></ErrorBoundary>} />
                <Route path="/org/:slug/contacts/:contactId" element={<ErrorBoundary><ContactDetailV2 /></ErrorBoundary>} />
              </Route>

              {/* CRM app routes — gated by crm access */}
              <Route element={<AppAccessGate appId="crm" />}>
                <Route path="/org/:slug/crm" element={<CrmIndexRedirect />} />
                <Route path="/org/:slug/crm/dashboard" element={<ErrorBoundary><CrmDashboardV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/pipeline" element={<ErrorBoundary><CrmPipelineV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities" element={<ErrorBoundary><CrmOpportunitiesV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities/new" element={<ErrorBoundary><CrmOpportunityNewV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities/:opportunityId" element={<ErrorBoundary><CrmOpportunityDetailV2 /></ErrorBoundary>} />
                {/* 2026-05-14: Reporting merged into Dashboard — keep old path redirecting */}
                <Route path="/org/:slug/crm/reporting" element={<CrmReportingRedirect />} />
                <Route element={<AppRoleGate appId="crm" requiredRole="admin" />}>
                  <Route path="/org/:slug/crm/config" element={<CrmConfigRedirect />} />
                  <Route path="/org/:slug/crm/config/stages" element={<ErrorBoundary><CrmConfigStagesV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/crm/config/tags" element={<ErrorBoundary><CrmConfigTagsV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/crm/config/lost-reasons" element={<ErrorBoundary><CrmConfigLostReasonsV2 /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* ATS app routes — gated by ats access */}
              <Route element={<AppAccessGate appId="ats" />}>
                <Route path="/org/:slug/ats" element={<AtsIndexRedirect />} />
                <Route path="/org/:slug/ats/pipeline" element={<ErrorBoundary><AtsPipelineV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/applications" element={<ErrorBoundary><AtsApplicationsV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/applications/:applicationId" element={<ErrorBoundary><AtsApplicationDetailV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs" element={<ErrorBoundary><AtsJobPositionsV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs/new" element={<ErrorBoundary><AtsJobNewV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs/:jobId" element={<ErrorBoundary><AtsJobDetailV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs/:jobId/applications/new" element={<ErrorBoundary><AtsApplicationNewV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/candidates" element={<ErrorBoundary><AtsCandidatesV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/candidates/new" element={<ErrorBoundary><AtsCandidateNewV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/candidates/:candidateId" element={<ErrorBoundary><AtsCandidateDetailV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/my-approvals" element={<ErrorBoundary><AtsMyApprovalsV2 /></ErrorBoundary>} />
                {/* 2026-05-14: Dashboard is the ATS landing for everyone,
                    so it sits outside the admin gate. Old /ats/reporting
                    path still redirects in for bookmark continuity. */}
                <Route path="/org/:slug/ats/dashboard" element={<ErrorBoundary><AtsDashboardV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/reporting" element={<AtsReportingRedirect />} />
                <Route element={<AppRoleGate appId="ats" requiredRole="admin" />}>
                  <Route path="/org/:slug/ats/config" element={<ErrorBoundary><AtsConfigV2 /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Sign app routes — gated by sign access */}
              <Route element={<AppAccessGate appId="sign" />}>
                <Route path="/org/:slug/sign/dashboard" element={<ErrorBoundary><SignDashboardV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/requests" element={<ErrorBoundary><SignRequestsV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/requests/:requestId" element={<ErrorBoundary><SignRequestDetailV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/templates" element={<ErrorBoundary><SignTemplatesV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/templates/:templateId/edit" element={<ErrorBoundary><SignTemplateEditorV2 /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="sign" requiredRole="admin" />}>
                  <Route path="/org/:slug/sign/config" element={<ErrorBoundary><SignConfigV2 /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Documents app — read for any member, manage pages admin-only */}
              <Route element={<AppAccessGate appId="documents" />}>
                <Route path="/org/:slug/documents" element={<ErrorBoundary><DocumentsListV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/documents/:id" element={<ErrorBoundary><DocumentDetailV2 /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="documents" requiredRole="admin" />}>
                  <Route path="/org/:slug/documents/manage/folders" element={<ErrorBoundary><DocumentsManageFoldersV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/documents/manage/tags" element={<ErrorBoundary><DocumentsManageTagsV2 /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* To-Do app routes — gated by todo access */}
              <Route element={<AppAccessGate appId="todo" />}>
                <Route path="/org/:slug/todo/dashboard" element={<ErrorBoundary><TodoDashboardV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/todo/tasks" element={<ErrorBoundary><TodoTasksV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/todo/team" element={<ErrorBoundary><TodoTeamTasksV2 /></ErrorBoundary>} />
              </Route>

              {/* Invoicing app routes — admin only */}
              <Route element={<AppAccessGate appId="invoicing" />}>
                <Route element={<AppRoleGate appId="invoicing" requiredRole="admin" />}>
                  <Route path="/org/:slug/invoicing/dashboard" element={<ErrorBoundary><InvoicingDashboardV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices" element={<ErrorBoundary><InvoiceListV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices/new" element={<ErrorBoundary><InvoiceFormV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices/:invoiceId/edit" element={<ErrorBoundary><InvoiceFormV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices/:invoiceId" element={<ErrorBoundary><InvoiceDetailV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/bills" element={<ErrorBoundary><VendorBillListV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/employee-bills" element={<ErrorBoundary><VendorBillListV2 mode="employee" /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/bills/new" element={<ErrorBoundary><VendorBillFormV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/bills/:billId/edit" element={<ErrorBoundary><VendorBillFormV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/payments" element={<ErrorBoundary><PaymentsListV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/products" element={<ErrorBoundary><ProductCatalogV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reconciliation" element={<ErrorBoundary><BankReconciliationV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/follow-ups" element={<ErrorBoundary><FollowUpsV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/receivables" element={<ErrorBoundary><AgedReceivablesV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/payables" element={<ErrorBoundary><AgedPayablesV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/tax" element={<ErrorBoundary><TaxReportInvV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/tds" element={<ErrorBoundary><TdsReportInvV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/gst-2b" element={<ErrorBoundary><GstReconciliationV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/analysis" element={<ErrorBoundary><InvoiceAnalysisV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/profitability" element={<ErrorBoundary><ProfitabilityV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/products" element={<ErrorBoundary><ProductCatalogV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/taxes" element={<ErrorBoundary><TaxesConfigV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/tds" element={<ErrorBoundary><TdsConfigV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/payment-terms" element={<ErrorBoundary><PaymentTermsConfigV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/expense-categories" element={<ErrorBoundary><ExpenseCategoriesConfigV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/journals" element={<ErrorBoundary><JournalsConfigV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/settings" element={<ErrorBoundary><SettingsInvoicingV2 /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Incentive app routes — member for own earnings, admin for everything else */}
              <Route element={<AppAccessGate appId="incentive" />}>
                {/* Member-accessible */}
                <Route path="/org/:slug/incentive/my-earnings" element={<ErrorBoundary><IncentiveMyEarningsV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/incentive/records/:recordId" element={<ErrorBoundary><IncentiveRecordDetailV2 /></ErrorBoundary>} />
                {/* Admin-only */}
                <Route element={<AppRoleGate appId="incentive" requiredRole="admin" />}>
                  <Route path="/org/:slug/incentive/dashboard" element={<ErrorBoundary><IncentiveDashboardV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/records" element={<ErrorBoundary><IncentiveRecordsListV2 /></ErrorBoundary>} />
                  {/* /records/new removed — drafts are auto-created from paid invoices only.
                      /records/:recordId/edit kept so admins can tweak existing drafts before approval. */}
                  <Route path="/org/:slug/incentive/records/:recordId/edit" element={<ErrorBoundary><IncentiveRecordFormV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/rates" element={<ErrorBoundary><IncentiveRatesTableV2 /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/settings" element={<IncentiveSettingsRedirect />} />
                </Route>
              </Route>

              {/* Expenses app routes — default-enabled for all org members */}
              <Route element={<AppAccessGate appId="expenses" />}>
                <Route path="/org/:slug/expenses" element={<ErrorBoundary><ExpenseListV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/expenses/new" element={<ErrorBoundary><ExpenseDetailV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/expenses/team" element={<ErrorBoundary><ExpenseListV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/expenses/all" element={<ErrorBoundary><ExpenseListV2 /></ErrorBoundary>} />
                <Route path="/org/:slug/expenses/:id" element={<ErrorBoundary><ExpenseDetailV2 /></ErrorBoundary>} />
              </Route>
            </Route>

            {/* ============================================================ */}
            {/* PUBLIC SIGNING PAGE — no auth required, token-based access    */}
            {/* ============================================================ */}
            <Route path="/sign/public/:requestId/:signerId/:token" element={<PublicSigningRoute />} />

            {/* ============================================================ */}
            {/* PUBLIC CAREERS — no auth, gated by org.careersEnabled         */}
            {/* ============================================================ */}
            <Route path="/careers/:orgSlug" element={<CareersHome />} />
            <Route path="/careers/:orgSlug/jobs/:publicSlug" element={<CareersJobDetail />} />

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
            <Route path="/expenses/*" element={<OrgRedirect />} />
            <Route path="/todo/*" element={<OrgRedirect />} />
            <Route path="/documents/*" element={<OrgRedirect />} />
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
              <Route path="/admin/announcements" element={<AdminAnnouncementsPage />} />
              <Route path="/admin/kb-review" element={<AdminKbReviewPage />} />
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
