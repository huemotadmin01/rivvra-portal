import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Briefcase, AlertTriangle } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { usePageTitle } from '../../hooks/usePageTitle';
import atsApi from '../../utils/atsApi';
import { DataTable, EmptyState, Button, Chip } from '../../components/ds';
import { PageHeaderV2 } from '../../components/platform/v2/listkit';

function approvalChip(status) {
  const s = (status || '').toLowerCase();
  if (s === 'approved') return <Chip tone="brand">Approved</Chip>;
  if (s === 'rejected') return <Chip tone="danger">Rejected</Chip>;
  return <Chip tone="warn">Pending</Chip>;
}

function hoursSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const h = Math.floor(ms / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* v2 My Approvals (Slice 3 Wave A) — same data flow (incl. the showFull
   truncation cap and error/retry states) as AtsMyApprovals.jsx. */
export default function AtsMyApprovalsV2() {
  usePageTitle('My Approvals');
  const { currentOrg } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;

  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [decided, setDecided] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [decidedTotal, setDecidedTotal] = useState(0);
  const [showFull, setShowFull] = useState(false);
  const [error, setError] = useState(null);
  const [refetching, setRefetching] = useState(false);

  // Same ref-not-dep guard as legacy: hasLoaded in the deps re-fired the
  // triple fetch on every mount.
  const hasLoadedRef = useRef(false);
  const fetchLists = useCallback(async () => {
    if (!orgSlug) return;
    if (!hasLoadedRef.current) setLoading(true); else setRefetching(true);
    setError(null);
    try {
      const cap = showFull ? 500 : 100;
      const [pRes, aRes, rRes] = await Promise.all([
        atsApi.listJobs(orgSlug, { approverId: 'me', approvalStatus: 'pending', limit: cap }),
        atsApi.listJobs(orgSlug, { approverId: 'me', approvalStatus: 'approved', limit: cap, sort: 'updatedAt', dir: 'desc' }),
        atsApi.listJobs(orgSlug, { approverId: 'me', approvalStatus: 'rejected', limit: cap, sort: 'updatedAt', dir: 'desc' }),
      ]);
      setPending(pRes?.jobs || pRes?.data || []);
      setPendingTotal(pRes?.total ?? (pRes?.jobs || pRes?.data || []).length);
      const a = aRes?.jobs || aRes?.data || [];
      const r = rRes?.jobs || rRes?.data || [];
      const merged = [...a, ...r].sort((x, y) => new Date(y.updatedAt || 0) - new Date(x.updatedAt || 0));
      setDecided(merged);
      setDecidedTotal((aRes?.total ?? a.length) + (rRes?.total ?? r.length));
    } catch (err) {
      console.error('Failed to load My Approvals:', err);
      setError(err?.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
      setRefetching(false);
      hasLoadedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, showFull, currentCompany?._id]);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const rows = tab === 'pending' ? pending : decided;
  const total = tab === 'pending' ? pendingTotal : decidedTotal;

  const columns = [
    {
      key: 'name', header: 'Position', width: 280,
      render: (j) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--brand)', minWidth: 0 }}>
          <Briefcase size={13} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
        </span>
      ),
    },
    { key: 'department', header: 'Department', muted: true, width: 160 },
    { key: 'recruiterName', header: 'Recruiter', muted: true, width: 160 },
    { key: 'approvalStatus', header: 'Status', width: 110, render: (j) => approvalChip(j.approvalStatus) },
    {
      key: 'when', header: tab === 'pending' ? 'Waiting' : 'Decided', muted: true, width: 110,
      render: (j) => hoursSince(tab === 'pending' ? j.createdAt : j.updatedAt),
    },
  ];

  const tabBtn = (on) => ({
    padding: '8px 12px', font: '550 13px/1 var(--font)',
    color: on ? 'var(--fg)' : 'var(--fg-4)',
    borderBottom: on ? '2px solid var(--brand)' : '2px solid transparent',
    marginBottom: -1, transition: 'color var(--d-1) var(--e-out)',
  });

  return (
    <div>
      <PageHeaderV2
        title="My Approvals"
        sub="Job positions assigned to you for approval. Recruiters cannot add applications until you approve."
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
        {[
          { key: 'pending', label: 'Pending', count: pendingTotal },
          { key: 'decided', label: 'Decided', count: decidedTotal },
        ].map((t) => (
          <button key={t.key} type="button" style={tabBtn(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
            <span style={{ marginLeft: 6, font: '450 11.5px/1 var(--font)', color: 'var(--fg-4)' }}>({t.count})</span>
          </button>
        ))}
      </div>

      {error ? (
        <EmptyState
          icon={<AlertTriangle size={22} />}
          tone="warn"
          title="Couldn't load your approvals"
          actions={<Button variant="secondary" size="sm" onClick={() => fetchLists()}>Retry</Button>}
        >
          {error}
        </EmptyState>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey="_id"
            loading={loading}
            onRowClick={(j) => navigate(orgPath(`/ats/jobs/${j._id}`))}
            empty={(
              <EmptyState
                icon={tab === 'pending' ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
                title={tab === 'pending' ? 'Nothing waiting on you' : 'No decisions yet'}
              >
                {tab === 'pending'
                  ? 'When a recruiter assigns you as the approver on a job position, it will show up here.'
                  : 'Positions you approve or reject will appear here for your reference.'}
              </EmptyState>
            )}
          />
          {/* Truncation footer — same showFull semantics as legacy. */}
          {!loading && total > rows.length && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', font: '450 12px/1.4 var(--font)', color: 'var(--fg-4)' }}>
              <span>Showing first {rows.length} of {total}.</span>
              {showFull && !refetching ? (
                <span>Showing the maximum of {rows.length} rows</span>
              ) : (
                <Button variant="ghost" size="sm" disabled={showFull} onClick={() => setShowFull(true)}>
                  {showFull ? 'Loading…' : 'Show all'}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
