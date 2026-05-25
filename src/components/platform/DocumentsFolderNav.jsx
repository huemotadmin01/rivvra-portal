// ─────────────────────────────────────────────────────────────────────────────
// DocumentsFolderNav — render the per-company folder list inline inside the
// platform AppSidebar so the Documents app has a single left rail (no longer
// a page-level Folders column duplicating the platform sub-nav). 2026-05-25.
//
// Pure read — listFolders is idempotent, scoped to the active company, and
// re-fires whenever the company switcher changes (key derived from
// currentCompany._id). When collapsed=true we render nothing because there's
// no room for the per-folder text.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Folder, FolderOpen } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import documentsApi from '../../utils/documentsApi';

export default function DocumentsFolderNav({ collapsed = false }) {
  const { orgSlug } = useOrg();
  const { currentCompany } = useCompany();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [folders, setFolders] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!orgSlug || !currentCompany) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await documentsApi.listFolders(orgSlug);
        if (cancelled) return;
        if (r?.success) setFolders(r.data || []);
      } catch {
        // non-fatal — render no items, list still works via "All documents".
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [orgSlug, currentCompany?._id]);

  // Hide entirely on non-Documents routes — AppSidebar re-mounts on
  // currentApp change so this won't render outside Documents anyway,
  // but the guard keeps the export safe for future reuse.
  if (!location.pathname.includes('/documents')) return null;
  if (collapsed) return null;

  const activeFolder = searchParams.get('folder') || '';

  if (loaded && folders.length === 0) {
    return (
      <div className="pl-7 pr-3 py-1 text-[11px] text-dark-500">
        No folders yet
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {folders.map((f) => {
        const isActive = activeFolder === String(f._id);
        return (
          <Link
            key={f._id}
            to={`/org/${orgSlug}/documents?folder=${f._id}`}
            className={`flex items-center gap-2 pl-7 pr-3 py-1.5 rounded-md text-[13px] transition ${
              isActive
                ? 'bg-rivvra-500/10 text-rivvra-300'
                : 'text-dark-400 hover:bg-dark-800 hover:text-dark-100'
            }`}
            title={f.name}
          >
            {isActive ? <FolderOpen className="w-3.5 h-3.5 shrink-0" /> : <Folder className="w-3.5 h-3.5 shrink-0" />}
            <span className="truncate">{f.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
