import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import assetApi from '../../utils/assetApi';
import { Loader2, Package, Monitor, Headphones, Briefcase, Box, Calendar } from 'lucide-react';

const TYPE_ICONS = {
  laptop: Monitor,
  headphone: Headphones,
  headphones: Headphones,
  bag: Briefcase,
  charger: Box,
};

function getTypeIcon(name) {
  const key = (name || '').toLowerCase();
  for (const [k, Icon] of Object.entries(TYPE_ICONS)) {
    if (key.includes(k)) return Icon;
  }
  return Box;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyAssets() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setAssets([]);
      try {
        const res = await assetApi.myAssets(orgSlug);
        setAssets(res.data || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [orgSlug, currentCompany?._id]);

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-[300px]">
      <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-white">My Assets</h1>
        <p className="text-sm text-dark-400 mt-0.5">Company assets assigned to you</p>
      </div>

      {assets.length === 0 ? (
        <div className="text-center py-16 text-dark-500">
          <Package size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No assets assigned to you</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assets.map(asset => {
            const TypeIcon = getTypeIcon(asset.assetTypeName);
            return (
              <div key={asset._id} className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-dark-700/60 flex items-center justify-center shrink-0">
                  <TypeIcon size={22} className="text-dark-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{asset.name}</p>
                  <p className="text-xs text-dark-500">{asset.assetTypeName}{asset.modelName ? ` - ${asset.modelName}` : ''}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-dark-400">
                    <Calendar size={11} />
                    <span>Assigned {formatDate(asset.assignedDate)}</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                  In Use
                </span>
              </div>
            );
          })}
        </div>
      )}

      {assets.length > 0 && (
        <p className="text-xs text-dark-600 text-center">
          Please return all assets before your last working day. Contact HR for any queries.
        </p>
      )}
    </div>
  );
}
