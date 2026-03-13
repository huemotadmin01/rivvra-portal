import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { stripOrgPrefix } from '../config/apps';
import { useBreadcrumbContext } from '../context/BreadcrumbContext';

/**
 * Sets the breadcrumb label for the current page.
 * Call from any detail page after fetching entity data.
 *
 * Usage:
 *   usePageTitle(opportunity?.name);
 *   usePageTitle(job ? `${job.name}` : null);
 */
export function usePageTitle(label) {
  const location = useLocation();
  const { setDetailLabel, clearDetailLabel } = useBreadcrumbContext();

  useEffect(() => {
    if (!label) return;
    const path = stripOrgPrefix(location.pathname);
    setDetailLabel(path, label);
    return () => clearDetailLabel(path);
  }, [label, location.pathname, setDetailLabel, clearDetailLabel]);
}
