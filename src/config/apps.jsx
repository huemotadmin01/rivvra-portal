import {
  Send, Users, List, Home, BarChart3, UsersRound, Layers,
  Clock, Briefcase, UserSearch, Mail, CalendarDays, IndianRupee,
  CheckCircle2, Download, Settings, Building2, UserPlus, Wallet,
  Contact, Kanban, FileText, GripVertical, PenTool, FileSignature, Inbox,
  Tag, AlertTriangle, Banknote, CheckSquare, MapPin,
  CalendarOff, PlusCircle, ClipboardCheck, Calendar, LayoutDashboard, CalendarCheck,
  Shield, User, Network, Package, Calculator, BookOpen, Receipt, CreditCard, Landmark,
} from 'lucide-react';

export const APP_REGISTRY = {
  outreach: {
    id: 'outreach',
    name: 'Outreach',
    description: 'Sales outreach & email sequences',
    icon: Mail,
    color: 'rivvra',
    basePath: '/outreach',
    status: 'active',
    defaultRoute: '/outreach/dashboard',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'rivvra' },
      { value: 'team_lead', label: 'Team Lead', color: 'amber' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      // Admin derived from org role; team_lead from orgAppRole (org_memberships) OR legacy user.role (portal_users)
      const isAdmin = orgAppRole === 'admin';
      const isTeamLead = orgAppRole === 'team_lead' || user?.role === 'team_lead';
      const isAdminOrLead = isAdmin || isTeamLead;
      return [
        { type: 'item', path: '/outreach/dashboard', label: 'Home', icon: Home },
        { type: 'item', path: '/outreach/engage', label: 'Engage', icon: Send },
        {
          type: 'group',
          label: 'Contacts',
          icon: Users,
          children: [
            { path: '/outreach/leads', label: 'My Contacts', icon: Users },
            ...(isAdminOrLead ? [{ path: '/outreach/team-contacts', label: 'Team Contacts', icon: UsersRound }] : []),
          ],
        },
        {
          type: 'group',
          label: 'Lists',
          icon: Layers,
          children: [
            { path: '/outreach/lists', label: 'My Lists', icon: List },
            { path: '/outreach/team-lists', label: 'Team Lists', icon: Layers },
          ],
        },
        ...(isAdminOrLead ? [
          { type: 'item', path: '/outreach/team-dashboard', label: 'Team Dashboard', icon: BarChart3 },
        ] : []),
        ...(isAdmin ? [
          {
            type: 'group', label: 'Configuration', icon: Settings,
            children: [
              { path: '/settings/outreach', label: 'Settings', icon: Settings },
            ],
          },
        ] : []),
      ];
    },
  },

  timesheet: {
    id: 'timesheet',
    name: 'Employee Self Service',
    description: 'Attendance, earnings & payslips',
    icon: Clock,
    color: 'blue',
    basePath: '/timesheet',
    status: 'active',
    defaultRoute: '/timesheet/dashboard',
    derivedRoles: true, // Roles derived from orgRole + manager status — no per-app assignment
    roles: [
      { value: 'admin', label: 'Admin', color: 'purple' },
      { value: 'manager', label: 'Manager', color: 'blue' },
      { value: 'member', label: 'Employee', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      const tsRole = timesheetUser?.role || 'contractor';
      const isAdmin = tsRole === 'admin';
      // Manager status is derived from the employee system (not from static role field)
      const isManager = timesheetUser?.isManager === true;

      // Alumni (post-separation read-only): restricted sidebar regardless of phase A or B.
      // `resigned` is the legacy flag still set by un-migrated data paths — treat it the same.
      if (timesheetUser?.alumni || timesheetUser?.resigned) {
        const isConsultant = timesheetUser?.timesheetMode === 'timesheet';
        return [
          { type: 'item', path: '/timesheet/dashboard', label: 'Dashboard', icon: Home },
          { type: 'item', path: '/my-profile', label: 'My Profile', icon: User },
          // Show correct module based on their mode (read-only)
          ...(isConsultant
            ? [{ type: 'item', path: '/timesheet/my-timesheet', label: 'My Timesheet', icon: CalendarDays }]
            : [{ type: 'item', path: '/timesheet/my-attendance', label: 'My Attendance', icon: CalendarCheck }]
          ),
          // Show correct earnings/payroll based on mode
          ...(isConsultant
            ? [{ type: 'item', path: '/timesheet/earnings', label: 'My Earnings', icon: IndianRupee }]
            : [{
                type: 'group', label: 'Payroll', icon: IndianRupee,
                children: [
                  { path: '/timesheet/my-salary', label: 'My Salary', icon: IndianRupee },
                  { path: '/timesheet/my-payslips', label: 'My Payslips', icon: FileText },
                ],
              }]
          ),
          // Tax report for confirmed employees
          ...(timesheetUser?.employmentType === 'confirmed' ? [{
            type: 'group', label: 'Tax', icon: Shield,
            children: [
              { path: '/timesheet/tax/report', label: 'Tax Report', icon: BarChart3 },
            ],
          }] : []),
          // F&F Receipt — read-only view of the alumnus's finalized settlement
          { type: 'item', path: '/timesheet/my-fnf', label: 'F&F Receipt', icon: FileText },
        ];
      }

      // Determine if employee is eligible for leave management
      const empType = timesheetUser?.employmentType;
      const isBillable = timesheetUser?.billable;
      const isLeaveEligible = empType && empType !== 'external_consultant'
        && !(empType === 'internal_consultant' && isBillable);

      return [
        { type: 'item', path: '/timesheet/dashboard', label: 'Dashboard', icon: Home },
        { type: 'item', path: '/my-profile', label: 'My Profile', icon: Users },
        // Admin + Manager: approval pages
        ...((isAdmin || isManager) ? [
          { type: 'item', path: '/timesheet/approvals', label: 'Timesheet Approvals', icon: CheckCircle2 },
          { type: 'item', path: '/timesheet/attendance/approvals', label: 'Attendance Approvals', icon: CalendarCheck },
          { type: 'item', path: '/timesheet/leave/approvals', label: 'Leave Approvals', icon: ClipboardCheck },
        ] : []),
        // Admin only: leave balances
        ...(isAdmin ? [
          { type: 'item', path: '/timesheet/leave/balances', label: 'Leave Balances', icon: CalendarDays },
        ] : []),
        // Attendance vs Timesheet — driven by org-level timesheetMode config
        ...(timesheetUser?.timesheetMode === 'timesheet'
          ? [{ type: 'item', path: '/timesheet/my-timesheet', label: 'My Timesheet', icon: CalendarDays }]
          : [{ type: 'item', path: '/timesheet/my-attendance', label: 'My Attendance', icon: CalendarCheck }]
        ),
        // Leave management (for eligible employees)
        ...(isLeaveEligible ? [
          {
            type: 'group', label: 'Leaves', icon: CalendarOff,
            children: [
              { path: '/timesheet/leave/apply', label: 'Apply Leave', icon: PlusCircle },
              { path: '/timesheet/leave/my-requests', label: 'My Requests', icon: FileText },
            ],
          },
        ] : []),
        // Payroll: attendance-mode employees get My Salary + Payslips, timesheet-mode get My Earnings
        ...(timesheetUser?.timesheetMode === 'timesheet' ? [
          { type: 'item', path: '/timesheet/earnings', label: 'My Earnings', icon: IndianRupee },
        ] : [
          {
            type: 'group', label: 'Payroll', icon: IndianRupee,
            children: [
              { path: '/timesheet/my-salary', label: 'My Salary', icon: IndianRupee },
              { path: '/timesheet/my-payslips', label: 'My Payslips', icon: FileText },
            ],
          },
        ]),
        // Tax declarations only for confirmed employees
        ...(timesheetUser?.employmentType === 'confirmed' ? [
          {
            type: 'group', label: 'Tax', icon: Shield,
            children: [
              { path: '/timesheet/tax/declarations', label: 'Declarations', icon: FileText },
              { path: '/timesheet/tax/report', label: 'Tax Report', icon: BarChart3 },
            ],
          },
        ] : []),
        // Holiday Calendar: visible to all attendance-based employees (read-only for non-admins)
        ...(timesheetUser?.timesheetMode !== 'timesheet' ? [
          { type: 'item', path: '/timesheet/holidays', label: 'Holiday Calendar', icon: Calendar },
        ] : []),
        // My Assets: visible to all employees
        { type: 'item', path: '/timesheet/my-assets', label: 'My Assets', icon: Package },
        // Admin only: configuration
        ...(isAdmin ? [
          {
            type: 'group', label: 'Configuration', icon: Settings,
            children: [
              // Holiday Calendar also in config for admins (if timesheet mode, it's only here)
              ...(timesheetUser?.timesheetMode === 'timesheet' ? [
                { path: '/timesheet/holidays', label: 'Holiday Calendar', icon: Calendar },
              ] : []),
              { path: '/timesheet/leave/reports', label: 'Leave Reports', icon: BarChart3 },
              { path: '/settings/timesheet', label: 'Settings', icon: Settings },
            ],
          },
        ] : []),
      ];
    },
  },

  payroll: {
    id: 'payroll',
    name: 'Payroll',
    description: 'Payroll processing, pay overview & exports',
    icon: Banknote,
    color: 'amber',
    basePath: '/payroll',
    status: 'active',
    adminOnly: true,
    defaultRoute: '/payroll/pay-overview',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'amber' },
    ],
    getSidebarItems: () => [
      { type: 'item', path: '/payroll/pay-overview', label: 'Dashboard', icon: LayoutDashboard },
      { type: 'item', path: '/payroll/export', label: 'Export & Reports', icon: Download },
      { type: 'item', path: '/payroll/statutory-run', label: 'Run Payroll', icon: Banknote },
      { type: 'item', path: '/payroll/tax-declarations', label: 'Tax Declarations', icon: FileText },
      { type: 'item', path: '/payroll/tax-reports', label: 'Tax Reports', icon: BarChart3 },
      { type: 'item', path: '/payroll/fnf', label: 'Full & Final', icon: Calculator },
      {
        type: 'group', label: 'Configuration', icon: Settings,
        children: [
          { path: '/settings/payroll', label: 'Settings', icon: Settings },
        ],
      },
    ],
  },

  employee: {
    id: 'employee',
    name: 'Employee',
    description: 'Employee directory & HR management',
    icon: UsersRound,
    color: 'orange',
    basePath: '/employee',
    status: 'active',
    defaultRoute: '/employee/dashboard',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'orange' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      const isAdmin = orgAppRole === 'admin';
      return [
        ...(isAdmin ? [{ type: 'item', path: '/employee/dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
        { type: 'item', path: '/employee/directory', label: 'Directory', icon: Users },
        { type: 'item', path: '/employee/org-chart', label: 'Org Chart', icon: Network },
        { type: 'item', path: '/employee/departments', label: 'Departments', icon: Building2 },
        ...(isAdmin ? [
          { type: 'item', path: '/employee/add', label: 'Add Employee', icon: UserPlus },
          { type: 'item', path: '/employee/alumni', label: 'Alumni', icon: UserSearch },
          { type: 'item', path: '/employee/assets', label: 'Assets', icon: Package },
          { type: 'item', path: '/employee/plan-templates', label: 'Plan Templates', icon: FileText },
          {
            type: 'group', label: 'Configuration', icon: Settings,
            children: [
              { path: '/settings/employee', label: 'Settings', icon: Settings },
              { path: '/settings/alumni-policy', label: 'Alumni Policy', icon: Shield },
              { path: '/employee/assets/types', label: 'Asset Types', icon: Package },
            ],
          },
        ] : []),
      ];
    },
  },

  contacts: {
    id: 'contacts',
    name: 'Contacts',
    description: 'Company & individual contacts directory',
    icon: Contact,
    color: 'cyan',
    basePath: '/contacts',
    status: 'active',
    defaultRoute: '/contacts/list',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'cyan' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      const isAdmin = orgAppRole === 'admin';
      return [
        { type: 'item', path: '/contacts/list', label: 'All Contacts', icon: Contact },
        { type: 'item', path: '/contacts/companies', label: 'Companies', icon: Building2 },
        { type: 'item', path: '/contacts/individuals', label: 'Individuals', icon: Users },
        ...(isAdmin ? [
          {
            type: 'group', label: 'Configuration', icon: Settings,
            children: [
              { path: '/settings/contacts', label: 'Settings', icon: Settings },
              { path: '/contacts/config', label: 'Tags', icon: Tag },
            ],
          },
        ] : []),
      ];
    },
  },

  crm: {
    id: 'crm',
    name: 'CRM',
    description: 'Manage deals & pipeline',
    icon: Briefcase,
    color: 'emerald',
    basePath: '/crm',
    status: 'active',
    defaultRoute: '/crm/pipeline',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'emerald' },
      { value: 'team_lead', label: 'Team Lead', color: 'amber' },
      { value: 'salesperson', label: 'Salesperson', color: 'blue' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      const isAdmin = orgAppRole === 'admin';
      const isTeamLead = orgAppRole === 'team_lead' || user?.role === 'team_lead';
      const isAdminOrLead = isAdmin || isTeamLead;
      return [
        { type: 'item', path: '/crm/dashboard', label: 'Dashboard', icon: Home },
        { type: 'item', path: '/crm/pipeline', label: 'Pipeline', icon: Kanban },
        { type: 'item', path: '/crm/opportunities', label: 'Opportunities', icon: Briefcase },
        ...(isAdminOrLead ? [
          { type: 'item', path: '/crm/reporting', label: 'Reporting', icon: BarChart3 },
        ] : []),
        ...(isAdmin ? [
          {
            type: 'group', label: 'Configuration', icon: Settings,
            children: [
              { path: '/settings/crm', label: 'Settings', icon: Settings },
              { path: '/crm/config/stages', label: 'Stages', icon: Layers },
              { path: '/crm/config/tags', label: 'Tags', icon: Tag },
              { path: '/crm/config/lost-reasons', label: 'Lost Reasons', icon: AlertTriangle },
            ],
          },
        ] : []),
      ];
    },
  },

  ats: {
    id: 'ats',
    name: 'ATS',
    description: 'Applicant tracking & recruitment',
    icon: UserSearch,
    color: 'purple',
    basePath: '/ats',
    status: 'active',
    defaultRoute: '/ats/pipeline',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'purple' },
      { value: 'recruiter', label: 'Recruiter', color: 'blue' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      const isAdmin = orgAppRole === 'admin';
      return [
        { type: 'item', path: '/ats/pipeline', label: 'Pipeline', icon: Kanban },
        { type: 'item', path: '/ats/applications', label: 'Applications', icon: FileText },
        { type: 'item', path: '/ats/jobs', label: 'Job Positions', icon: Briefcase },
        { type: 'item', path: '/ats/candidates', label: 'Candidates', icon: Users },
        ...(isAdmin ? [
          { type: 'item', path: '/ats/reporting', label: 'Reporting', icon: BarChart3 },
          {
            type: 'group', label: 'Configuration', icon: Settings,
            children: [
              { path: '/settings/ats', label: 'Settings', icon: Settings },
              { path: '/ats/config', label: 'Picklists', icon: Layers },
            ],
          },
        ] : []),
      ];
    },
  },

  sign: {
    id: 'sign',
    name: 'Sign',
    description: 'Digital signatures & document signing',
    icon: PenTool,
    color: 'indigo',
    basePath: '/sign',
    status: 'active',
    defaultRoute: '/sign/dashboard',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'indigo' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      const isAdmin = orgAppRole === 'admin';
      return [
        { type: 'item', path: '/sign/dashboard', label: 'Dashboard', icon: Home },
        { type: 'item', path: '/sign/requests', label: 'Requests', icon: FileText },
        { type: 'item', path: '/sign/templates', label: 'Templates', icon: FileSignature },
        ...(isAdmin ? [
          {
            type: 'group', label: 'Configuration', icon: Settings,
            children: [
              { path: '/settings/sign', label: 'Settings', icon: Settings },
              { path: '/sign/config', label: 'Picklists', icon: Layers },
            ],
          },
        ] : []),
      ];
    },
  },

  todo: {
    id: 'todo',
    name: 'To-Do',
    description: 'Personal tasks & AI-powered email task extraction',
    icon: CheckSquare,
    color: 'teal',
    basePath: '/todo',
    status: 'active',
    defaultRoute: '/todo/dashboard',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'teal' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      const isAdmin = orgAppRole === 'admin';
      return [
        { type: 'item', path: '/todo/dashboard', label: 'Dashboard', icon: Home },
        { type: 'item', path: '/todo/tasks', label: 'All Tasks', icon: CheckSquare },
        ...(isAdmin ? [
          {
            type: 'group', label: 'Configuration', icon: Settings,
            children: [
              { path: '/settings/todo', label: 'Settings', icon: Settings },
            ],
          },
        ] : []),
      ];
    },
  },

  invoicing: {
    id: 'invoicing',
    name: 'Invoicing',
    description: 'Invoices, payments & billing',
    icon: Receipt,
    color: 'amber',
    basePath: '/invoicing',
    status: 'active',
    adminOnly: true,
    defaultRoute: '/invoicing/dashboard',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'amber' },
    ],
    getSidebarItems: () => [
      { type: 'item', path: '/invoicing/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { type: 'item', path: '/invoicing/invoices', label: 'Customer Invoices', icon: FileText },
      { type: 'item', path: '/invoicing/bills', label: 'Vendor Bills', icon: Wallet },
      { type: 'item', path: '/invoicing/payments', label: 'Payments', icon: CreditCard },
      {
        type: 'group', label: 'Reports', icon: BarChart3,
        children: [
          { path: '/invoicing/reports/receivables', label: 'Aged Receivables', icon: Clock },
          { path: '/invoicing/reports/payables', label: 'Aged Payables', icon: Clock },
          { path: '/invoicing/reports/tax', label: 'Tax Report', icon: Shield },
          { path: '/invoicing/reports/analysis', label: 'Invoice Analysis', icon: BarChart3 },
        ],
      },
      { type: 'item', path: '/invoicing/reconciliation', label: 'Bank Reconciliation', icon: Landmark },
      { type: 'item', path: '/invoicing/follow-ups', label: 'Follow-ups', icon: Mail },
      {
        type: 'group', label: 'Configuration', icon: Settings,
        children: [
          { path: '/invoicing/config/products', label: 'Products', icon: Package },
          { path: '/invoicing/config/taxes', label: 'Taxes', icon: Shield },
          { path: '/invoicing/config/journals', label: 'Journals', icon: FileText },
          { path: '/invoicing/config/settings', label: 'Settings', icon: Settings },
        ],
      },
    ],
  },

  knowledgeBase: {
    id: 'knowledgeBase',
    name: 'Knowledge Base',
    description: 'Admin guides & workflow walkthroughs',
    icon: BookOpen,
    color: 'sky',
    basePath: '/knowledge-base',
    status: 'active',
    adminOnly: true,
    defaultRoute: '/knowledge-base',
    derivedRoles: true,
    roles: [
      { value: 'admin', label: 'Admin', color: 'sky' },
    ],
    getSidebarItems: () => [
      { type: 'item', path: '/knowledge-base', label: 'Browse Articles', icon: BookOpen },
    ],
  },

  settings: {
    id: 'settings',
    name: 'Settings',
    description: 'Platform & app configuration',
    icon: Settings,
    color: 'rivvra',
    basePath: '/settings',
    status: 'active',
    adminOnly: true,
    defaultRoute: '/settings/general',
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      // Settings admin items: only org-level admin role (no legacy user.role fallback)
      const isAdmin = orgAppRole === 'admin';
      return [
        { type: 'item', path: '/settings/general', label: 'General Settings', icon: Settings },
        ...(isAdmin ? [{ type: 'item', path: '/settings/companies', label: 'Companies', icon: Building2 }] : []),
        ...(isAdmin ? [{ type: 'item', path: '/settings/users', label: 'Users & Teams', icon: Users }] : []),
        ...(isAdmin ? [{ type: 'item', path: '/settings/email-logs', label: 'Email Logs', icon: Inbox }] : []),
        { type: 'item', path: '/settings/outreach', label: 'Outreach', icon: Mail },
        { type: 'item', path: '/settings/timesheet', label: 'ESS', icon: Clock },
        ...(isAdmin ? [{ type: 'item', path: '/settings/payroll', label: 'Payroll', icon: Wallet }] : []),
        { type: 'item', path: '/settings/employee', label: 'Employee', icon: UsersRound },
        { type: 'item', path: '/settings/contacts', label: 'Contacts', icon: Contact },
        { type: 'item', path: '/settings/crm', label: 'CRM', icon: Briefcase },
        { type: 'item', path: '/settings/ats', label: 'ATS', icon: UserSearch },
        { type: 'item', path: '/settings/sign', label: 'Sign', icon: PenTool },
        { type: 'item', path: '/settings/todo', label: 'To-Do', icon: CheckSquare },
        ...(isAdmin ? [{ type: 'item', path: '/settings/invoicing', label: 'Invoicing', icon: Receipt }] : []),
      ];
    },
  },
};

export function getAppById(id) {
  return APP_REGISTRY[id] || null;
}

export function getAllApps(user, orgMembership) {
  // When no user given (e.g. from PlatformContext), return all apps
  if (!user) return Object.values(APP_REGISTRY);
  const orgRole = orgMembership?.orgRole;
  // adminOnly apps visible if: org admin/owner OR user has explicit app access
  return Object.values(APP_REGISTRY).filter(app =>
    !app.adminOnly || orgRole === 'admin' || orgRole === 'owner'
    || orgMembership?.appAccess?.[app.id]?.enabled
  );
}

export function getActiveApps(user, orgMembership) {
  // When no user given, return all active apps
  if (!user) return Object.values(APP_REGISTRY).filter(app => app.status === 'active');
  const orgRole = orgMembership?.orgRole;
  // adminOnly apps visible if: org admin/owner OR user has explicit app access
  return Object.values(APP_REGISTRY).filter(app =>
    app.status === 'active' && (!app.adminOnly || orgRole === 'admin' || orgRole === 'owner'
    || orgMembership?.appAccess?.[app.id]?.enabled)
  );
}

/**
 * Extract the "app path" portion from a pathname.
 * Strips /org/:slug/ prefix if present.
 * Examples:
 *   "/outreach/dashboard" → "/outreach/dashboard"
 *   "/org/huemot-technology/outreach/dashboard" → "/outreach/dashboard"
 *   "/org/acme/settings/users" → "/settings/users"
 *   "/home" → "/home"
 */
export function stripOrgPrefix(pathname) {
  const orgMatch = pathname.match(/^\/org\/[^/]+(\/.*)$/);
  return orgMatch ? orgMatch[1] : pathname;
}

export function getAppByPath(pathname) {
  const appPath = stripOrgPrefix(pathname);
  return Object.values(APP_REGISTRY).find(app =>
    appPath.startsWith(app.basePath)
  ) || null;
}
