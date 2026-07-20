import { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, Loader2, RefreshCw, Check, X, ChevronDown, ChevronRight,
  Clock, FileWarning, Inbox,
} from 'lucide-react';
import knowledgeBaseApi from '../../utils/knowledgeBaseApi';
import { getAppById } from '../../config/apps';

const appName = (id) => (id === 'general' ? 'General' : (getAppById(id)?.name || id));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

// Lightweight line diff: mark lines added (in proposed, not in current) and
// removed (in current, not in proposed). Set-based, so it's an at-a-glance aid,
// not a true positional diff — the full bodies are shown side by side too.
function lineFlags(current, proposed) {
  const curSet = new Set((current || '').split('\n'));
  const propSet = new Set((proposed || '').split('\n'));
  const added = (proposed || '').split('\n').map((l) => ({ l, isNew: l.trim() && !curSet.has(l) }));
  const removed = (current || '').split('\n').filter((l) => l.trim() && !propSet.has(l));
  return { added, removed };
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    dark: 'text-dark-300 bg-dark-800/40 border-dark-800',
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dark-800 bg-dark-900 px-4 py-3">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${tones[tone] || tones.dark}`}>
        <Icon size={17} />
      </div>
      <div>
        <div className="text-xl font-bold text-dark-100 leading-tight">{value}</div>
        <div className="text-xs text-dark-500">{label}</div>
      </div>
    </div>
  );
}

function DraftCard({ draft, onApprove, onReject, busy }) {
  const [open, setOpen] = useState(false);
  const { added, removed } = lineFlags(draft.current?.body, draft.proposed?.body);
  const isNew = !draft.current?.exists;

  return (
    <div className="rounded-xl border border-dark-800 bg-dark-900">
      <div className="flex items-start justify-between gap-3 p-4">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-start gap-2 text-left flex-1 min-w-0">
          {open ? <ChevronDown size={16} className="mt-1 text-dark-500 shrink-0" /> : <ChevronRight size={16} className="mt-1 text-dark-500 shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-dark-100">{draft.proposed?.title || draft.slug}</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-dark-500">{appName(draft.appId)}</span>
              {isNew
                ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">New article</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">Update</span>}
            </div>
            <div className="text-xs text-dark-500 mt-0.5 truncate">
              {draft.slug} · proposed {fmtDate(draft.createdAt)}{draft.note ? ` · ${draft.note}` : ''}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onReject(draft)}
            disabled={busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-red-400 border border-dark-800 hover:border-red-500/30 disabled:opacity-50"
          >
            <X size={13} /> Reject
          </button>
          <button
            type="button"
            onClick={() => onApprove(draft)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-dark-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve & publish
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-dark-800 p-4">
          {removed.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-red-400/80 mb-1">Removed lines ({removed.length})</p>
              <pre className="text-[11px] font-mono text-red-300/80 bg-red-500/5 border border-red-500/10 rounded-lg p-2 max-h-40 overflow-auto whitespace-pre-wrap">{removed.join('\n')}</pre>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-dark-500 mb-1">Current (live)</p>
              <pre className="text-[11px] font-mono text-dark-400 bg-dark-950 border border-dark-800 rounded-lg p-2 max-h-80 overflow-auto whitespace-pre-wrap">{draft.current?.body || (isNew ? '(no current article — this is new)' : '(empty)')}</pre>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-dark-500 mb-1">Proposed</p>
              <pre className="text-[11px] font-mono bg-dark-950 border border-dark-800 rounded-lg p-2 max-h-80 overflow-auto whitespace-pre-wrap">{added.map((x, i) => (
                <span key={i} className={x.isNew ? 'text-emerald-300 bg-emerald-500/5' : 'text-dark-300'}>{x.l}{'\n'}</span>
              ))}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminKbReviewPage() {
  const [data, setData] = useState({ reviewDue: [], reviewDueCount: 0, pendingDrafts: 0, totalPlatform: 0 });
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [review, dr] = await Promise.all([
        knowledgeBaseApi.adminReview(),
        knowledgeBaseApi.adminDrafts(),
      ]);
      setData({
        reviewDue: review.reviewDue || [],
        reviewDueCount: review.reviewDueCount || 0,
        pendingDrafts: review.pendingDrafts || 0,
        totalPlatform: review.totalPlatform || 0,
      });
      setDrafts(dr.drafts || []);
    } catch (e) {
      setError(e?.message || 'Failed to load the review queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (draft) => {
    if (!window.confirm(`Publish "${draft.proposed?.title || draft.slug}" to the live platform docs?`)) return;
    setBusyId(draft.id);
    try {
      await knowledgeBaseApi.adminApproveDraft(draft.id);
      await load();
    } catch (e) {
      alert(e?.message || 'Failed to approve.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (draft) => {
    const note = window.prompt('Reject this draft? Optional reason:', '');
    if (note === null) return; // cancelled
    setBusyId(draft.id);
    try {
      await knowledgeBaseApi.adminRejectDraft(draft.id, note);
      await load();
    } catch (e) {
      alert(e?.message || 'Failed to reject.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <BookOpen size={20} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark-100">Knowledge Base — Review Queue</h1>
            <p className="text-sm text-dark-400">Approve regenerated platform docs and see which canonical articles are due for review.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-dark-300 border border-dark-800 hover:border-amber-500/30 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard icon={Inbox} label="Pending drafts" value={data.pendingDrafts} tone="amber" />
        <StatCard icon={FileWarning} label="Articles due for review" value={data.reviewDueCount} tone="sky" />
        <StatCard icon={BookOpen} label="Platform articles" value={data.totalPlatform} tone="dark" />
      </div>

      {/* Pending drafts */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-dark-200 mb-3">Pending drafts</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-dark-500 py-8"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dark-800 py-10 text-center text-sm text-dark-500">
            No drafts waiting for review. Regenerated docs land here (via <code className="text-dark-400">scripts/kb-enqueue-draft.js</code>) before going live.
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} onApprove={approve} onReject={reject} busy={busyId === d.id} />
            ))}
          </div>
        )}
      </section>

      {/* Review-due */}
      <section>
        <h2 className="text-sm font-semibold text-dark-200 mb-3">Due for review</h2>
        {loading ? null : data.reviewDue.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dark-800 py-8 text-center text-sm text-dark-500">
            Nothing flagged. The nightly sweep flags platform docs older than the review interval.
          </div>
        ) : (
          <div className="rounded-xl border border-dark-800 overflow-hidden">
            {data.reviewDue.map((a, i) => (
              <div key={a.slug} className={`flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-dark-800' : ''}`}>
                <div className="min-w-0">
                  <div className="text-sm text-dark-200 truncate">{a.title}</div>
                  <div className="text-xs text-dark-500">{appName(a.appId)} · {a.slug}</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-dark-500 shrink-0">
                  <Clock size={12} /> reviewed {fmtDate(a.lastReviewedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
