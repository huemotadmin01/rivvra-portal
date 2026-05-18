import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { stripOrgPrefix } from '../config/apps';
import { useBreadcrumbContext } from '../context/BreadcrumbContext';

/**
 * Sets the breadcrumb label for the current page, and optionally for ancestor
 * paths so deep sub-pages can backfill their parent's record name (e.g. at
 * /ats/jobs/:jobId/applications/new, the job name belongs on the :jobId crumb).
 *
 * Usage:
 *   usePageTitle(opportunity?.name);
 *   usePageTitle('New Application', { [`/ats/jobs/${jobId}`]: job?.name });
 */
export function usePageTitle(label, ancestors) {
  const location = useLocation();
  const { setDetailLabel, clearDetailLabel } = useBreadcrumbContext();
  const ancestorsKey = ancestors
    ? Object.entries(ancestors).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('|')
    : '';

  useEffect(() => {
    const path = stripOrgPrefix(location.pathname);
    const registered = [];
    if (label) {
      setDetailLabel(path, label);
      registered.push(path);
    }
    if (ancestors) {
      for (const [ancestorPath, ancestorLabel] of Object.entries(ancestors)) {
        if (ancestorPath && ancestorLabel) {
          setDetailLabel(ancestorPath, ancestorLabel);
          registered.push(ancestorPath);
        }
      }
    }
    return () => {
      for (const p of registered) clearDetailLabel(p);
    };
  }, [label, ancestorsKey, location.pathname, setDetailLabel, clearDetailLabel]); // eslint-disable-line react-hooks/exhaustive-deps
}
