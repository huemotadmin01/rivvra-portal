import { useState, useEffect, useCallback } from 'react';
import { Radar, ExternalLink, X, Check, Loader2, Sparkles } from 'lucide-react';
import api from '../../utils/api';

/* ── Hiring Signals (2026-08-20, growth-plan A1) ──────────────────────────
 * Fresh job postings harvested daily from watchlisted companies' public
 * job boards, AI-scored against what the org actually staffs. A signal =
 * a company that is hiring RIGHT NOW for roles we can fill — the hottest
 * lead there is. Suggested contacts come from the org's own leads DB
 * (matched by email domain), so every row answers "who do I email?". */
export default function HiringSignalsCard({ orgSlug }) {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState([]);
  const [watchCount, setWatchCount] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const [sigResp, wlResp] = await Promise.all([
        api.request(`/api/org/${orgSlug}/signals?status=new&limit=25`),
        api.request(`/api/org/${orgSlug}/signals/watchlist`),
      ]);
      setSignals((sigResp.signals || []).filter((s) => !s.ai || s.ai.relevant !== false));
      // Count only entries with a discovered feed — the rest are on the
      // list but not actually watchable yet.
      setWatchCount((wlResp.watchlist || []).filter((w) => w.active !== false && w.provider).length);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load signals');
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    setSignals((prev) => prev.filter((s) => s._id !== id));
    try {
      await api.request(`/api/org/${orgSlug}/signals/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    } catch (_) { /* optimistic; next load reconciles */ }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      await api.request(`/api/org/${orgSlug}/signals/watchlist/seed`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message || 'Seeding failed');
    } finally {
      setSeeding(false);
    }
  };

  // Scan runs detached on the server (~minutes across ~200 sources) — the
  // request returns immediately; we show a note and refresh the list later.
  const [scanNote, setScanNote] = useState(null);
  const scan = async () => {
    setScanning(true);
    try {
      await api.request(`/api/org/${orgSlug}/signals/scan`, { method: 'POST' });
      setScanNote('Scan running in the background — new signals will appear here as sources are checked (takes a few minutes).');
      setTimeout(() => { load(); setScanNote(null); }, 120000);
    } catch (err) {
      setError(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  // Skeleton while loading — returning null made the card pop in late and
  // shift the page (the signals fetch is slow on the throttled DB tier).
  if (loading) {
    return (
      <div className="mb-8 rounded-2xl border border-dark-700 bg-dark-850 p-4 sm:p-6">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-rivvra-500/10 text-rivvra-400 shrink-0"><Radar size={18} /></div>
          <div>
            <h3 className="text-base font-semibold text-white">Hiring Signals</h3>
            <p className="text-xs text-dark-400 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Loading signals…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-2xl border border-dark-700 bg-dark-850 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-rivvra-500/10 text-rivvra-400 shrink-0"><Radar size={18} /></div>
          <div>
            <h3 className="text-base font-semibold text-white">Hiring Signals</h3>
            <p className="text-xs text-dark-400">
              {watchCount ? `Watching ${watchCount} target companies' job boards — new postings appear here, scored for fit` : 'Fresh job postings at target companies = companies hiring right now'}
            </p>
          </div>
        </div>
        {watchCount > 0 && (
          <button
            type="button"
            onClick={scan}
            disabled={scanning}
            className="text-xs text-dark-400 hover:text-dark-200 transition-colors flex items-center gap-1.5 shrink-0"
          >
            {scanning ? <Loader2 size={12} className="animate-spin" /> : null}
            {scanning ? 'Scanning…' : 'Scan now'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      {scanNote && <p className="text-xs text-rivvra-400 mb-3">{scanNote}</p>}

      {!watchCount ? (
        <div className="text-center py-6">
          <p className="text-sm text-dark-400 mb-3">
            Build your watchlist from companies you already know — ATS clients and contact domains — then Rivvra checks their public job boards daily.
          </p>
          <button
            type="button"
            onClick={seed}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {seeding ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {seeding ? 'Seeding…' : 'Seed watchlist from my data'}
          </button>
        </div>
      ) : signals.length === 0 ? (
        <p className="text-sm text-dark-500 text-center py-4">
          No new signals yet — boards are checked daily; fresh postings at watched companies will show up here.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {signals.slice(0, 8).map((s) => (
            <li key={s._id} className="flex items-start gap-3 p-3 rounded-xl bg-dark-800/60 border border-dark-700/60">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-white hover:text-rivvra-400 transition-colors inline-flex items-center gap-1">
                    {s.title} <ExternalLink size={11} className="opacity-50" />
                  </a>
                  {s.ai?.score != null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold">{s.ai.score} fit</span>
                  )}
                  {s.ai?.roleFamily && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-700 text-dark-300">{s.ai.roleFamily}</span>
                  )}
                </div>
                <p className="text-xs text-dark-400 mt-0.5">
                  <span className="text-dark-300 font-medium">{s.companyName}</span>
                  {s.location ? ` · ${s.location}` : ''}
                  {s.firstSeenAt ? ` · seen ${new Date(s.firstSeenAt).toLocaleDateString()}` : ''}
                </p>
                {(s.suggestedContacts || []).length > 0 && (
                  <p className="text-[11px] text-dark-500 mt-1 truncate">
                    Contacts: {s.suggestedContacts.map((c) => `${c.name || c.email}${c.designation ? ` (${c.designation})` : ''}`).join(', ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" title="Mark actioned" onClick={() => setStatus(s._id, 'actioned')} className="p-1.5 rounded-lg text-dark-500 hover:text-emerald-400 hover:bg-dark-700 transition-colors"><Check size={14} /></button>
                <button type="button" title="Dismiss" onClick={() => setStatus(s._id, 'dismissed')} className="p-1.5 rounded-lg text-dark-500 hover:text-red-400 hover:bg-dark-700 transition-colors"><X size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
