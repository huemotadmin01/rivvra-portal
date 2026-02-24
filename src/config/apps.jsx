import {
  Send, Users, List, Home, BarChart3, UsersRound, Layers,
  Clock, Briefcase, UserSearch, Mail, CalendarDays, IndianRupee,
  CheckCircle2, Download, Settings, Building2, UserPlus, Wallet
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
    roles: [
      { value: 'admin', label: 'Admin', color: 'rivvra' },
      { value: 'team_lead', label: 'Team Lead', color: 'amber' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user) => {
      const isAdmin = user?.role === 'admin' || user?.role === 'team_lead';
      return [
        { type: 'item', path: '/outreach/dashboard', label: 'Home', icon: Home },
        { type: 'item', path: '/outreach/engage', label: 'Engage', icon: Send },
        {
          type: 'group',
          label: 'Contacts',
          icon: Users,
          children: [
            { path: '/outreach/leads', label: 'My Contacts', icon: Users },
            ...(isAdmin ? [{ path: '/outreach/team-contacts', label: 'Team Contacts', icon: UsersRound }] : []),
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
        ...(isAdmin ? [{ type: 'item', path: '/outreach/team-dashboard', label: 'Team Dashboard', icon: BarChart3 }] : []),
      ];
    },
  },

  timesheet: {
    id: 'timesheet',
    name: 'Employee Self Service',
    description: 'Timesheets, earnings & payslips',
    icon: Clock,
    color: 'blue',
    basePath: '/timesheet',
    status: 'active',
    defaultRoute: '/timesheet/dashboard',
    roles: [
      { value: 'admin', label: 'Admin', color: 'purple' },
      { value: 'manager', label: 'Manager', color: 'blue' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      // Determine effective role from both org membership and ts_user role.
      // ts_users.role is the authoritative source ('admin', 'manager', 'contractor').
      // Org app role provides an override for org-based access.
      const tsRole = timesheetUser?.role || 'contractor';
      let effectiveRole;
      if (orgAppRole === 'admin' || tsRole === 'admin') {
        effectiveRole = 'admin';
      } else if (orgAppRole === 'manager' || tsRole === 'manager') {
        effectiveRole = 'manager';
      } else {
        effectiveRole = 'contractor';
      }

      const isAdmin = effectiveRole === 'admin';
      const isManager = effectiveRole === 'manager';
      const isMember = effectiveRole === 'member' || effectiveRole === 'contractor';

      return [
        { type: 'item', path: '/timesheet/dashboard', label: 'Dashboard', icon: Home },
        // Admin + Manager: approval page
        ...((isAdmin || isManager) ? [
          { type: 'item', path: '/timesheet/approvals', label: 'Approvals', icon: CheckCircle2 },
        ] : []),
        // Everyone gets their own timesheet and earnings (members, managers, admins)
        { type: 'item', path: '/timesheet/my-timesheet', label: 'My Timesheet', icon: CalendarDays },
        { type: 'item', path: '/timesheet/earnings', label: 'My Earnings', icon: IndianRupee },
        // Admin only
        ...(isAdmin ? [
          { type: 'item', path: '/timesheet/pay-config', label: 'Pay Config', icon: Wallet },
          { type: 'item', path: '/timesheet/export', label: 'Export Data', icon: Download },
        ] : []),
      ];
    },
  },

  employee: {
    id: 'employee',
    name: 'Employee',
    description: 'Employee directory & HR management',
    icon: UsersRound,
    color: 'orange',
    basePath: '/employee',
    status: 'active',
    defaultRoute: '/employee/directory',
    roles: [
      { value: 'admin', label: 'Admin', color: 'orange' },
      { value: 'member', label: 'Member', color: 'dark' },
    ],
    getSidebarItems: (user, timesheetUser, orgAppRole) => {
      const isAdmin = orgAppRole === 'admin';
      return [
        { type: 'item', path: '/employee/directory', label: 'Directory', icon: Users },
        { type: 'item', path: '/employee/departments', label: 'Departments', icon: Building2 },
        ...(isAdmin ? [
          { type: 'item', path: '/employee/add', label: 'Add Employee', icon: UserPlus },
        ] : []),
      ];
    },
  },

  crm: {
    id: 'crm',
    name: 'CRM',
    description: 'Manage deals & pipeline',
    icon: Briefcase,
    color: 'purple',
    basePath: '/crm',
    status: 'coming_soon',
    defaultRoute: '/crm/dashboard',
    getSidebarItems: () => [],
  },

  ats: {
    id: 'ats',
    name: 'ATS',
    description: 'Applicant tracking & hiring',
    icon: UserSearch,
    color: 'orange',
    basePath: '/ats',
    status: 'coming_soon',
    defaultRoute: '/ats/dashboard',
    getSidebarItems: () => [],
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
    getSidebarItems: (user) => {
      const isAdmin = user?.role === 'admin' || user?.role === 'team_lead';
      return [
        { type: 'item', path: '/settings/general', label: 'General Settings', icon: Settings },
        ...(isAdmin ? [{ type: 'item', path: '/settings/users', label: 'Users & Teams', icon: Users }] : []),
        { type: 'item', path: '/settings/outreach', label: 'Outreach', icon: Mail },
        { type: 'item', path: '/settings/timesheet', label: 'ESS', icon: Clock },
        { type: 'item', path: '/settings/employee', label: 'Employee', icon: UsersRound },
      ];
    },
  },
};

export function getAppById(id) {
  return APP_REGISTRY[id] || null;
}

export function getAllApps(user) {
  return Object.values(APP_REGISTRY).filter(app =>
    !app.adminOnly || (user?.role === 'admin' || user?.role === 'team_lead')
  );
}

export function getActiveApps(user) {
  return Object.values(APP_REGISTRY).filter(app =>
    app.status === 'active' && (!app.adminOnly || (user?.role === 'admin' || user?.role === 'team_lead'))
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
