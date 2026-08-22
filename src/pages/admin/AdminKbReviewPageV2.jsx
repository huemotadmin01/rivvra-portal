// ============================================================================
// AdminKbReviewPageV2.jsx — knowledge-base review queue, on ds
// ============================================================================
//
// Route: /admin/kb-review, inside <SuperAdminRoute><AdminLayout />.
//
// Approving a draft PUBLISHES it to the live platform docs every tenant reads.
// So both write paths are spliced verbatim, and both keep their native
// dialogs:
//
//   • `approve` — `window.confirm("Publish … to the live platform docs?")`.
//     Same reasoning as AdminWorkspaceDetailPage: a native confirm blocks the
//     event loop and cannot be click-through dismissed.
//   • `reject` — `window.prompt(…)`, and this one has NO ds equivalent at all.
//     The null-vs-empty-string distinction is load-bearing: `null` means the
//     admin cancelled and `if (note === null) return;` bails, whereas `''`
//     means "reject, no reason given" and proceeds. A ds dialog returning a
//     plain string would collapse those two into one.
//
// `lineFlags` is spliced too. It is a SET-based diff, not a positional one —
// deliberately, per legacy's own comment: an at-a-glance aid, with both full
// bodies still shown side by side. Its quirk is worth knowing: a line that
// merely MOVED counts as unchanged, and a duplicated line collapses. That is
// why it is an aid and not the review itself.
//
// Not triggered: approve (publish), reject.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, Loader2, RefreshCw, Check, X, ChevronDown, ChevronRight,
  Clock, FileWarning, Inbox,
} from 'lucide-react';
import knowledgeBaseApi from '../../utils/knowledgeBaseApi';
import { getAppById } from '../../config/apps';
import {
  Panel, Button, Chip, Callout, Stat, EmptyState,
} from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const eyebrow = { font: "600 10px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)' };
const codeBlock = {
  font: "450 11px/1.55 ui-monospace, SFMono-Regular, monospace",
  background: 'var(--surface-1)', borderRadius: 'var(--r-2, 10px)',
  boxShadow: 'inset 0 0 0 1px var(--line)', padding: 8,
  maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0,
};

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

function DraftCard({ draft, onApprove, onReject, busy }) {
  const [open, setOpen] = useState(false);
  const { added, removed } = lineFlags(draft.current?.body, draft.proposed?.body);
  const isNew = !draft.current?.exists;

  return (
    <Panel flush>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: 14 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left', flex: 1, minWidth: 0, background: 'none', border: 0, cursor: 'pointer', padding: 0, color: 'inherit' }}
          aria-expanded={open}
        >
          {open
            ? <ChevronDown size={16} style={{ marginTop: 3, color: 'var(--fg-4)', flexShrink: 0 }} />
            : <ChevronRight size={16} style={{ marginTop: 3, color: 'var(--fg-4)', flexShrink: 0 }} />}
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                {draft.proposed?.title || draft.slug}
              </span>
              <span style={eyebrow}>{appName(draft.appId)}</span>
              {isNew ? <Chip tone="brand">New article</Chip> : <Chip tone="warn">Update</Chip>}
            </span>
            <span style={{ ...microStyle, display: 'block', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {draft.slug} · proposed {fmtDate(draft.createdAt)}{draft.note ? ` · ${draft.note}` : ''}
            </span>
          </span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Button variant="secondary" size="sm" onClick={() => onReject(draft)} disabled={busy}
            style={{ color: 'var(--danger)' }} iconLeft={<X size={13} />}>
            Reject
          </Button>
          <Button size="sm" onClick={() => onApprove(draft)} disabled={busy}
            iconLeft={busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}>
            Approve &amp; publish
          </Button>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--line)', padding: 14 }}>
          {removed.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ ...eyebrow, color: 'var(--danger)', marginBottom: 4 }}>Removed lines ({removed.length})</p>
              <pre style={{ ...codeBlock, color: 'var(--danger-ink, var(--danger))', background: 'var(--danger-soft)', maxHeight: 160 }}>{removed.join('\n')}</pre>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <div>
              <p style={{ ...eyebrow, marginBottom: 4 }}>Current (live)</p>
              <pre style={{ ...codeBlock, color: 'var(--fg-3)' }}>{draft.current?.body || (isNew ? '(no current article — this is new)' : '(empty)')}</pre>
            </div>
            <div>
              <p style={{ ...eyebrow, marginBottom: 4 }}>Proposed</p>
              <pre style={codeBlock}>{added.map((x, i) => (
                <span key={i} style={x.isNew
                  ? { color: 'var(--brand-ink)', background: 'var(--brand-soft)' }
                  : { color: 'var(--fg-2)' }}>{x.l}{'\n'}</span>
              ))}</pre>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
function AdminKbReviewPageV2() {
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

  // `data-theme="dark"` is pinned: AdminLayout is a hard-dark legacy shell and
  // nothing on /admin/* writes the attribute.
  return (
    <div data-theme="dark" style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1024, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            width: 40, height: 40, borderRadius: 'var(--r-2, 12px)', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--warn-soft)', color: 'var(--warn-ink)',
          }}>
            <BookOpen size={20} />
          </span>
          <div>
            <h1 style={{ font: "700 21px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
              Knowledge Base — Review Queue
            </h1>
            <p style={{ ...microStyle, marginTop: 3, fontSize: 12.5 }}>
              Approve regenerated platform docs and see which canonical articles are due for review.
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}
          iconLeft={<RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />}>
          Refresh
        </Button>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Stat label="Pending drafts" value={data.pendingDrafts} icon={<Inbox size={16} />} color="var(--acc-amber)" />
        <Stat label="Articles due for review" value={data.reviewDueCount} icon={<FileWarning size={16} />} color="var(--acc-sky)" />
        <Stat label="Platform articles" value={data.totalPlatform} icon={<BookOpen size={16} />} />
      </div>

      {/* Pending drafts */}
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>Pending drafts</h2>
        {loading ? (
          <span style={{ ...microStyle, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '24px 0' }}>
            <Loader2 size={16} className="animate-spin" /> Loading…
          </span>
        ) : drafts.length === 0 ? (
          <Panel>
            <EmptyState icon={<Inbox size={24} />} title="No drafts waiting for review" compact>
              Regenerated docs land here (via <code>scripts/kb-enqueue-draft.js</code>) before going live.
            </EmptyState>
          </Panel>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} onApprove={approve} onReject={reject} busy={busyId === d.id} />
            ))}
          </div>
        )}
      </section>

      {/* Review-due */}
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>Due for review</h2>
        {loading ? null : data.reviewDue.length === 0 ? (
          <Panel>
            <EmptyState icon={<Clock size={24} />} title="Nothing flagged" compact>
              The nightly sweep flags platform docs older than the review interval.
            </EmptyState>
          </Panel>
        ) : (
          <Panel flush>
            {data.reviewDue.map((a, i) => (
              <div key={a.slug} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--line)' : 'none',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                  <div style={microStyle}>{appName(a.appId)} · {a.slug}</div>
                </div>
                <span style={{ ...microStyle, display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Clock size={12} /> reviewed {fmtDate(a.lastReviewedAt)}
                </span>
              </div>
            ))}
          </Panel>
        )}
      </section>
    </div>
  );
}

export default AdminKbReviewPageV2;
