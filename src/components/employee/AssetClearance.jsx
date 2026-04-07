import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import assetApi from '../../utils/assetApi';
import {
  Loader2, Package, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw, X,
} from 'lucide-react';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AssetClearance({ employeeId, employeeStatus, isAdmin }) {
  const { orgSlug } = usePlatform();
  const [clearance, setClearance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [forceClearing, setForceClearing] = useState(false);
  const [showForceNotes, setShowForceNotes] = useState(false);
  const [forceNotes, setForceNotes] = useState('');

  const isSeparated = employeeStatus === 'resigned' || employeeStatus === 'terminated';

  useEffect(() => {
    load();
  }, [employeeId, orgSlug]);

  async function load() {
    try {
      const res = await assetApi.getClearance(orgSlug, employeeId);
      setClearance(res.data || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await assetApi.generateClearance(orgSlug, employeeId);
      setClearance(res.data || null);
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  }

  async function handleForceClear() {
    setForceClearing(true);
    try {
      await assetApi.updateClearance(orgSlug, employeeId, { forceCleared: true, notes: forceNotes || 'Admin override' });
      setShowForceNotes(false);
      setForceNotes('');
      await load();
    } catch (e) { console.error(e); }
    finally { setForceClearing(false); }
  }

  if (loading) return (
    <div className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4">
      <div className="flex items-center gap-2">
        <Package size={15} className="text-dark-500" />
        <span className="text-sm text-dark-500">Loading asset clearance...</span>
        <Loader2 size={14} className="animate-spin text-dark-600" />
      </div>
    </div>
  );

  // No assets at all
  if (!clearance || clearance.status === 'no_record') {
    if (clearance?.status === 'cleared' && clearance?.totalAssets === 0) {
      return (
        <div className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-dark-500">
            <Package size={15} />
            <span className="text-sm">No company assets on record</span>
          </div>
        </div>
      );
    }
    return (
      <div className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Package size={15} /> Asset Clearance</h3>
          {isAdmin && isSeparated && (
            <button onClick={handleGenerate} disabled={generating}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rivvra-500/10 border border-rivvra-500/30 text-rivvra-400 text-xs font-medium hover:bg-rivvra-500/20 transition-colors disabled:opacity-50">
              {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Generate Clearance
            </button>
          )}
        </div>
        <p className="text-xs text-dark-500">No clearance record yet.{isSeparated ? ' Click generate to check for pending assets.' : ''}</p>
      </div>
    );
  }

  const isCleared = clearance.status === 'cleared';
  const isPending = clearance.status === 'pending';
  const pendingItems = clearance.pendingAssets || [];

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${
      isCleared ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'
    }`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Package size={15} /> Asset Clearance
        </h3>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={handleGenerate} disabled={generating}
              className="p-1.5 rounded-lg hover:bg-dark-700/50 text-dark-400 hover:text-white transition-colors" title="Refresh clearance">
              {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          )}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isCleared ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
          }`}>
            {isCleared ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {isCleared ? 'Cleared' : `${pendingItems.length} Pending`}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{
            width: `${clearance.totalAssets ? (clearance.returnedAssets / clearance.totalAssets * 100) : 100}%`,
            backgroundColor: isCleared ? 'rgb(16 185 129)' : 'rgb(245 158 11)',
          }} />
        </div>
        <span className="text-xs text-dark-400 shrink-0">{clearance.returnedAssets}/{clearance.totalAssets} returned</span>
      </div>

      {/* Pending Items */}
      {pendingItems.length > 0 && (
        <div className="space-y-1.5">
          {pendingItems.map((item, i) => (
            <div key={i} className="flex items-center justify-between bg-dark-800/40 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm text-white">{item.assetName}</p>
                <p className="text-xs text-dark-500">{item.assetType}{item.modelName ? ` - ${item.modelName}` : ''}</p>
              </div>
              <span className="text-xs text-dark-500">Since {formatDate(item.assignedDate)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Force Clear */}
      {isPending && isAdmin && (
        <>
          {!showForceNotes ? (
            <button onClick={() => setShowForceNotes(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-dark-300 text-xs font-medium hover:bg-dark-600 transition-colors">
              <ShieldCheck size={12} /> Admin Override — Force Clear
            </button>
          ) : (
            <div className="space-y-2 pt-1">
              <textarea value={forceNotes} onChange={e => setForceNotes(e.target.value)}
                placeholder="Reason for override (e.g., asset written off, employee paid deduction)..."
                rows={2}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500 resize-none" />
              <div className="flex items-center gap-2">
                <button onClick={handleForceClear} disabled={forceClearing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50">
                  {forceClearing ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Confirm Override
                </button>
                <button onClick={() => { setShowForceNotes(false); setForceNotes(''); }}
                  className="px-2 py-1.5 text-xs text-dark-400 hover:text-white"><X size={12} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Force Cleared Note */}
      {clearance.forceClearedReason && (
        <p className="text-xs text-dark-500 flex items-center gap-1">
          <ShieldCheck size={11} /> Force cleared: {clearance.forceClearedReason}
          {clearance.clearedAt && <span className="ml-1">on {formatDate(clearance.clearedAt)}</span>}
        </p>
      )}
    </div>
  );
}
