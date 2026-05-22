import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrg } from '../context/OrgContext';
import { useBreadcrumbContext } from '../context/BreadcrumbContext';
import { describeEntity, parseFromContext } from '../utils/entityDescribe';

/**
 * Reads `?from=<type>:<id>` from the URL, resolves it via the
 * /entity-describe endpoint, and caches the result on the
 * BreadcrumbContext so the breadcrumb trail can morph to include
 * the source. Returns { entity, loading } — entity is null when
 * `?from=` is absent or doesn't resolve.
 *
 * Mounting this anywhere on the page (e.g. inside the page's main
 * component) is enough — useBreadcrumbs() reads the cached entity
 * from context, so the breadcrumb above the page picks up the
 * trail automatically.
 */
export function useFromEntity() {
  const [searchParams] = useSearchParams();
  const { currentOrg } = useOrg();
  const { getCachedEntity, cacheEntity } = useBreadcrumbContext();
  const fromRaw = searchParams.get('from');
  const parsed = parseFromContext(fromRaw);
  const cached = parsed ? getCachedEntity(parsed.type, parsed.id) : null;
  const [loading, setLoading] = useState(!!parsed && !cached);

  useEffect(() => {
    if (!parsed || !currentOrg?.slug || cached) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    describeEntity(currentOrg.slug, parsed.type, parsed.id)
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res?.entity) {
          cacheEntity(parsed.type, parsed.id, res.entity);
        }
      })
      .catch(() => { /* swallow — breadcrumb just falls back to canonical */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [parsed?.type, parsed?.id, currentOrg?.slug, cached, cacheEntity, parsed]);

  return { entity: cached, loading };
}
