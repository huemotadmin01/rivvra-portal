import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useTimesheetContext } from '../context/TimesheetContext';
import { stripOrgPrefix } from '../config/apps';
import { useBreadcrumbContext } from '../context/BreadcrumbContext';

/**
 * Builds a breadcrumb trail from the current URL + app sidebar config.
 * List pages get breadcrumbs automatically. Detail pages use usePageTitle()
 * to set the last segment's label.
 */
export function useBreadcrumbs() {
  const location = useLocation();
  const { currentApp, orgPath } = usePlatform();
  const { user } = useAuth();
  const { getAppRole } = useOrg();
  const { timesheetUser } = useTimesheetContext();
  const { getDetailLabel } = useBreadcrumbContext();

  return useMemo(() => {
    if (!currentApp) return [];

    const appPath = stripOrgPrefix(location.pathname);

    // Build sidebar lookup: flatten all items into { path -> label }
    const orgAppRole = currentApp?.id ? getAppRole(currentApp.id) : null;
    const sidebarItems = currentApp.getSidebarItems?.(user, timesheetUser, orgAppRole) || [];
    const pathLabelMap = {};
    const flattenItems = (items) => {
      for (const item of items) {
        if (item.type === 'group' && item.children) {
          flattenItems(item.children);
        } else if (item.path) {
          pathLabelMap[item.path] = item.label;
        }
      }
    };
    flattenItems(sidebarItems);

    // First crumb: app name linking to its default route
    const breadcrumbs = [{
      label: currentApp.name,
      path: orgPath(currentApp.defaultRoute || currentApp.basePath),
    }];

    // Decompose path segments after the app basePath
    const remaining = appPath.slice(currentApp.basePath.length);
    const segments = remaining.split('/').filter(Boolean);

    let builtPath = currentApp.basePath;

    for (let i = 0; i < segments.length; i++) {
      builtPath += '/' + segments[i];
      const isLast = i === segments.length - 1;

      // Check sidebar map
      if (pathLabelMap[builtPath]) {
        breadcrumbs.push({
          label: pathLabelMap[builtPath],
          path: isLast ? null : orgPath(builtPath),
        });
      } else {
        // Not in sidebar — likely a detail page (ID segment)
        const dynamicLabel = getDetailLabel(builtPath);

        if (dynamicLabel) {
          breadcrumbs.push({
            label: dynamicLabel,
            path: isLast ? null : orgPath(builtPath),
          });
        } else if (isLast) {
          // Final segment with no label yet
          const isObjectId = /^[a-f0-9]{24}$/.test(segments[i]);
          breadcrumbs.push({
            label: isObjectId
              ? '...'
              : segments[i].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            path: null,
          });
        }
        // Skip intermediate unknown segments
      }
    }

    return breadcrumbs;
  }, [location.pathname, currentApp, orgPath, user, timesheetUser, getAppRole, getDetailLabel]);
}
