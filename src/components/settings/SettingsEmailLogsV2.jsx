/**
 * SettingsEmailLogs — Admin-only email logs viewer
 *
 * Shows all platform emails (except Outreach) in a filterable, paginated table.
 * Uses the GET /api/org/:slug/email-logs endpoint.
 */
import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import {
  Mail, Search, Loader2, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle2, Clock, Filter, X, RefreshCw, ExternalLink,
} from 'lucide-react';
import api from '../../utils/api';
import { Panel, Button, Input, Callout, EmptyState } from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// Read-only page: every request it makes is a GET, including "Check Delivery".
// Everything from `const { currentOrg }` down to `checkDeliveryStatus` is
// spliced in verbatim, and so is the pagination-window algorithm, which lives
// in the render.
//
// On the badges: legacy used THREE colour maps covering eight distinct hues —
// more than `Chip` has tones. Rather than add five more accent/ink token pairs
// for one page, these render as a local `Tag`: the accent carries the hue in a
// 14% tint and a dot, and the ink stays `--fg`. That is the structural fix from
// my-attendance — an accent ink on a wash of itself is the pairing that fails —
// so it passes by construction rather than by tuning, and all eight stay
// visually distinct.
// ─────────────────────────────────────────────────────────────────────────────

// ── Delivery status accents ──────────────────────────────────────
const DELIVERY_COLORS = {
  delivered:  { accent: 'var(--acc-emerald)', label: 'Delivered' },
  sent:       { accent: 'var(--acc-blue)',    label: 'Sent' },
  bounced:    { accent: 'var(--danger)',      label: 'Bounced' },
  complained: { accent: 'var(--acc-orange)',  label: 'Complained' },
  opened:     { accent: 'var(--acc-cyan)',    label: 'Opened' },
  clicked:    { accent: 'var(--acc-teal)',    label: 'Clicked' },
  unknown:    { accent: 'var(--fg-4)',        label: 'Unknown' },
  check_failed: { accent: 'var(--acc-amber)', label: 'Check Failed' },
};

// ── App accents ──────────────────────────────────────────────────
const APP_COLORS = {
  auth:  { accent: 'var(--acc-slate)' },
  ats:   { accent: 'var(--acc-blue)' },
  sign:  { accent: 'var(--acc-indigo)' },
  org:   { accent: 'var(--acc-purple)' },
};

const STATUS_COLORS = {
  sent:    { accent: 'var(--acc-emerald)', icon: CheckCircle2 },
  failed:  { accent: 'var(--danger)',      icon: AlertCircle },
  skipped: { accent: 'var(--acc-amber)',   icon: Clock },
};

const APP_LABELS = { auth: 'Auth', ats: 'ATS', sign: 'Sign', org: 'Org' };
const APPS = ['auth', 'ats', 'sign', 'org'];
const STATUSES = ['sent', 'failed'];
const LIMIT = 20;

/**
 * Accent-tinted label. The hue lives in the tint and the dot; the text stays
 * `--fg` so it is legible against the wash whatever the accent.
 */
function Tag({ accent, icon, children, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center',
      padding: '2px 7px', borderRadius: 'var(--r-1)',
      background: `color-mix(in srgb, ${accent} 14%, transparent)`,
      boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 26%, transparent)`,
      font: "500 10px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)',
      whiteSpace: 'nowrap', ...style,
    }}>
      {icon || <span style={{ width: 5, height: 5, borderRadius: 99, background: accent, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

/** Filter chip that reads pressed/unpressed rather than relying on hue alone. */
function FilterChip({ active, accent, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '3px 9px', borderRadius: 'var(--r-1)', cursor: 'pointer', border: 0,
        font: "500 11px/1.4 'Inter', system-ui, sans-serif",
        textTransform: 'capitalize',
        background: active ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'var(--surface-2)',
        boxShadow: active ? `0 0 0 1px color-mix(in srgb, ${accent} 30%, transparent)` : '0 0 0 1px var(--line)',
        color: active ? 'var(--fg)' : 'var(--fg-4)',
      }}
    >
      {children}
    </button>
  );
}

/** Label + value, the shape the expanded row repeats. */
function KV({ label, value, mono }) {
  return (
    <div>
      <span style={{ display: 'block', font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{label}</span>
      <div style={{
        font: mono
          ? "400 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace"
          : "400 12.5px/1.5 'Inter', system-ui, sans-serif",
        color: 'var(--fg-2)', marginTop: 2, wordBreak: 'break-word',
      }}>{value}</div>
    </div>
  );
}

export default function SettingsEmailLogsV2() {
  const { currentOrg } = useOrg();
  const orgSlug = currentOrg?.slug;

  // ── State ──────────────────────────────────────────────────────────
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Expanded row
  const [expandedId, setExpandedId] = useState(null);

  // Delivery status checking
  const [checkingStatus, setCheckingStatus] = useState(null); // logId being checked
  const [deliveryStatuses, setDeliveryStatuses] = useState({}); // { logId: { status, lastEvent, ... } }

  // ── Fetch logs ─────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search) params.set('search', search);
      if (appFilter) params.set('app', appFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await api.request(`/api/org/${orgSlug}/email-logs?${params}`);
      if (res.success) {
        setLogs(res.logs || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 0);
      } else {
        setError(res.error || 'Failed to load email logs');
      }
    } catch (err) {
      setError('Failed to load email logs');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, page, search, appFilter, statusFilter, fromDate, toDate]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, appFilter, statusFilter, fromDate, toDate]);

  // ── Helpers ────────────────────────────────────────────────────────
  const formatDate = (d) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const clearFilters = () => {
    setSearch('');
    setAppFilter('');
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const hasFilters = search || appFilter || statusFilter || fromDate || toDate;

  const checkDeliveryStatus = async (logId) => {
    if (!orgSlug) return;
    setCheckingStatus(logId);
    try {
      const res = await api.request(`/api/org/${orgSlug}/email-logs/${logId}/check-status`);
      if (res.success) {
        setDeliveryStatuses(prev => ({ ...prev, [logId]: res }));
      }
    } catch (err) {
      console.error('Failed to check delivery status:', err);
    } finally {
      setCheckingStatus(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  const GRID = '1fr 1.5fr 1.2fr 84px 88px';
  const cell = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, font: "650 17px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.012em', color: 'var(--fg)', margin: 0 }}>
            <Mail size={17} style={{ color: 'var(--brand-ink)' }} />
            Email Logs
          </h2>
          <p style={{ font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
            {total > 0 ? `${total} email${total !== 1 ? 's' : ''} logged` : 'View all platform emails'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchLogs}
          iconLeft={<RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />}>
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Panel>
        <div style={{ padding: 6, display: 'grid', gap: 12 }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
            <Input
              type="text"
              placeholder="Search by recipient or subject..."
              aria-label="Search email logs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>

          {/* Filter chips + date range */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            {/* App filter chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={13} style={{ color: 'var(--fg-4)' }} />
              <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginRight: 2 }}>App:</span>
              {APPS.map(a => {
                const colors = APP_COLORS[a] || APP_COLORS.auth;
                const isActive = appFilter === a;
                return (
                  <FilterChip key={a} active={isActive} accent={colors.accent} onClick={() => setAppFilter(isActive ? '' : a)}>
                    {APP_LABELS[a]}
                  </FilterChip>
                );
              })}
            </div>

            {/* Status filter chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginRight: 2 }}>Status:</span>
              {STATUSES.map(s => {
                const colors = STATUS_COLORS[s];
                const isActive = statusFilter === s;
                return (
                  <FilterChip key={s} active={isActive} accent={colors.accent} onClick={() => setStatusFilter(isActive ? '' : s)}>
                    {s}
                  </FilterChip>
                );
              })}
            </div>

            {/* Date range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <Input
                type="date"
                aria-label="From date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ width: 'auto', height: 30, font: "400 11.5px/1 'Inter', system-ui, sans-serif" }}
              />
              <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>to</span>
              <Input
                type="date"
                aria-label="To date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ width: 'auto', height: 30, font: "400 11.5px/1 'Inter', system-ui, sans-serif" }}
              />
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} iconLeft={<X size={12} />}>Clear</Button>
            )}
          </div>
        </div>
      </Panel>

      {/* Error */}
      {error && <Callout tone="danger" icon={<AlertCircle size={15} />}>{error}</Callout>}

      {/* Table */}
      <Panel flush>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 720 }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '9px 14px',
              font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: '1px solid var(--line-2)', background: 'var(--surface-2)',
            }}>
              <span>Date</span>
              <span>Subject</span>
              <span>To</span>
              <span>App</span>
              <span>Status</span>
            </div>

            {/* Loading */}
            {loading && logs.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '52px 0', font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                <Loader2 size={16} className="animate-spin" /> Loading email logs...
              </div>
            )}

            {/* Empty */}
            {!loading && logs.length === 0 && (
              <EmptyState
                icon={<Mail size={22} />}
                title="No email logs found"
                actions={hasFilters ? <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all filters</Button> : undefined}
              />
            )}

            {/* Rows */}
            {logs.map((log) => {
              const appColors = APP_COLORS[log.app] || APP_COLORS.auth;
              const statusInfo = STATUS_COLORS[log.status] || STATUS_COLORS.sent;
              const StatusIcon = statusInfo.icon;
              const isExpanded = expandedId === log._id;
              const toList = Array.isArray(log.to) ? log.to : [log.to];

              return (
                <div key={log._id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log._id)}
                    aria-expanded={isExpanded}
                    style={{
                      width: '100%', display: 'grid', gridTemplateColumns: GRID, gap: 14,
                      padding: '10px 14px', textAlign: 'left', cursor: 'pointer', border: 0,
                      alignItems: 'center',
                      borderBottom: '1px solid var(--line-2)',
                      background: isExpanded ? 'var(--surface-2)' : 'transparent',
                      color: 'inherit', font: 'inherit',
                    }}
                  >
                    {/* Date */}
                    <span style={{ ...cell, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
                      {formatDate(log.sentAt)}
                    </span>

                    {/* Subject */}
                    <span style={{ ...cell, font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                      {log.subject || '(no subject)'}
                    </span>

                    {/* To */}
                    <span style={{ ...cell, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
                      {toList[0]}
                      {toList.length > 1 && (
                        <span style={{ color: 'var(--fg-4)', marginLeft: 4 }}>+{toList.length - 1}</span>
                      )}
                    </span>

                    {/* App */}
                    <Tag accent={appColors.accent}>{APP_LABELS[log.app] || log.app}</Tag>

                    {/* Status */}
                    <Tag accent={statusInfo.accent} icon={<StatusIcon size={11} style={{ flexShrink: 0 }} />}>
                      {log.status}
                    </Tag>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (() => {
                    const deliveryInfo = deliveryStatuses[log._id];
                    const savedStatus = log.deliveryStatus || deliveryInfo?.deliveryStatus;
                    const statusColors = DELIVERY_COLORS[savedStatus] || DELIVERY_COLORS.unknown;

                    return (
                      <div style={{ padding: 16, background: 'var(--bg)', borderBottom: '1px solid var(--line-2)', display: 'grid', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                          <KV label="From" value={log.from || '—'} />
                          <KV label="To" value={toList.join(', ')} />
                          <KV label="Subject" value={log.subject || '—'} />
                          <KV label="Template Key" value={log.templateKey || '—'} mono />
                          <KV label="Sent At" value={formatDate(log.sentAt)} />
                          <KV label="App" value={<span style={{ textTransform: 'capitalize' }}>{log.app || '—'}</span>} />
                        </div>

                        {/* Resend ID + Delivery Status */}
                        <div style={{ background: 'var(--surface-1)', boxShadow: '0 0 0 1px var(--line)', borderRadius: 'var(--r-2)', padding: 12, marginTop: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                            <span style={{ font: "600 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                              Delivery Tracking
                            </span>
                            {log.resendId || deliveryInfo?.resendId ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => checkDeliveryStatus(log._id)}
                                disabled={checkingStatus === log._id}
                                iconLeft={checkingStatus === log._id
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : <ExternalLink size={12} />}
                              >
                                {checkingStatus === log._id ? 'Checking...' : 'Check Delivery'}
                              </Button>
                            ) : null}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                            <KV label="Resend ID" value={log.resendId || deliveryInfo?.resendId || 'Not tracked'} mono />
                            <div>
                              <span style={{ display: 'block', font: "400 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Delivery Status</span>
                              {savedStatus ? (
                                <span style={{ display: 'inline-flex', marginTop: 3 }}>
                                  <Tag
                                    accent={statusColors.accent}
                                    icon={savedStatus === 'delivered'
                                      ? <CheckCircle2 size={11} style={{ flexShrink: 0 }} />
                                      : savedStatus === 'bounced'
                                        ? <AlertCircle size={11} style={{ flexShrink: 0 }} />
                                        : undefined}
                                  >
                                    {statusColors.label}
                                  </Tag>
                                </span>
                              ) : (
                                <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
                                  {log.resendId ? 'Click "Check Delivery" to verify' : 'Not available'}
                                </p>
                              )}
                            </div>
                          </div>
                          {log.lastCheckedAt && (
                            <p style={{ font: "400 10px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '10px 0 0' }}>
                              Last checked: {formatDate(log.lastCheckedAt)}
                            </p>
                          )}
                        </div>

                        {log.error && (
                          <Callout tone="danger" title="Error" style={{ marginTop: 2 }}>
                            <span style={{ font: "400 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace" }}>{log.error}</span>
                          </Callout>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Button
              variant="ghost" size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
              iconLeft={<ChevronLeft size={15} />}
            />

            {/* Page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  aria-current={page === pageNum ? 'page' : undefined}
                  style={{
                    width: 30, height: 30, borderRadius: 'var(--r-1)', border: 0, cursor: 'pointer',
                    font: "500 11.5px/1 'Inter', system-ui, sans-serif",
                    fontVariantNumeric: 'tabular-nums',
                    background: page === pageNum ? 'var(--brand-soft)' : 'transparent',
                    boxShadow: page === pageNum ? '0 0 0 1px var(--brand-line)' : 'none',
                    color: page === pageNum ? 'var(--fg)' : 'var(--fg-4)',
                  }}
                >
                  {pageNum}
                </button>
              );
            })}

            <Button
              variant="ghost" size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
              iconRight={<ChevronRight size={15} />}
            />
          </div>
        </div>
      )}
    </div>
  );
}
