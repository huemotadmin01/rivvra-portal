// ============================================================================
// AdminOverviewPageV2.jsx — Rivvra platform dashboard, on ds
// ============================================================================
//
// Route: /admin (index), inside <SuperAdminRoute><AdminLayout />.
//
// Mostly read-only, with one exception that is not: the self-service
// registration toggle. Flipping it closed stops anyone in the world creating a
// new Rivvra workspace, so `toggleRegistration` is spliced verbatim, including
// its `if (regSaving) return;` in-flight guard and the fact that it trusts the
// SERVER's echoed value (`setRegOpen(res.open)`) rather than assuming the flip
// took.
//
// `statCards` is spliced whole — it is the metric list, and its `key`s are
// looked up straight off the stats payload. Its `color` names are mapped to ds
// accents separately (STAT_ACCENT) so the list itself did not need retyping,
// the same approach used for GROUP_CONFIG and statusOf in earlier phases.
//
// `PlanBadge` moved to ./adminShared — it was duplicated character-for-
// character here and in AdminWorkspacesPage.
//
// Not triggered: the registration toggle.
// ============================================================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import {
  Building2, Users, CreditCard, TrendingUp, Loader2, ChevronRight,
} from 'lucide-react';
import {
  Panel, Button, Callout, Stat, Meter, EmptyState, Spinner,
} from '../../components/ds';
import { PlanBadge } from './adminShared';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

const statCards = [
  { key: 'totalOrgs', label: 'Total Workspaces', icon: Building2, color: 'blue' },
  { key: 'paidOrgs', label: 'Paid Orgs', icon: CreditCard, color: 'emerald' },
  { key: 'freeOrgs', label: 'Free Orgs', icon: Building2, color: 'green' },
  { key: 'totalUsers', label: 'Total Users', icon: Users, color: 'purple' },
  { key: 'orgsCreatedThisMonth', label: 'New Orgs This Month', icon: TrendingUp, color: 'cyan' },
  { key: 'usersCreatedThisMonth', label: 'New Users This Month', icon: TrendingUp, color: 'indigo' },
];

// legacy's `colorMap` was eight Tailwind class bundles; these are the ds
// accents for the same colour names. Only the names statCards actually uses
// are needed.
const STAT_ACCENT = {
  blue: 'var(--acc-blue)',
  emerald: 'var(--acc-emerald)',
  green: 'var(--acc-rivvra)',
  amber: 'var(--acc-amber)',
  red: 'var(--acc-rose)',
  purple: 'var(--acc-purple)',
  cyan: 'var(--acc-cyan)',
  indigo: 'var(--acc-indigo)',
};

// ── Main Page ──────────────────────────────────────────────────────────────
function AdminOverviewPageV2() {
  const [stats, setStats] = useState(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New-workspace registration toggle. null = loading.
  const [regOpen, setRegOpen] = useState(null);
  const [regSaving, setRegSaving] = useState(false);

  useEffect(() => {
    loadData();
    api.getRegistrationSetting()
      .then(r => setRegOpen(r?.open !== false))
      .catch(() => {});
  }, []);

  const toggleRegistration = async () => {
    if (regSaving) return;
    setRegSaving(true);
    try {
      const res = await api.setRegistrationSetting(!regOpen);
      if (res?.success) setRegOpen(res.open);
    } catch (e) {
      setError(e.message || 'Failed to update registration setting');
    } finally {
      setRegSaving(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, wsRes] = await Promise.all([
        api.getSuperAdminStats(),
        api.getSuperAdminWorkspaces({ page: 1, limit: 10, sort: 'createdAt', order: 'desc' }),
      ]);
      setStats(statsRes.stats);
      setRecentWorkspaces(wsRes.workspaces || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div data-theme="dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (error) {
    return (
      <div data-theme="dark" style={{ padding: 24 }}>
        <Callout tone="danger">{error}</Callout>
      </div>
    );
  }

  // `data-theme="dark"` is pinned: AdminLayout is a hard-dark legacy shell and
  // nothing on /admin/* writes the attribute.
  return (
    <div data-theme="dark" style={{ padding: 'clamp(12px, 2vw, 24px)', display: 'grid', gap: 18 }}>
      <div>
        <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>Dashboard</h1>
        <p style={{ ...microStyle, marginTop: 4, fontSize: 12.5 }}>Rivvra platform overview</p>
      </div>

      {/* Registration toggle. `regOpen === null` means still loading — the
          block is hidden rather than guessing a state, because rendering
          "Closed" for a moment on a platform that is open would be a lie about
          whether the world can sign up. */}
      {regOpen !== null && (
        <Callout
          tone={regOpen ? 'brand' : 'warn'}
          title={`New workspace registration — ${regOpen ? 'Open' : 'Closed'}`}
          actions={(
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleRegistration}
              disabled={regSaving}
              iconLeft={regSaving ? <Loader2 size={14} className="animate-spin" /> : undefined}
            >
              {regOpen ? 'Close registrations' : 'Open registrations'}
            </Button>
          )}
        >
          {regOpen
            ? 'Anyone can sign up and create a new workspace.'
            : 'Self-service sign-ups are blocked. Existing customers and team invites are unaffected.'}
        </Callout>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {statCards.map((card) => {
          const value = stats?.[card.key] ?? 0;
          const Icon = card.icon;
          return (
            <Stat
              key={card.key}
              label={card.label}
              value={value.toLocaleString()}
              icon={<Icon size={16} />}
              color={STAT_ACCENT[card.color]}
            />
          );
        })}
      </div>

      {/* Seats */}
      {stats && (
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <span style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>Total Platform Seats</span>
            <span style={microStyle}>
              {stats.usedSeats?.toLocaleString()} / {stats.totalSeats?.toLocaleString()} used
            </span>
          </div>
          {/* Same guard as legacy: a zero total must read 0%, not NaN%. */}
          <Meter value={stats.totalSeats > 0 ? Math.min(100, (stats.usedSeats / stats.totalSeats) * 100) : 0} max={100} />
        </Panel>
      )}

      {/* Recent workspaces */}
      <Panel
        title="Recent Workspaces"
        actions={(
          <Button as="a" href="/admin/workspaces" variant="ghost" size="sm" iconRight={<ChevronRight size={14} />}>
            View all
          </Button>
        )}
        flush
      >
        {recentWorkspaces.length === 0 ? (
          <EmptyState icon={<Building2 size={24} />} title="No workspaces yet" compact>
            New customer organizations will appear here.
          </EmptyState>
        ) : (
          <div>
            {recentWorkspaces.map((ws, i) => (
              <Link
                key={ws._id}
                to={`/admin/workspaces/${ws._id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px',
                  textDecoration: 'none',
                  borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  width: 34, height: 34, borderRadius: 'var(--r-2, 10px)', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface-3)', color: 'var(--fg-4)',
                }}>
                  <Building2 size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</span>
                  <span style={{ ...microStyle, display: 'block' }}>{ws.slug} · {ws.ownerEmail || 'No owner'}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <PlanBadge plan={ws.plan} />
                  <span style={microStyle}>
                    {ws.billing?.seatsUsed || 0}/{ws.billing?.seatsTotal || 0} seats
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default AdminOverviewPageV2;
