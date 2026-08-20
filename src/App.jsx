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
import PlatformLayout from './components/platform/PlatformLayout';
// v2 shell is lazy: orgs without the uiV2 flag never download it.
const PlatformLayoutV2 = lazy(() => import('./components/platform/v2/PlatformLayoutV2'));
import ChatbotWidget from './components/chatbot/ChatbotWidget';
import ProtectedRoute from './components/ProtectedRoute';
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
import SignupPage from './pages/SignupPage';
import InviteAcceptPage from './pages/InviteAcceptPage';
// Universal (Salesforce-style) login at /login — resolves org from email,
// then routes to /org/:slug/home. Branded /org/:slug/login still available.
import UniversalLoginPage from './pages/UniversalLoginPage';
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
const DashboardPageV2 = lazy(() => import('./pages/DashboardPageV2'));
const EngagePage = lazy(() => import('./pages/EngagePage'));
const EngagePageV2 = lazy(() => import('./pages/EngagePageV2'));
const SequenceWizardPage = lazy(() => import('./pages/SequenceWizardPage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const MyListsPage = lazy(() => import('./pages/MyListsPage'));
const TeamDashboardPage = lazy(() => import('./pages/TeamDashboardPage'));
const TeamDashboardPageV2 = lazy(() => import('./pages/TeamDashboardPageV2'));
const TeamContactsPage = lazy(() => import('./pages/TeamContactsPage'));
const TeamListsPage = lazy(() => import('./pages/TeamListsPage'));

// Lazy-loaded: Standalone pages
const MyProfilePage = lazy(() => import('./pages/MyProfilePage'));
const MyProfilePageV2 = lazy(() => import('./pages/MyProfilePageV2'));

// Lazy-loaded: Platform settings
const SettingsGeneral = lazy(() => import('./components/settings/SettingsGeneral'));
const SettingsGeneralV2 = lazy(() => import('./components/settings/SettingsGeneralV2'));
const SettingsTeam = lazy(() => import('./components/settings/SettingsTeam'));
const SettingsTeamV2 = lazy(() => import('./components/settings/SettingsTeamV2'));
const UserDetail = lazy(() => import('./pages/settings/UserDetail'));
const UserDetailV2 = lazy(() => import('./pages/settings/UserDetailV2'));
const SettingsOutreach = lazy(() => import('./components/settings/SettingsOutreach'));
const SettingsOutreachV2 = lazy(() => import('./components/settings/SettingsOutreachV2'));
const SettingsTimesheet = lazy(() => import('./components/settings/SettingsTimesheet'));
const SettingsTimesheetV2 = lazy(() => import('./components/settings/SettingsTimesheetV2'));
const SettingsEmployee = lazy(() => import('./components/settings/SettingsEmployee'));
const SettingsEmployeeV2 = lazy(() => import('./components/settings/SettingsEmployeeV2'));
const SettingsPolicies = lazy(() => import('./components/settings/SettingsPolicies'));
const SettingsPoliciesV2 = lazy(() => import('./components/settings/SettingsPoliciesV2'));
const MyPolicies = lazy(() => import('./pages/ess/MyPolicies'));
const MyDocuments = lazy(() => import('./pages/ess/MyDocuments'));
const MyPoliciesV2 = lazy(() => import('./pages/ess/MyPoliciesV2'));
const MyDocumentsV2 = lazy(() => import('./pages/ess/MyDocumentsV2'));
const DocumentVault = lazy(() => import('./pages/DocumentVault'));
const SettingsEmailLogs = lazy(() => import('./components/settings/SettingsEmailLogs'));
const SettingsEmailLogsV2 = lazy(() => import('./components/settings/SettingsEmailLogsV2'));
const SettingsCrm = lazy(() => import('./components/settings/SettingsCrm'));
const SettingsCrmV2 = lazy(() => import('./components/settings/SettingsCrmV2'));
const SettingsAts = lazy(() => import('./components/settings/SettingsAts'));
const SettingsAtsV2 = lazy(() => import('./components/settings/SettingsAtsV2'));
const SettingsSign = lazy(() => import('./components/settings/SettingsSign'));
const SettingsSignV2 = lazy(() => import('./components/settings/SettingsSignV2'));
const SettingsContacts = lazy(() => import('./components/settings/SettingsContacts'));
const SettingsContactsV2 = lazy(() => import('./components/settings/SettingsContactsV2'));
const SettingsCompanies = lazy(() => import('./components/settings/SettingsCompanies'));
const SettingsCompaniesV2 = lazy(() => import('./components/settings/SettingsCompaniesV2'));
const SettingsTodo = lazy(() => import('./components/settings/SettingsTodo'));
const SettingsTodoV2 = lazy(() => import('./components/settings/SettingsTodoV2'));
const SettingsPayroll = lazy(() => import('./components/settings/SettingsPayroll'));
const SettingsPayrollV2 = lazy(() => import('./components/settings/SettingsPayrollV2'));

// Lazy-loaded: Expenses app pages
const ExpenseList = lazy(() => import('./pages/expenses/ExpenseList'));
const ExpenseDetail = lazy(() => import('./pages/expenses/ExpenseDetail'));
const ExpenseDetailV2 = lazy(() => import('./pages/expenses/ExpenseDetailV2'));

// Lazy-loaded: To-Do app pages
const TodoDashboard = lazy(() => import('./pages/todo/TodoDashboard'));
const TodoDashboardV2 = lazy(() => import('./pages/todo/TodoDashboardV2'));
const TodoTasks = lazy(() => import('./pages/todo/TodoTasks'));
const TodoTasksV2 = lazy(() => import('./pages/todo/TodoTasksV2'));
const TodoTeamTasks = lazy(() => import('./pages/todo/TodoTeamTasks'));
const TodoTeamTasksV2 = lazy(() => import('./pages/todo/TodoTeamTasksV2'));

// Lazy-loaded: Timesheet app pages
const TimesheetDashboard = lazy(() => import('./pages/timesheet/TimesheetDashboard'));
const TimesheetEntry = lazy(() => import('./pages/timesheet/TimesheetEntry'));
const MyAttendancePage = lazy(() => import('./pages/timesheet/MyAttendancePage'));
const TimesheetEarnings = lazy(() => import('./pages/timesheet/TimesheetEarnings'));
const TimesheetApprovals = lazy(() => import('./pages/timesheet/TimesheetApprovals'));
const TimesheetUsers = lazy(() => import('./pages/timesheet/TimesheetUsers'));
const TimesheetProjects = lazy(() => import('./pages/timesheet/TimesheetProjects'));


// Lazy-loaded: Statutory Payroll pages
const SalaryStructuresPage = lazy(() => import('./pages/payroll/SalaryStructuresPage'));
const SalaryStructuresPageV2 = lazy(() => import('./pages/payroll/SalaryStructuresPageV2'));

const StatutoryConfigPage = lazy(() => import('./pages/payroll/StatutoryConfigPage'));
const StatutoryConfigPageV2 = lazy(() => import('./pages/payroll/StatutoryConfigPageV2'));
const PTMasterPage = lazy(() => import('./pages/payroll/PTMasterPage'));
const PTMasterPageV2 = lazy(() => import('./pages/payroll/PTMasterPageV2'));
const PayrollRunPage = lazy(() => import('./pages/payroll/PayrollRunPage'));
const PayrollRunPageV2 = lazy(() => import('./pages/payroll/PayrollRunPageV2'));
const MySalaryPage = lazy(() => import('./pages/payroll/MySalaryPage'));
const MyPayslipsPage = lazy(() => import('./pages/payroll/MyPayslipsPage'));
const MyFnfReceipt = lazy(() => import('./pages/timesheet/MyFnfReceipt'));
const AlumniPolicyPage = lazy(() => import('./pages/settings/AlumniPolicyPage'));
const AlumniPolicyPageV2 = lazy(() => import('./pages/settings/AlumniPolicyPageV2'));
const AlumniDirectoryPage = lazy(() => import('./pages/employee/AlumniDirectory'));
const TaxDeclarationsPage = lazy(() => import('./pages/payroll/TaxDeclarationsPage'));
const TaxDeclarationsPageV2 = lazy(() => import('./pages/payroll/TaxDeclarationsPageV2'));
const TaxReportsPage = lazy(() => import('./pages/payroll/TaxReportsPage'));
const TaxReportsPageV2 = lazy(() => import('./pages/payroll/TaxReportsPageV2'));
const PayrollDashboardPage = lazy(() => import('./pages/payroll/PayrollDashboardPage'));
const PayrollDashboardPageV2 = lazy(() => import('./pages/payroll/PayrollDashboardPageV2'));
const PayrollSettingsPage = lazy(() => import('./pages/payroll/PayrollSettingsPage'));
const PayrollSettingsPageV2 = lazy(() => import('./pages/payroll/PayrollSettingsPageV2'));
const MyTaxDeclarationsPage = lazy(() => import('./pages/payroll/MyTaxDeclarationsPage'));
const MyTaxReportPage = lazy(() => import('./pages/payroll/MyTaxReportPage'));
const FnFDashboard = lazy(() => import('./pages/payroll/FnFDashboard'));
const FnFDashboardV2 = lazy(() => import('./pages/payroll/FnFDashboardV2'));

const AttendanceApprovals = lazy(() => import('./pages/timesheet/AttendanceApprovals'));
const LeaveApply = lazy(() => import('./pages/timesheet/LeaveApply'));
const LeaveMyRequests = lazy(() => import('./pages/timesheet/LeaveMyRequests'));
const LeaveApprovals = lazy(() => import('./pages/timesheet/LeaveApprovals'));
const LeaveBalances = lazy(() => import('./pages/timesheet/LeaveBalances'));
const LeaveHistory = lazy(() => import('./pages/timesheet/LeaveHistory'));
const LeaveReports = lazy(() => import('./pages/timesheet/LeaveReports'));
const HolidayCalendar = lazy(() => import('./pages/timesheet/HolidayCalendar'));
const MyAssets = lazy(() => import('./pages/timesheet/MyAssets'));

// Lazy-loaded: Knowledge Base
const KnowledgeBasePage = lazy(() => import('./pages/kb/KnowledgeBasePage'));

// Lazy-loaded: Employee app pages
const EmployeeDashboard = lazy(() => import('./pages/employee/EmployeeDashboard'));
const EmployeeDashboardV2 = lazy(() => import('./pages/employee/EmployeeDashboardV2'));
const EmployeeDirectory = lazy(() => import('./pages/employee/EmployeeDirectory'));
const EmployeeDirectoryV2 = lazy(() => import('./pages/employee/EmployeeDirectoryV2'));
const OrgChart = lazy(() => import('./pages/employee/OrgChart'));
const OrgChartV2 = lazy(() => import('./pages/employee/OrgChartV2'));
const EmployeeDepartments = lazy(() => import('./pages/employee/EmployeeDepartments'));
const EmployeeDepartmentsV2 = lazy(() => import('./pages/employee/EmployeeDepartmentsV2'));
const EmployeeDetail = lazy(() => import('./pages/employee/EmployeeDetail'));
const EmployeeDetailV2 = lazy(() => import('./pages/employee/EmployeeDetailV2'));
const EmployeeForm = lazy(() => import('./pages/employee/EmployeeForm'));
const EmployeeFormV2 = lazy(() => import('./pages/employee/EmployeeFormV2'));
const EmployeeQuickCreate = lazy(() => import('./pages/employee/EmployeeQuickCreate'));
const EmployeeQuickCreateV2 = lazy(() => import('./pages/employee/EmployeeQuickCreateV2'));
const EmployeeOnboardingWizard = lazy(() => import('./pages/employee/EmployeeOnboardingWizard'));
const EmployeeOnboardingWizardV2 = lazy(() => import('./pages/employee/EmployeeOnboardingWizardV2'));
const PlanTemplates = lazy(() => import('./pages/employee/PlanTemplates'));
const PlanTemplatesV2 = lazy(() => import('./pages/employee/PlanTemplatesV2'));
const AssetList = lazy(() => import('./pages/employee/AssetList'));
const AssetListV2 = lazy(() => import('./pages/employee/AssetListV2'));
const AssetDetail = lazy(() => import('./pages/employee/AssetDetail'));
const AssetDetailV2 = lazy(() => import('./pages/employee/AssetDetailV2'));
const AssetTypeConfig = lazy(() => import('./pages/employee/AssetTypeConfig'));
const AssetTypeConfigV2 = lazy(() => import('./pages/employee/AssetTypeConfigV2'));

// Lazy-loaded: v2 (redesign) pages — only downloaded by uiV2 orgs.
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
const ContactsList = lazy(() => import('./pages/contacts/ContactsList'));
const ContactDetail = lazy(() => import('./pages/contacts/ContactDetail'));
const ContactsConfig = lazy(() => import('./pages/contacts/ContactsConfig'));

// Lazy-loaded: ATS app pages
const AtsPipeline = lazy(() => import('./pages/ats/AtsPipeline'));
const AtsPipelineV2 = lazy(() => import('./pages/ats/AtsPipelineV2'));
const AtsApplications = lazy(() => import('./pages/ats/AtsApplications'));
const AtsApplicationDetail = lazy(() => import('./pages/ats/AtsApplicationDetail'));
const AtsApplicationDetailV2 = lazy(() => import('./pages/ats/AtsApplicationDetailV2'));
const AtsJobPositions = lazy(() => import('./pages/ats/AtsJobPositions'));
const AtsJobDetail = lazy(() => import('./pages/ats/AtsJobDetail'));
const AtsJobDetailV2 = lazy(() => import('./pages/ats/AtsJobDetailV2'));
const AtsJobNew = lazy(() => import('./pages/ats/AtsJobNew'));
const AtsCandidates = lazy(() => import('./pages/ats/AtsCandidates'));
const AtsCandidateDetail = lazy(() => import('./pages/ats/AtsCandidateDetail'));
const AtsCandidateDetailV2 = lazy(() => import('./pages/ats/AtsCandidateDetailV2'));
const AtsCandidateNew = lazy(() => import('./pages/ats/AtsCandidateNew'));
const AtsApplicationNew = lazy(() => import('./pages/ats/AtsApplicationNew'));
const AtsApplicationNewV2 = lazy(() => import('./pages/ats/AtsApplicationNewV2'));
const AtsDashboard = lazy(() => import('./pages/ats/AtsDashboard'));
const AtsDashboardV2 = lazy(() => import('./pages/ats/AtsDashboardV2'));
const AtsMyApprovals = lazy(() => import('./pages/ats/AtsMyApprovals'));
const AtsConfig = lazy(() => import('./pages/ats/AtsConfig'));

// Lazy-loaded: CRM app pages
const CrmDashboard = lazy(() => import('./pages/crm/CrmDashboard'));
const CrmDashboardV2 = lazy(() => import('./pages/crm/CrmDashboardV2'));
const CrmPipeline = lazy(() => import('./pages/crm/CrmPipeline'));
const CrmPipelineV2 = lazy(() => import('./pages/crm/CrmPipelineV2'));
const CrmOpportunities = lazy(() => import('./pages/crm/CrmOpportunities'));
const CrmOpportunityDetail = lazy(() => import('./pages/crm/CrmOpportunityDetail'));
const CrmOpportunityDetailV2 = lazy(() => import('./pages/crm/CrmOpportunityDetailV2'));
const CrmOpportunityNew = lazy(() => import('./pages/crm/CrmOpportunityNew'));
const CrmOpportunityNewV2 = lazy(() => import('./pages/crm/CrmOpportunityNewV2'));
const CrmConfigStages = lazy(() => import('./pages/crm/CrmConfigStages'));
const CrmConfigTags = lazy(() => import('./pages/crm/CrmConfigTags'));
const CrmConfigLostReasons = lazy(() => import('./pages/crm/CrmConfigLostReasons'));

// Lazy-loaded: Sign app pages
const SignDashboard = lazy(() => import('./pages/sign/SignDashboard'));
const SignDashboardV2 = lazy(() => import('./pages/sign/SignDashboardV2'));
const SignTemplates = lazy(() => import('./pages/sign/SignTemplates'));
const SignTemplatesV2 = lazy(() => import('./pages/sign/SignTemplatesV2'));
const SignTemplateEditor = lazy(() => import('./pages/sign/SignTemplateEditor'));
const SignTemplateEditorV2 = lazy(() => import('./pages/sign/SignTemplateEditorV2'));
const SignRequests = lazy(() => import('./pages/sign/SignRequests'));
const SignRequestsV2 = lazy(() => import('./pages/sign/SignRequestsV2'));
const SignRequestDetail = lazy(() => import('./pages/sign/SignRequestDetail'));
const SignRequestDetailV2 = lazy(() => import('./pages/sign/SignRequestDetailV2'));
const SignConfig = lazy(() => import('./pages/sign/SignConfig'));
const SignConfigV2 = lazy(() => import('./pages/sign/SignConfigV2'));
const PublicSigningRoute = lazy(() => import('./pages/sign/PublicSigningRoute'));

// Lazy-loaded: Public careers (no auth)
const CareersHome = lazy(() => import('./pages/careers/CareersHome'));
const CareersJobDetail = lazy(() => import('./pages/careers/CareersJobDetail'));

// Lazy-loaded: Documents app pages
const DocumentsList = lazy(() => import('./pages/documents/DocumentsList'));
const DocumentDetail = lazy(() => import('./pages/documents/DocumentDetail'));
const DocumentDetailV2 = lazy(() => import('./pages/documents/DocumentDetailV2'));
const DocumentsManageFolders = lazy(() => import('./pages/documents/ManageFolders'));
const DocumentsManageTags = lazy(() => import('./pages/documents/ManageTags'));
const DocumentsManageFoldersV2 = lazy(() => import('./pages/documents/documentsConfigV2').then(m => ({ default: m.ManageFoldersV2 })));
const DocumentsManageTagsV2 = lazy(() => import('./pages/documents/documentsConfigV2').then(m => ({ default: m.ManageTagsV2 })));

// Lazy-loaded: Invoicing app pages
const InvoicingDashboard = lazy(() => import('./pages/invoicing/InvoicingDashboard'));
const InvoicingDashboardV2 = lazy(() => import('./pages/invoicing/InvoicingDashboardV2'));
const InvoiceList = lazy(() => import('./pages/invoicing/InvoiceList'));
const InvoiceForm = lazy(() => import('./pages/invoicing/InvoiceForm'));
const InvoiceDetail = lazy(() => import('./pages/invoicing/InvoiceDetail'));
const InvoiceDetailV2 = lazy(() => import('./pages/invoicing/InvoiceDetailV2'));
const VendorBillList = lazy(() => import('./pages/invoicing/VendorBillList'));
const VendorBillForm = lazy(() => import('./pages/invoicing/VendorBillForm'));
const PaymentsList = lazy(() => import('./pages/invoicing/PaymentsList'));
const ProductCatalog = lazy(() => import('./pages/invoicing/ProductCatalog'));
const BankReconciliation = lazy(() => import('./pages/invoicing/BankReconciliation'));
const FollowUps = lazy(() => import('./pages/invoicing/FollowUps'));
const AgedReceivables = lazy(() => import('./pages/invoicing/AgedReceivables'));
const AgedPayables = lazy(() => import('./pages/invoicing/AgedPayables'));
const TaxReportInv = lazy(() => import('./pages/invoicing/TaxReport'));
const TdsReportInv = lazy(() => import('./pages/invoicing/TdsReport'));
const GstReconciliation = lazy(() => import('./pages/invoicing/GstReconciliation'));
const InvoiceAnalysis = lazy(() => import('./pages/invoicing/InvoiceAnalysis'));
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
const Profitability = lazy(() => import('./pages/invoicing/Profitability'));
const SettingsInvoicing = lazy(() => import('./components/settings/SettingsInvoicing'));
const JournalsConfig = lazy(() => import('./pages/invoicing/JournalsConfig'));
const TaxesConfig = lazy(() => import('./pages/invoicing/TaxesConfig'));
const TdsConfig = lazy(() => import('./pages/invoicing/TdsConfig'));
const PaymentTermsConfig = lazy(() => import('./pages/invoicing/PaymentTermsConfig'));
const ExpenseCategoriesConfig = lazy(() => import('./pages/invoicing/ExpenseCategoriesConfig'));
const InvoicingSettingsPage = lazy(() => import('./components/settings/SettingsInvoicing'));

// Lazy-loaded: Incentive app pages
const IncentiveMyEarnings = lazy(() => import('./pages/incentive/MyEarnings'));
const IncentiveMyEarningsV2 = lazy(() => import('./pages/incentive/MyEarningsV2'));
const IncentiveDashboard = lazy(() => import('./pages/incentive/IncentiveDashboard'));
const IncentiveDashboardV2 = lazy(() => import('./pages/incentive/IncentiveDashboardV2'));
const IncentiveRecordsList = lazy(() => import('./pages/incentive/RecordsList'));
const IncentiveRecordsListV2 = lazy(() => import('./pages/incentive/RecordsListV2'));
const IncentiveRecordForm = lazy(() => import('./pages/incentive/RecordForm'));
const IncentiveRecordFormV2 = lazy(() => import('./pages/incentive/RecordFormV2'));
const IncentiveRecordDetail = lazy(() => import('./pages/incentive/RecordDetail'));
const IncentiveRecordDetailV2 = lazy(() => import('./pages/incentive/RecordDetailV2'));
const IncentiveRatesTable = lazy(() => import('./pages/incentive/RatesTable'));
const IncentiveRatesTableV2 = lazy(() => import('./pages/incentive/RatesTableV2'));
// IncentiveSettings was moved into the global Settings hub at
// /org/:slug/settings/incentive — see components/settings/SettingsIncentive.
const SettingsIncentive = lazy(() => import('./components/settings/SettingsIncentive'));
const SettingsIncentiveV2 = lazy(() => import('./components/settings/SettingsIncentiveV2'));

// Lazy-loaded: Super Admin
import SuperAdminRoute from './components/SuperAdminRoute';
import { PageSwitch } from './components/platform/v2/PageSwitch';
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'));
const AdminWorkspacesPage = lazy(() => import('./pages/admin/AdminWorkspacesPage'));
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
const AdminKbReviewPage = lazy(() => import('./pages/admin/AdminKbReviewPage'));
// /admin/* lives outside OrgProvider, so PageSwitch (which calls useOrg, and
// useOrg THROWS with no provider) cannot gate this route. The v2 page ships
// directly; the legacy file is kept unreferenced so this is a one-line revert.
const AdminPayrollSettingsPage = lazy(() => import('./pages/admin/AdminPayrollSettingsPageV2'));
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

// Redesign rollout switch: the per-org uiV2 flag picks the shell. Both
// shells stay in the tree for the whole migration — rollback is a flag
// flip, not a redeploy. The flag rides on the org payload (and its
// cache), so returning users get their shell on first paint; a flag
// change propagates on the next verified org fetch (one reload).
function ShellSwitch() {
  const { currentOrg } = useOrg();
  return currentOrg?.uiV2 === true ? <PlatformLayoutV2 /> : <PlatformLayout />;
}

// Per-route variant of the same switch: migrated pages ship a v2 component
// alongside the legacy one and the org flag picks which renders.

// Wrapper that provides org context for /org/:slug/* routes
function OrgPlatformLayout() {
  return (
    <OrgProvider>
      <CompanyProvider>
        <PolicyAckProvider>
          <ShellSwitch />
          {/* 2026-05-28: floating AI assistant — gates itself to /ats/ routes
              and ats-app access internally. */}
          <ChatbotWidget />
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
              <Route path="/org/:slug/my-profile" element={<PageSwitch v2={MyProfilePageV2} legacy={MyProfilePage} />} />
              {/* Company Policies (ESS) — any authenticated member with a linked
                  employee record; intentionally NOT behind an app/country gate. */}
              <Route path="/org/:slug/my-policies" element={<ErrorBoundary><PageSwitch v2={MyPoliciesV2} legacy={MyPolicies} /></ErrorBoundary>} />
              {/* My Documents (ESS) — HR-shared documents; same gating as policies. */}
              <Route path="/org/:slug/my-documents" element={<ErrorBoundary><PageSwitch v2={MyDocumentsV2} legacy={MyDocuments} /></ErrorBoundary>} />

              {/* Employee onboarding wizard — outside AppAccessGate (any authenticated employee can access) */}
              <Route path="/org/:slug/employee/onboarding" element={<ErrorBoundary><PageSwitch v2={EmployeeOnboardingWizardV2} legacy={EmployeeOnboardingWizard} /></ErrorBoundary>} />
              <Route path="/org/:slug/upgrade" element={<UpgradePage />} />

              {/* Outreach app routes — gated by outreach access */}
              <Route element={<AppAccessGate appId="outreach" />}>
                <Route path="/org/:slug/outreach/dashboard" element={<ErrorBoundary><PageSwitch v2={DashboardPageV2} legacy={DashboardPage} /></ErrorBoundary>} />
                <Route path="/org/:slug/outreach/engage" element={<ErrorBoundary><PageSwitch v2={EngagePageV2} legacy={EngagePage} /></ErrorBoundary>} />
                <Route path="/org/:slug/outreach/engage/new-sequence" element={<SequenceWizardPage />} />
                <Route path="/org/:slug/outreach/engage/edit-sequence/:sequenceId" element={<SequenceWizardPage />} />
                <Route path="/org/:slug/outreach/leads" element={<PageSwitch v2={LeadsPageV2} legacy={LeadsPage} />} />
                <Route path="/org/:slug/outreach/leads/:leadId" element={<PageSwitch v2={LeadsPageV2} legacy={LeadsPage} />} />
                <Route path="/org/:slug/outreach/lists" element={<PageSwitch v2={MyListsPageV2} legacy={MyListsPage} />} />
                <Route path="/org/:slug/outreach/lists/:leadId" element={<PageSwitch v2={MyListsPageV2} legacy={MyListsPage} />} />
                <Route path="/org/:slug/outreach/settings" element={<OrgOutreachSettingsRedirect />} />
                <Route path="/org/:slug/outreach/team-dashboard" element={<ErrorBoundary><PageSwitch v2={TeamDashboardPageV2} legacy={TeamDashboardPage} /></ErrorBoundary>} />
                <Route path="/org/:slug/outreach/team-contacts" element={<PageSwitch v2={TeamContactsPageV2} legacy={TeamContactsPage} />} />
                <Route path="/org/:slug/outreach/team-contacts/:leadId" element={<PageSwitch v2={TeamContactsPageV2} legacy={TeamContactsPage} />} />
                <Route path="/org/:slug/outreach/team-lists" element={<PageSwitch v2={TeamListsPageV2} legacy={TeamListsPage} />} />
                <Route path="/org/:slug/outreach/team-lists/:leadId" element={<PageSwitch v2={TeamListsPageV2} legacy={TeamListsPage} />} />
              </Route>

              {/* Platform settings — profile is accessible to all, rest gated by admin */}
              <Route path="/org/:slug/settings" element={<OrgSettingsRedirect />} />
              <Route path="/org/:slug/settings/profile" element={<SettingsProfileRedirect />} />
              <Route element={<OrgAdminGate />}>
                <Route path="/org/:slug/settings/general" element={<SettingsPageWrapper><PageSwitch v2={SettingsGeneralV2} legacy={SettingsGeneral} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/users/:userId" element={<SettingsPageWrapper><PageSwitch v2={UserDetailV2} legacy={UserDetail} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/users" element={<SettingsPageWrapper><PageSwitch v2={SettingsTeamV2} legacy={SettingsTeam} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/outreach" element={<SettingsPageWrapper><PageSwitch v2={SettingsOutreachV2} legacy={SettingsOutreach} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/timesheet" element={<SettingsPageWrapper><PageSwitch v2={SettingsTimesheetV2} legacy={SettingsTimesheet} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/payroll" element={<SettingsPageWrapper><PageSwitch v2={SettingsPayrollV2} legacy={SettingsPayroll} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/employee" element={<SettingsPageWrapper><PageSwitch v2={SettingsEmployeeV2} legacy={SettingsEmployee} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/policies" element={<SettingsPageWrapper><PageSwitch v2={SettingsPoliciesV2} legacy={SettingsPolicies} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/email-logs" element={<SettingsPageWrapper><PageSwitch v2={SettingsEmailLogsV2} legacy={SettingsEmailLogs} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/crm" element={<SettingsPageWrapper><PageSwitch v2={SettingsCrmV2} legacy={SettingsCrm} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/ats" element={<SettingsPageWrapper><PageSwitch v2={SettingsAtsV2} legacy={SettingsAts} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/sign" element={<SettingsPageWrapper><PageSwitch v2={SettingsSignV2} legacy={SettingsSign} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/contacts" element={<SettingsPageWrapper><PageSwitch v2={SettingsContactsV2} legacy={SettingsContacts} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/companies" element={<SettingsPageWrapper><PageSwitch v2={SettingsCompaniesV2} legacy={SettingsCompanies} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/companies/new" element={<SettingsPageWrapper><PageSwitch v2={SettingsCompaniesV2} legacy={SettingsCompanies} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/companies/:companyId" element={<SettingsPageWrapper><PageSwitch v2={SettingsCompaniesV2} legacy={SettingsCompanies} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/todo" element={<SettingsPageWrapper><PageSwitch v2={SettingsTodoV2} legacy={SettingsTodo} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/invoicing" element={<SettingsPageWrapper><PageSwitch v2={SettingsInvoicingV2} legacy={SettingsInvoicing} /></SettingsPageWrapper>} />
                <Route path="/org/:slug/settings/incentive" element={<SettingsPageWrapper><PageSwitch v2={SettingsIncentiveV2} legacy={SettingsIncentive} /></SettingsPageWrapper>} />
              </Route>

              {/* Timesheet (ESS) app routes — gated by timesheet access + country (IN-only for now) + company match */}
              <Route element={<AppAccessGate appId="timesheet" />}>
                <Route element={<CountryGate allowed={['IN']} appName="Employee Self Service" />}>
                <Route element={<ESSCompanyGate />}>
                  <Route path="/org/:slug/timesheet/dashboard" element={<ErrorBoundary><PageSwitch v2={TimesheetDashboardV2} legacy={TimesheetDashboard} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-timesheet" element={<ErrorBoundary><PageSwitch v2={TimesheetEntryV2} legacy={TimesheetEntry} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-attendance" element={<ErrorBoundary><PageSwitch v2={MyAttendancePageV2} legacy={MyAttendancePage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/earnings" element={<ErrorBoundary><PageSwitch v2={TimesheetEarningsV2} legacy={TimesheetEarnings} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/approvals" element={<ErrorBoundary><PageSwitch v2={TimesheetApprovalsV2} legacy={TimesheetApprovals} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/attendance/approvals" element={<ErrorBoundary><PageSwitch v2={AttendanceApprovalsV2} legacy={AttendanceApprovals} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/users" element={<ErrorBoundary><PageSwitch v2={TimesheetUsersV2} legacy={TimesheetUsers} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/projects" element={<ErrorBoundary><PageSwitch v2={TimesheetProjectsV2} legacy={TimesheetProjects} /></ErrorBoundary>} />
                  {/* Leave Management */}
                  <Route path="/org/:slug/timesheet/leave/apply" element={<ErrorBoundary><PageSwitch v2={LeaveApplyV2} legacy={LeaveApply} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/my-requests" element={<ErrorBoundary><PageSwitch v2={LeaveMyRequestsV2} legacy={LeaveMyRequests} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/approvals" element={<ErrorBoundary><PageSwitch v2={LeaveApprovalsV2} legacy={LeaveApprovals} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/balances" element={<ErrorBoundary><PageSwitch v2={LeaveBalancesV2} legacy={LeaveBalances} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/balances/:employeeId" element={<ErrorBoundary><PageSwitch v2={LeaveHistoryV2} legacy={LeaveHistory} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/leave/reports" element={<ErrorBoundary><PageSwitch v2={LeaveReportsV2} legacy={LeaveReports} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/holidays" element={<ErrorBoundary><PageSwitch v2={HolidayCalendarV2} legacy={HolidayCalendar} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-assets" element={<ErrorBoundary><PageSwitch v2={MyAssetsV2} legacy={MyAssets} /></ErrorBoundary>} />
                  {/* Employee-facing statutory payroll pages */}
                  <Route path="/org/:slug/timesheet/my-salary" element={<ErrorBoundary><PageSwitch v2={MySalaryPageV2} legacy={MySalaryPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-payslips" element={<ErrorBoundary><PageSwitch v2={MyPayslipsPageV2} legacy={MyPayslipsPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/my-fnf" element={<ErrorBoundary><PageSwitch v2={MyFnfReceiptV2} legacy={MyFnfReceipt} /></ErrorBoundary>} />
                  <Route path="/org/:slug/settings/alumni-policy" element={<ErrorBoundary><PageSwitch v2={AlumniPolicyPageV2} legacy={AlumniPolicyPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/alumni" element={<ErrorBoundary><PageSwitch v2={AlumniDirectoryV2} legacy={AlumniDirectoryPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/tax/declarations" element={<ErrorBoundary><PageSwitch v2={MyTaxDeclarationsPageV2} legacy={MyTaxDeclarationsPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/timesheet/tax/report" element={<ErrorBoundary><PageSwitch v2={MyTaxReportPageV2} legacy={MyTaxReportPage} /></ErrorBoundary>} />
                </Route>
                </Route>
              </Route>

              {/* Payroll app routes — gated by payroll app admin role + country (IN-only for now) */}
              <Route element={<AppRoleGate appId="payroll" requiredRole="admin" />}>
                <Route element={<CountryGate allowed={['IN']} appName="Payroll" />}>
                  <Route path="/org/:slug/payroll/process" element={<PayrollProcessRedirect />} />
                  <Route path="/org/:slug/payroll/pay-overview" element={<ErrorBoundary><PageSwitch v2={PayrollDashboardPageV2} legacy={PayrollDashboardPage} /></ErrorBoundary>} />

                  <Route path="/org/:slug/payroll/salary-structures" element={<ErrorBoundary><PageSwitch v2={SalaryStructuresPageV2} legacy={SalaryStructuresPage} /></ErrorBoundary>} />

                  <Route path="/org/:slug/payroll/statutory-config" element={<ErrorBoundary><PageSwitch v2={StatutoryConfigPageV2} legacy={StatutoryConfigPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/pt-master" element={<ErrorBoundary><PageSwitch v2={PTMasterPageV2} legacy={PTMasterPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/statutory-run" element={<ErrorBoundary><PageSwitch v2={PayrollRunPageV2} legacy={PayrollRunPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/tax-declarations" element={<ErrorBoundary><PageSwitch v2={TaxDeclarationsPageV2} legacy={TaxDeclarationsPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/tax-reports" element={<ErrorBoundary><PageSwitch v2={TaxReportsPageV2} legacy={TaxReportsPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/settings" element={<ErrorBoundary><PageSwitch v2={PayrollSettingsPageV2} legacy={PayrollSettingsPage} /></ErrorBoundary>} />
                  <Route path="/org/:slug/payroll/fnf" element={<ErrorBoundary><PageSwitch v2={FnFDashboardV2} legacy={FnFDashboard} /></ErrorBoundary>} />
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
                <Route path="/org/:slug/employee/dashboard" element={<ErrorBoundary><PageSwitch v2={EmployeeDashboardV2} legacy={EmployeeDashboard} /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/directory" element={<ErrorBoundary><PageSwitch v2={EmployeeDirectoryV2} legacy={EmployeeDirectory} /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/org-chart" element={<ErrorBoundary><PageSwitch v2={OrgChartV2} legacy={OrgChart} /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/departments" element={<ErrorBoundary><PageSwitch v2={EmployeeDepartmentsV2} legacy={EmployeeDepartments} /></ErrorBoundary>} />
                {/* Add/Edit/Plan Templates require employee admin role */}
                <Route element={<AppRoleGate appId="employee" requiredRole="admin" />}>
                  {/* /employee/add now uses the Odoo-style quick-create flow:
                      minimal fields → POST → redirect to the inline-editable
                      EmployeeDetail page. EmployeeForm stays wired to
                      /employee/edit/:id until EmployeeDetail absorbs all
                      remaining edit affordances. */}
                  <Route path="/org/:slug/employee/add" element={<ErrorBoundary><PageSwitch v2={EmployeeQuickCreateV2} legacy={EmployeeQuickCreate} /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/edit/:employeeId" element={<ErrorBoundary><PageSwitch v2={EmployeeFormV2} legacy={EmployeeForm} /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/plan-templates" element={<ErrorBoundary><PageSwitch v2={PlanTemplatesV2} legacy={PlanTemplates} /></ErrorBoundary>} />
                  <Route path="/org/:slug/employee/assets/types" element={<ErrorBoundary><PageSwitch v2={AssetTypeConfigV2} legacy={AssetTypeConfig} /></ErrorBoundary>} />
                </Route>
                <Route path="/org/:slug/employee/assets" element={<ErrorBoundary><PageSwitch v2={AssetListV2} legacy={AssetList} /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/assets/:assetId" element={<ErrorBoundary><PageSwitch v2={AssetDetailV2} legacy={AssetDetail} /></ErrorBoundary>} />
                <Route path="/org/:slug/employee/:employeeId" element={<ErrorBoundary><PageSwitch v2={EmployeeDetailV2} legacy={EmployeeDetail} /></ErrorBoundary>} />
              </Route>

              {/* Contacts app routes — gated by contacts access */}
              <Route element={<AppAccessGate appId="contacts" />}>
                <Route path="/org/:slug/contacts/list" element={<ErrorBoundary><PageSwitch v2={ContactsListV2} legacy={ContactsList} /></ErrorBoundary>} />
                <Route path="/org/:slug/contacts/companies" element={<ErrorBoundary><PageSwitch v2={ContactsListV2} legacy={ContactsList} filterType="company" /></ErrorBoundary>} />
                <Route path="/org/:slug/contacts/individuals" element={<ErrorBoundary><PageSwitch v2={ContactsListV2} legacy={ContactsList} filterType="individual" /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="contacts" requiredRole="admin" />}>
                  <Route path="/org/:slug/contacts/config" element={<ErrorBoundary><PageSwitch v2={ContactsConfigV2} legacy={ContactsConfig} /></ErrorBoundary>} />
                </Route>
                <Route path="/org/:slug/contacts/new-record" element={<ErrorBoundary><ContactDetail /></ErrorBoundary>} />
                <Route path="/org/:slug/contacts/:contactId" element={<ErrorBoundary><PageSwitch v2={ContactDetailV2} legacy={ContactDetail} /></ErrorBoundary>} />
              </Route>

              {/* CRM app routes — gated by crm access */}
              <Route element={<AppAccessGate appId="crm" />}>
                <Route path="/org/:slug/crm" element={<CrmIndexRedirect />} />
                <Route path="/org/:slug/crm/dashboard" element={<ErrorBoundary><PageSwitch v2={CrmDashboardV2} legacy={CrmDashboard} /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/pipeline" element={<ErrorBoundary><PageSwitch v2={CrmPipelineV2} legacy={CrmPipeline} /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities" element={<ErrorBoundary><PageSwitch v2={CrmOpportunitiesV2} legacy={CrmOpportunities} /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities/new" element={<ErrorBoundary><PageSwitch v2={CrmOpportunityNewV2} legacy={CrmOpportunityNew} /></ErrorBoundary>} />
                <Route path="/org/:slug/crm/opportunities/:opportunityId" element={<ErrorBoundary><PageSwitch v2={CrmOpportunityDetailV2} legacy={CrmOpportunityDetail} /></ErrorBoundary>} />
                {/* 2026-05-14: Reporting merged into Dashboard — keep old path redirecting */}
                <Route path="/org/:slug/crm/reporting" element={<CrmReportingRedirect />} />
                <Route element={<AppRoleGate appId="crm" requiredRole="admin" />}>
                  <Route path="/org/:slug/crm/config" element={<CrmConfigRedirect />} />
                  <Route path="/org/:slug/crm/config/stages" element={<ErrorBoundary><PageSwitch v2={CrmConfigStagesV2} legacy={CrmConfigStages} /></ErrorBoundary>} />
                  <Route path="/org/:slug/crm/config/tags" element={<ErrorBoundary><PageSwitch v2={CrmConfigTagsV2} legacy={CrmConfigTags} /></ErrorBoundary>} />
                  <Route path="/org/:slug/crm/config/lost-reasons" element={<ErrorBoundary><PageSwitch v2={CrmConfigLostReasonsV2} legacy={CrmConfigLostReasons} /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* ATS app routes — gated by ats access */}
              <Route element={<AppAccessGate appId="ats" />}>
                <Route path="/org/:slug/ats" element={<AtsIndexRedirect />} />
                <Route path="/org/:slug/ats/pipeline" element={<ErrorBoundary><PageSwitch v2={AtsPipelineV2} legacy={AtsPipeline} /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/applications" element={<ErrorBoundary><PageSwitch v2={AtsApplicationsV2} legacy={AtsApplications} /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/applications/:applicationId" element={<ErrorBoundary><PageSwitch v2={AtsApplicationDetailV2} legacy={AtsApplicationDetail} /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs" element={<ErrorBoundary><PageSwitch v2={AtsJobPositionsV2} legacy={AtsJobPositions} /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs/new" element={<ErrorBoundary><AtsJobNew /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs/:jobId" element={<ErrorBoundary><PageSwitch v2={AtsJobDetailV2} legacy={AtsJobDetail} /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/jobs/:jobId/applications/new" element={<ErrorBoundary><PageSwitch v2={AtsApplicationNewV2} legacy={AtsApplicationNew} /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/candidates" element={<ErrorBoundary><PageSwitch v2={AtsCandidatesV2} legacy={AtsCandidates} /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/candidates/new" element={<ErrorBoundary><AtsCandidateNew /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/candidates/:candidateId" element={<ErrorBoundary><PageSwitch v2={AtsCandidateDetailV2} legacy={AtsCandidateDetail} /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/my-approvals" element={<ErrorBoundary><PageSwitch v2={AtsMyApprovalsV2} legacy={AtsMyApprovals} /></ErrorBoundary>} />
                {/* 2026-05-14: Dashboard is the ATS landing for everyone,
                    so it sits outside the admin gate. Old /ats/reporting
                    path still redirects in for bookmark continuity. */}
                <Route path="/org/:slug/ats/dashboard" element={<ErrorBoundary><PageSwitch v2={AtsDashboardV2} legacy={AtsDashboard} /></ErrorBoundary>} />
                <Route path="/org/:slug/ats/reporting" element={<AtsReportingRedirect />} />
                <Route element={<AppRoleGate appId="ats" requiredRole="admin" />}>
                  <Route path="/org/:slug/ats/config" element={<ErrorBoundary><PageSwitch v2={AtsConfigV2} legacy={AtsConfig} /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Sign app routes — gated by sign access */}
              <Route element={<AppAccessGate appId="sign" />}>
                <Route path="/org/:slug/sign/dashboard" element={<ErrorBoundary><PageSwitch v2={SignDashboardV2} legacy={SignDashboard} /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/requests" element={<ErrorBoundary><PageSwitch v2={SignRequestsV2} legacy={SignRequests} /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/requests/:requestId" element={<ErrorBoundary><PageSwitch v2={SignRequestDetailV2} legacy={SignRequestDetail} /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/templates" element={<ErrorBoundary><PageSwitch v2={SignTemplatesV2} legacy={SignTemplates} /></ErrorBoundary>} />
                <Route path="/org/:slug/sign/templates/:templateId/edit" element={<ErrorBoundary><PageSwitch v2={SignTemplateEditorV2} legacy={SignTemplateEditor} /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="sign" requiredRole="admin" />}>
                  <Route path="/org/:slug/sign/config" element={<ErrorBoundary><PageSwitch v2={SignConfigV2} legacy={SignConfig} /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Documents app — read for any member, manage pages admin-only */}
              <Route element={<AppAccessGate appId="documents" />}>
                <Route path="/org/:slug/documents" element={<ErrorBoundary><PageSwitch v2={DocumentsListV2} legacy={DocumentsList} /></ErrorBoundary>} />
                <Route path="/org/:slug/documents/:id" element={<ErrorBoundary><PageSwitch v2={DocumentDetailV2} legacy={DocumentDetail} /></ErrorBoundary>} />
                <Route element={<AppRoleGate appId="documents" requiredRole="admin" />}>
                  <Route path="/org/:slug/documents/manage/folders" element={<ErrorBoundary><PageSwitch v2={DocumentsManageFoldersV2} legacy={DocumentsManageFolders} /></ErrorBoundary>} />
                  <Route path="/org/:slug/documents/manage/tags" element={<ErrorBoundary><PageSwitch v2={DocumentsManageTagsV2} legacy={DocumentsManageTags} /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* To-Do app routes — gated by todo access */}
              <Route element={<AppAccessGate appId="todo" />}>
                <Route path="/org/:slug/todo/dashboard" element={<ErrorBoundary><PageSwitch v2={TodoDashboardV2} legacy={TodoDashboard} /></ErrorBoundary>} />
                <Route path="/org/:slug/todo/tasks" element={<ErrorBoundary><PageSwitch v2={TodoTasksV2} legacy={TodoTasks} /></ErrorBoundary>} />
                <Route path="/org/:slug/todo/team" element={<ErrorBoundary><PageSwitch v2={TodoTeamTasksV2} legacy={TodoTeamTasks} /></ErrorBoundary>} />
              </Route>

              {/* Invoicing app routes — admin only */}
              <Route element={<AppAccessGate appId="invoicing" />}>
                <Route element={<AppRoleGate appId="invoicing" requiredRole="admin" />}>
                  <Route path="/org/:slug/invoicing/dashboard" element={<ErrorBoundary><PageSwitch v2={InvoicingDashboardV2} legacy={InvoicingDashboard} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices" element={<ErrorBoundary><PageSwitch v2={InvoiceListV2} legacy={InvoiceList} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices/new" element={<ErrorBoundary><PageSwitch v2={InvoiceFormV2} legacy={InvoiceForm} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices/:invoiceId/edit" element={<ErrorBoundary><PageSwitch v2={InvoiceFormV2} legacy={InvoiceForm} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/invoices/:invoiceId" element={<ErrorBoundary><PageSwitch v2={InvoiceDetailV2} legacy={InvoiceDetail} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/bills" element={<ErrorBoundary><PageSwitch v2={VendorBillListV2} legacy={VendorBillList} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/employee-bills" element={<ErrorBoundary><PageSwitch v2={VendorBillListV2} legacy={VendorBillList} mode="employee" /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/bills/new" element={<ErrorBoundary><PageSwitch v2={VendorBillFormV2} legacy={VendorBillForm} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/bills/:billId/edit" element={<ErrorBoundary><PageSwitch v2={VendorBillFormV2} legacy={VendorBillForm} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/payments" element={<ErrorBoundary><PageSwitch v2={PaymentsListV2} legacy={PaymentsList} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/products" element={<ErrorBoundary><PageSwitch v2={ProductCatalogV2} legacy={ProductCatalog} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reconciliation" element={<ErrorBoundary><PageSwitch v2={BankReconciliationV2} legacy={BankReconciliation} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/follow-ups" element={<ErrorBoundary><PageSwitch v2={FollowUpsV2} legacy={FollowUps} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/receivables" element={<ErrorBoundary><PageSwitch v2={AgedReceivablesV2} legacy={AgedReceivables} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/payables" element={<ErrorBoundary><PageSwitch v2={AgedPayablesV2} legacy={AgedPayables} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/tax" element={<ErrorBoundary><PageSwitch v2={TaxReportInvV2} legacy={TaxReportInv} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/tds" element={<ErrorBoundary><PageSwitch v2={TdsReportInvV2} legacy={TdsReportInv} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/gst-2b" element={<ErrorBoundary><PageSwitch v2={GstReconciliationV2} legacy={GstReconciliation} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/analysis" element={<ErrorBoundary><PageSwitch v2={InvoiceAnalysisV2} legacy={InvoiceAnalysis} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/reports/profitability" element={<ErrorBoundary><PageSwitch v2={ProfitabilityV2} legacy={Profitability} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/products" element={<ErrorBoundary><PageSwitch v2={ProductCatalogV2} legacy={ProductCatalog} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/taxes" element={<ErrorBoundary><PageSwitch v2={TaxesConfigV2} legacy={TaxesConfig} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/tds" element={<ErrorBoundary><PageSwitch v2={TdsConfigV2} legacy={TdsConfig} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/payment-terms" element={<ErrorBoundary><PageSwitch v2={PaymentTermsConfigV2} legacy={PaymentTermsConfig} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/expense-categories" element={<ErrorBoundary><PageSwitch v2={ExpenseCategoriesConfigV2} legacy={ExpenseCategoriesConfig} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/journals" element={<ErrorBoundary><PageSwitch v2={JournalsConfigV2} legacy={JournalsConfig} /></ErrorBoundary>} />
                  <Route path="/org/:slug/invoicing/config/settings" element={<ErrorBoundary><PageSwitch v2={SettingsInvoicingV2} legacy={InvoicingSettingsPage} /></ErrorBoundary>} />
                </Route>
              </Route>

              {/* Incentive app routes — member for own earnings, admin for everything else */}
              <Route element={<AppAccessGate appId="incentive" />}>
                {/* Member-accessible */}
                <Route path="/org/:slug/incentive/my-earnings" element={<ErrorBoundary><PageSwitch v2={IncentiveMyEarningsV2} legacy={IncentiveMyEarnings} /></ErrorBoundary>} />
                <Route path="/org/:slug/incentive/records/:recordId" element={<ErrorBoundary><PageSwitch v2={IncentiveRecordDetailV2} legacy={IncentiveRecordDetail} /></ErrorBoundary>} />
                {/* Admin-only */}
                <Route element={<AppRoleGate appId="incentive" requiredRole="admin" />}>
                  <Route path="/org/:slug/incentive/dashboard" element={<ErrorBoundary><PageSwitch v2={IncentiveDashboardV2} legacy={IncentiveDashboard} /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/records" element={<ErrorBoundary><PageSwitch v2={IncentiveRecordsListV2} legacy={IncentiveRecordsList} /></ErrorBoundary>} />
                  {/* /records/new removed — drafts are auto-created from paid invoices only.
                      /records/:recordId/edit kept so admins can tweak existing drafts before approval. */}
                  <Route path="/org/:slug/incentive/records/:recordId/edit" element={<ErrorBoundary><PageSwitch v2={IncentiveRecordFormV2} legacy={IncentiveRecordForm} /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/rates" element={<ErrorBoundary><PageSwitch v2={IncentiveRatesTableV2} legacy={IncentiveRatesTable} /></ErrorBoundary>} />
                  <Route path="/org/:slug/incentive/settings" element={<IncentiveSettingsRedirect />} />
                </Route>
              </Route>

              {/* Expenses app routes — default-enabled for all org members */}
              <Route element={<AppAccessGate appId="expenses" />}>
                <Route path="/org/:slug/expenses" element={<ErrorBoundary><PageSwitch v2={ExpenseListV2} legacy={ExpenseList} /></ErrorBoundary>} />
                <Route path="/org/:slug/expenses/new" element={<ErrorBoundary><PageSwitch v2={ExpenseDetailV2} legacy={ExpenseDetail} /></ErrorBoundary>} />
                <Route path="/org/:slug/expenses/team" element={<ErrorBoundary><PageSwitch v2={ExpenseListV2} legacy={ExpenseList} /></ErrorBoundary>} />
                <Route path="/org/:slug/expenses/all" element={<ErrorBoundary><PageSwitch v2={ExpenseListV2} legacy={ExpenseList} /></ErrorBoundary>} />
                <Route path="/org/:slug/expenses/:id" element={<ErrorBoundary><PageSwitch v2={ExpenseDetailV2} legacy={ExpenseDetail} /></ErrorBoundary>} />
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
