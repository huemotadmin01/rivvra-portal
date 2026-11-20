// Super Admin navigation — one list for the sidebar, the breadcrumb and the
// page titles (2026-11-20). Icons are named here and resolved in AdminLayout.
export const ADMIN_NAV = [
  { label: 'Overview', path: '/admin', icon: 'LayoutDashboard' },
  { label: 'Platform Health', path: '/admin/health', icon: 'Activity' },
  { label: 'Workspaces', path: '/admin/workspaces', icon: 'Building2' },
  { label: 'Email Templates', path: '/admin/email-templates', icon: 'Mail' },
  { label: 'Announcements', path: '/admin/announcements', icon: 'Megaphone' },
  { label: 'Help Articles', path: '/admin/kb-review', icon: 'BookOpen' },
];

export const ADMIN_SETTINGS = [
  { label: 'Payroll rules', path: '/admin/settings/payroll', icon: 'Calculator' },
  { label: 'Employee rules', path: '/admin/settings/employee', icon: 'Users' },
];

/** Breadcrumb label for a path (longest matching nav entry wins). */
export function adminTitleFor(pathname) {
  const all = [...ADMIN_NAV, ...ADMIN_SETTINGS].filter((i) => i.path !== '/admin');
  const hit = all.filter((i) => pathname.startsWith(i.path)).sort((a, b) => b.path.length - a.path.length)[0];
  if (hit) return hit.label;
  return pathname === '/admin' ? 'Overview' : '';
}
