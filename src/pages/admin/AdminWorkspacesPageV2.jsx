// ============================================================================
// AdminWorkspacesPageV2.jsx — super-admin workspace list, on ds
// ============================================================================
//
// Route: /admin/workspaces, inside <SuperAdminRoute><AdminLayout />.
//
// A read-only list — the destructive surface is the detail page behind each
// row. What has to survive is the query state: server-side pagination, sort
// and the debounced search, all of which feed `getSuperAdminWorkspaces`.
//
// ── Carried across unchanged ────────────────────────────────────────────────
//   • `loadWorkspaces`, including the conditional params — `search` and
//     `status` are only added when set, so a blank search does not send
//     `search=''` and get zero rows back.
//   • The 300ms debounce, and the `setPage(1)` that rides with it. Without the
//     page reset, typing while on page 3 asks the server for page 3 of a
//     one-page result and renders empty.
//   • `toggleSort`'s TWO-state cycle: same column flips asc/desc, a new column
//     starts at desc. ds `DataTable` cycles three ways (asc → desc → cleared),
//     so its `onSortChange` is mapped rather than used directly — see the note
//     at the call site.
//
// ── Structural note (as phases 30, 34-37) ──────────────────────────────────
// `PageSwitch` cannot gate `/admin/*`. Ships directly; legacy kept
// unreferenced. Pins `data-theme="dark"` to match the AdminLayout shell.
//
// Not triggered: nothing on this page writes.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { Building2, Users } from 'lucide-react';
import {
  Panel, Button, Callout, DataTable, EmptyState, SearchInput, Select,
} from '../../components/ds';
import { PlanBadge } from './adminShared';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Plans' },
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid (Core/All Apps/Pro/Enterprise)' },
];

// ── Main Page ──────────────────────────────────────────────────────────────
function AdminWorkspacesPageV2() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');

  const loadWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit: 25, sort, order };
      if (search) params.search = search;
      if (status !== 'all') params.status = status;

      const res = await api.getSuperAdminWorkspaces(params);
      setWorkspaces(res.workspaces || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 0);
    } catch (err) {
      setError(err.message || 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, sort, order]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const toggleSort = (col) => {
    if (sort === col) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(col);
      setOrder('desc');
    }
    setPage(1);
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      width: 260,
      render: (ws) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 'var(--r-2, 10px)', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface-3)', color: 'var(--fg-4)',
          }}>
            <Building2 size={15} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', color: 'var(--fg)', fontWeight: 550 }}>{ws.name}</span>
            <span style={{ ...microStyle, display: 'block' }}>{ws.slug}</span>
          </span>
        </span>
      ),
    },
    { key: 'plan', header: 'Plan', sortable: true, width: 120, render: (ws) => <PlanBadge plan={ws.plan} /> },
    {
      key: 'members',
      header: 'Members',
      width: 110,
      render: (ws) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Users size={13} style={{ color: 'var(--fg-4)' }} />
          {ws.memberCount || 0}
        </span>
      ),
    },
    {
      key: 'seats',
      header: 'Seats',
      width: 100,
      render: (ws) => `${ws.billing?.seatsUsed || 0}/${ws.billing?.seatsTotal || 0}`,
    },
    { key: 'owner', header: 'Owner', width: 200, muted: true, render: (ws) => ws.ownerEmail || '—' },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      width: 130,
      muted: true,
      render: (ws) => (ws.createdAt ? new Date(ws.createdAt).toLocaleDateString() : '—'),
    },
  ];

  // `data-theme="dark"` is pinned: AdminLayout is a hard-dark legacy shell and
  // nothing on /admin/* writes the attribute.
  return (
    <div data-theme="dark" style={{ padding: 'clamp(12px, 2vw, 24px)', display: 'grid', gap: 18 }}>
      <div>
        <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>Workspaces</h1>
        <p style={{ ...microStyle, marginTop: 4, fontSize: 12.5 }}>Manage all customer organizations</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by name, slug, or domain..."
          aria-label="Search workspaces by name, slug or domain"
          width={320}
        />
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          aria-label="Filter by plan"
          style={{ width: 260 }}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <span style={microStyle}>
          {total.toLocaleString()} workspace{total !== 1 ? 's' : ''}
        </span>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <Panel flush>
        <DataTable
          columns={columns}
          rows={workspaces}
          rowKey="_id"
          loading={loading}
          loadingRows={8}
          sort={{ key: sort, dir: order }}
          // ds DataTable cycles asc -> desc -> cleared; legacy toggles asc/desc
          // and never clears. It only proposes `null` for the column that is
          // ALREADY the sorted one at desc, so `next ? next.key : sort`
          // recovers the clicked key and hands it to legacy's own toggleSort —
          // preserving the two-state behaviour exactly.
          onSortChange={(next) => toggleSort(next ? next.key : sort)}
          onRowClick={(ws) => navigate(`/admin/workspaces/${ws._id}`)}
          empty={<EmptyState icon={<Building2 size={24} />} title="No workspaces found" compact>Try a different search or plan filter.</EmptyState>}
        />
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
            <span style={microStyle}>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="ghost" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page">Previous</Button>
              <Button variant="ghost" size="sm" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} aria-label="Next page">Next</Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default AdminWorkspacesPageV2;
