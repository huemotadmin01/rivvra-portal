import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useTimesheetContext } from '../context/TimesheetContext';
import { stripOrgPrefix, getAppByPath } from '../config/apps';
import { useBreadcrumbContext } from '../context/BreadcrumbContext';
import { parseFromContext } from '../utils/entityDescribe';

/**
 * Builds a breadcrumb trail from the current URL + app sidebar config.
 * List pages get breadcrumbs automatically. Detail pages use usePageTitle()
 * to set the last segment's label.
 */
export function useBreadcrumbs() {
  const location = useLocation();
  const { currentApp, orgPath } = usePlatform();
  const { user } = useAuth();
  const { getAppRole, isOrgAdmin } = useOrg();
  const { timesheetUser } = useTimesheetContext();
  const { getDetailLabel, getDetailPathOverride, getCachedEntity } = useBreadcrumbContext();

  return useMemo(() => {
    if (!currentApp) return [];

    const appPath = stripOrgPrefix(location.pathname);

    // Build sidebar lookup: flatten all items into { path -> label }
    const orgAppRole = currentApp?.adminOnly && isOrgAdmin
      ? 'admin'
      : (currentApp?.id ? getAppRole(currentApp.id) : null);
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

    // 2026-05-22: cross-entity "from" trail. When the URL carries
    // ?from=<type>:<id> AND useFromEntity has resolved + cached the
    // source's metadata, the root crumb (app name) AND the next
    // segments (list + source label) come from the SOURCE'S app,
    // not the current page's app. That way a click from ATS
    // Application → CRM Contact shows "ATS > Applications >
    // Devansh's app > Devansh Sachan (contact)" rather than mixing
    // CRM (current app) with ATS (source app).
    const search = new URLSearchParams(location.search);
    const parsed = parseFromContext(search.get('from'));
    const fromEntity = parsed ? getCachedEntity(parsed.type, parsed.id) : null;

    // Resolve the "root" app — source's app when from-context is
    // active, else the current page's app.
    let rootApp = currentApp;
    if (fromEntity?.appBasePath) {
      const sourceApp = getAppByPath(fromEntity.appBasePath);
      if (sourceApp) rootApp = sourceApp;
    }
    const rootRole = rootApp?.adminOnly && isOrgAdmin
      ? 'admin'
      : (rootApp?.id ? getAppRole(rootApp.id) : null);
    const rootDefault = typeof rootApp.defaultRoute === 'function'
      ? rootApp.defaultRoute(rootRole)
      : rootApp.defaultRoute;
    const breadcrumbs = [{
      label: rootApp.name,
      path: orgPath(rootDefault || rootApp.basePath),
    }];

    if (fromEntity) {
      // Source's natural list (e.g. "Applications") as the second crumb,
      // then the source itself as the third (clickable back to it).
      breadcrumbs.push({
        label: fromEntity.listLabel,
        path: orgPath(fromEntity.listPath),
      });
      breadcrumbs.push({
        label: fromEntity.label,
        path: orgPath(fromEntity.path),
      });
    }

    // Decompose path segments after the app basePath
    const remaining = appPath.slice(currentApp.basePath.length);
    const segments = remaining.split('/').filter(Boolean);

    let builtPath = currentApp.basePath;
    // When a from-entity trail is active, the second crumb is already
    // the source's listLabel — so the canonical list crumb for the
    // current page would be redundant. Skip it on first sidebar match.
    let skipNextSidebarMatch = !!fromEntity;

    for (let i = 0; i < segments.length; i++) {
      builtPath += '/' + segments[i];
      const isLast = i === segments.length - 1;

      // Dynamic labels win over sidebar map so detail pages can override
      // the parent crumb (e.g. vendor bills showing "Vendor Bills" instead
      // of the default "Customer Invoices" for /invoicing/invoices).
      const dynamicLabel = getDetailLabel(builtPath);
      const sidebarMatch = pathLabelMap[builtPath] || null;
      if (sidebarMatch && !dynamicLabel && skipNextSidebarMatch) {
        // Consume the skip flag; from-entity trail replaces this crumb.
        skipNextSidebarMatch = false;
        continue;
      }
      const label = dynamicLabel || sidebarMatch || null;
      // Some detail pages share a URL with another list (vendor bills live
      // under /invoicing/invoices/:id); when set, the crumb links to the
      // real list instead of the default URL-derived path.
      const pathOverride = getDetailPathOverride(builtPath);

      const isObjectId = /^[a-f0-9]{24}$/.test(segments[i]);
      if (label) {
        breadcrumbs.push({
          label,
          path: isLast ? null : orgPath(pathOverride || builtPath),
        });
      } else if (!isObjectId) {
        // Segment with no registered label and not an ObjectId. Humanise
        // and render — links for the terminal crumb stay null; intermediate
        // segments render as plain text since their URL may not have a real
        // route (e.g. /ats/jobs/:jobId/applications is a virtual segment of
        // /ats/jobs/:jobId/applications/new and would 404 if linked).
        breadcrumbs.push({
          label: segments[i].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          path: null,
        });
      }
      // Intermediate ObjectId without a dynamic label is uninformative
      // ("a1b2..."), so we skip it entirely. Pages that want the parent
      // record name to appear here should call setDetailLabel with the
      // record name for that path (see usePageTitle).
    }

    return breadcrumbs;
  }, [location.pathname, currentApp, orgPath, user, timesheetUser, getAppRole, getDetailLabel, getDetailPathOverride]);
}
