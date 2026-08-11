import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import expensesApi from '../../utils/expensesApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { Plus, FileText, CheckCircle2, RefreshCw } from 'lucide-react';
import { cacheGet, cacheSet, cacheTTL } from './_listCache';
import { DataTable, FilterBar, EmptyState, Button, Chip, Stat } from '../../components/ds';
import { PageHeaderV2 } from '../../components/platform/v2/listkit';

// Same tab semantics as legacy — approve syncs in the same request, so
// approved+synced share a tab.
const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Pending' },
  { key: 'approved_synced', label: 'Approved & Synced', statuses: ['approved', 'synced'] },
  { key: 'reimbursed', label: 'Reimbursed' },
  { key: 'rejected', label: 'Rejected' },
];

function statusChip(status) {
  const map = {
    draft:      { tone: 'neutral', label: 'Draft' },
    submitted:  { tone: 'warn', label: 'Pending' },
    approved:   { tone: 'warn', label: 'Approved · Sync pending' },
    synced:     { tone: 'brand', label: 'Approved & Synced' },
    reimbursed: { tone: 'info', label: 'Reimbursed' },
    rejected:   { tone: 'danger', label: 'Rejected' },
    cancelled:  { tone: 'danger', label: 'Cancelled' },
  };
  const s = map[status] || map.draft;
  return <Chip tone={s.tone} dot>{s.label}</Chip>;
}

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/* v2 Expenses list (Slice 3 Wave A) — same data flow as ExpenseList.jsx
   (stale-while-revalidate cache, URL-derived scope, client-side status
   tabs), rendered on ds Stat/FilterBar/DataTable. */
export default function ExpenseListV2() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orgSlug, orgPath } = usePlatform();
  const { getAppRole, orgRole } = useOrg();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
  const expensesAppRole = getAppRole('expenses');
  const isManager = isOrgAdmin || expensesAppRole === 'admin' || expensesAppRole === 'team_lead';
  const companyCurrency = (currentCompany?.currency || 'INR').toUpperCase();

  const requestedScope = useMemo(() => {
    if (location.pathname.endsWith('/expenses/all')) return 'all';
    if (location.pathname.endsWith('/expenses/team')) return 'team';
    return 'mine';
  }, [location.pathname]);

  useEffect(() => {
    if (requestedScope === 'all' && !isOrgAdmin && expensesAppRole !== 'admin') {
      navigate(orgPath('/expenses'), { replace: true });
    } else if (requestedScope === 'team' && !isManager) {
      navigate(orgPath('/expenses'), { replace: true });
    }
  }, [requestedScope, isOrgAdmin, expensesAppRole, isManager, navigate, orgPath]);

  const scope = requestedScope;
  const [statusTab, setStatusTab] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const initKey = `${orgSlug}:${scope}:`;
  const initHit = cacheGet(initKey);
  const [rows, setRows] = useState(initHit?.expenses || []);
  const [summary, setSummary] = useState(initHit?.summary || null);
  const [loading, setLoading] = useState(!initHit);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef(null);

  // currentCompany deliberately NOT a dep — company switches hard-reload;
  // see the legacy page for the flash this used to cause.
  const load = useCallback(async (force = false) => {
    if (!orgSlug) return;
    const cacheKey = `${orgSlug}:${scope}:${searchDebounced}`;
    const hit = cacheGet(cacheKey);
    if (hit && !force) {
      setRows(hit.expenses);
      setSummary(hit.summary);
      setLoading(false);
      if (Date.now() - hit.ts < cacheTTL()) return;
    }
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setRefreshing(true);
      const params = { scope };
      if (searchDebounced) params.q = searchDebounced;
      const res = await expensesApi.getOverview(orgSlug, params);
      if (ctrl.signal.aborted) return;
      const freshExpenses = res?.expenses || [];
      const freshSummary = res?.summary || null;
      cacheSet(cacheKey, { expenses: freshExpenses, summary: freshSummary });
      setRows(freshExpenses);
      setSummary(freshSummary);
    } catch (err) {
      if (err.name === 'AbortError') return;
      showToast(err.message || 'Failed to load expenses', 'error');
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, scope, searchDebounced, showToast]);

  useEffect(() => {
    load();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [load]);

  const tabCounts = useMemo(() => {
    const c = { '': rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    for (const tab of STATUS_TABS) {
      if (tab.statuses) c[tab.key] = tab.statuses.reduce((s, st) => s + (c[st] || 0), 0);
    }
    return c;
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (!statusTab) return rows;
    const tab = STATUS_TABS.find((t) => t.key === statusTab);
    if (tab?.statuses) return rows.filter((r) => tab.statuses.includes(r.status));
    return rows.filter((r) => r.status === statusTab);
  }, [rows, statusTab]);

  const showEmployeeCol = scope !== 'mine';
  const showApproverCol = scope === 'all';

  const columns = [
    { key: 'status', header: 'Status', width: 170, render: (r) => statusChip(r.status) },
    {
      key: 'title', header: 'Claim', width: 260,
      render: (r) => {
        const lineCount = (r.lines || []).length;
        return (
          <span style={{ minWidth: 0, display: 'block' }}>
            <span style={{ display: 'block', color: 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.title || <span style={{ color: 'var(--fg-faint)', fontStyle: 'italic', fontWeight: 450 }}>Untitled</span>}
            </span>
            <span style={{ display: 'block', font: '450 11px/1.3 var(--font)', color: 'var(--fg-4)' }}>
              {lineCount} {lineCount === 1 ? 'line' : 'lines'}
            </span>
          </span>
        );
      },
    },
    ...(showEmployeeCol ? [{ key: 'submittedByName', header: 'Submitted By', muted: true, width: 160, render: (r) => <span title={r.submittedByEmail || ''}>{r.submittedByName || null}</span> }] : []),
    ...(showApproverCol ? [{ key: 'approverName', header: 'Approver', muted: true, width: 150 }] : []),
    { key: 'date', header: 'Date', muted: true, width: 120, render: (r) => formatDate(r.submittedAt || r.createdAt) },
    {
      key: 'totalAmount', header: 'Total', align: 'right', width: 130,
      render: (r) => <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{formatCurrency(r.totalAmount || 0, r.claimCurrency || 'INR')}</span>,
    },
    {
      key: 'bill', header: 'Bill', width: 130,
      render: (r) => r.billId ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: '500 11.5px/1 var(--font)', color: 'var(--brand)' }}>
          <CheckCircle2 size={12} /> {r.billNumber || 'Created'}
        </span>
      ) : null,
    },
  ];

  const tabBtn = (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
    borderRadius: 'var(--r-2)', font: '550 12px/1 var(--font)',
    background: on ? 'var(--surface-4)' : 'transparent',
    color: on ? 'var(--fg)' : 'var(--fg-4)',
    transition: 'background var(--d-1) var(--e-out), color var(--d-1) var(--e-out)',
  });

  const scopeTitle = scope === 'all' ? 'All Expenses' : scope === 'team' ? 'Team Expenses' : 'My Expenses';
  const scopeSub = scope === 'all'
    ? 'Every expense claim in this company'
    : scope === 'team' ? 'Claims submitted by your direct reports' : 'Your expense claims';

  return (
    <div>
      <PageHeaderV2
        title={scopeTitle}
        sub={`${scopeSub}${currentCompany ? ` · ${currentCompany.name}` : ''}`}
        actions={(
          <>
            <Button variant="secondary" size="sm" disabled={refreshing} onClick={() => load(true)} title="Refresh"
              iconLeft={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />}>
              Refresh
            </Button>
            <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => navigate(orgPath('/expenses/new'))}>New Expense</Button>
          </>
        )}
      />

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
          <Stat label="This Month" value={formatCurrency(summary.monthTotal || 0, companyCurrency)} note={`${summary.monthCount || 0} ${summary.monthCount === 1 ? 'claim' : 'claims'}`} />
          <Stat label="Pending" value={summary.pending || 0} note="Awaiting approval" />
          <Stat label="Approved / Synced" value={(summary.approved || 0) + (summary.synced || 0) + (summary.reimbursed || 0)} note={`${(summary.synced || 0) + (summary.reimbursed || 0)} synced to bills`} />
          <Stat label="Rejected" value={summary.rejected || 0} note="Returned to submitter" />
        </div>
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search title, description, or merchant…"
        resultCount={visibleRows.length}
        noun="claim"
        filters={[]}
        left={(
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 'var(--r-2)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', flexWrap: 'wrap' }}>
            {STATUS_TABS.map((t) => (
              <button key={t.key || 'all'} type="button" style={tabBtn(statusTab === t.key)} onClick={() => setStatusTab(t.key)}>
                {t.label}
                <span style={{ font: '600 10px/1 var(--font)', color: statusTab === t.key ? 'var(--fg-2)' : 'var(--fg-faint)', fontVariantNumeric: 'tabular-nums' }}>
                  {tabCounts[t.key] || 0}
                </span>
              </button>
            ))}
          </span>
        )}
        style={{ marginBottom: 14 }}
      />

      <DataTable
        columns={columns}
        rows={visibleRows}
        rowKey="_id"
        loading={loading}
        onRowClick={(r) => navigate(orgPath(`/expenses/${r._id}`))}
        empty={(
          <EmptyState
            icon={<FileText size={22} />}
            title={rows.length === 0 ? 'No expenses found' : `No ${STATUS_TABS.find((t) => t.key === statusTab)?.label.toLowerCase() || ''} claims`}
            actions={rows.length === 0 ? (
              <Button size="sm" iconLeft={<Plus size={13} />} onClick={() => navigate(orgPath('/expenses/new'))}>Submit your first claim</Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setStatusTab('')}>Show all</Button>
            )}
          />
        )}
      />
    </div>
  );
}
