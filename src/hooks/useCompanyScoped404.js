import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany, stripDetailIdFromPath } from '../context/CompanyContext';
import { useToast } from '../context/ToastContext';

/**
 * Graceful handling for a 404 on a company-scoped record detail page.
 *
 * A 404 there is almost never a real failure: it's either the active-company
 * switch racing the list redirect (the Outlet remounts the detail page keyed
 * on companyId a beat before CompanyContext.switchCompany's navigate lands),
 * or a cross-company deep link (bookmark / shared URL / stale tab). Both
 * used to splash a red "Failed to load …" toast over the list.
 *
 * Usage — first line of the fetch catch block:
 *   const handleScoped404 = useCompanyScoped404('invoice');
 *   ...
 *   } catch (err) {
 *     if (handleScoped404(err)) return;
 *     showToast('Failed to load invoice', 'error');
 *   }
 *
 * Returns true when the 404 was handled (redirected); the caller must stop.
 * Mid company-switch the redirect is silent; a deep link gets an amber
 * explanatory toast. Non-404 errors return false untouched.
 */
export default function useCompanyScoped404(entityLabel = 'record', fallbackListPath = null) {
  const navigate = useNavigate();
  const { switching } = useCompany();
  const { showToast } = useToast();
  // Read via ref so the returned callback's identity doesn't churn (and
  // refetch effects don't re-fire) every time a switch starts/ends.
  const switchingRef = useRef(switching);
  switchingRef.current = switching;

  return useCallback((err) => {
    if (err?.status !== 404) return false;
    if (!switchingRef.current) {
      showToast(`That ${entityLabel} belongs to a different company`, 'warning');
    }
    const listPath = stripDetailIdFromPath(window.location.pathname) || fallbackListPath;
    if (listPath) navigate(listPath, { replace: true });
    return true;
  }, [navigate, showToast, entityLabel, fallbackListPath]);
}
