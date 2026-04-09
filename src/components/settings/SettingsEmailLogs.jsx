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

// ── Delivery status badge colors ──────────────────────────────────
const DELIVERY_COLORS = {
  delivered:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: 'Delivered' },
  sent:       { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20',    label: 'Sent' },
  bounced:    { bg: 'bg-red-500/10',      text: 'text-red-400',      border: 'border-red-500/20',      label: 'Bounced' },
  complained: { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/20',  label: 'Complained' },
  opened:     { bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    border: 'border-cyan-500/20',    label: 'Opened' },
  clicked:    { bg: 'bg-teal-500/10',    text: 'text-teal-400',    border: 'border-teal-500/20',    label: 'Clicked' },
  unknown:    { bg: 'bg-dark-700/50',    text: 'text-dark-400',    border: 'border-dark-600/50',    label: 'Unknown' },
  check_failed: { bg: 'bg-amber-500/10', text: 'text-amber-400',  border: 'border-amber-500/20',  label: 'Check Failed' },
};

// ── App badge colors ────────────────────────────────────────────────
const APP_COLORS = {
  auth:  { bg: 'bg-slate-500/10',  text: 'text-slate-400',  border: 'border-slate-500/20' },
  ats:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20' },
  sign:  { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  org:   { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  trial: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
};

const STATUS_COLORS = {
  sent:    { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: CheckCircle2 },
  failed:  { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20',     icon: AlertCircle },
  skipped: { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   icon: Clock },
};

const APP_LABELS = { auth: 'Auth', ats: 'ATS', sign: 'Sign', org: 'Org', trial: 'Trial' };
const APPS = ['auth', 'ats', 'sign', 'org', 'trial'];
const STATUSES = ['sent', 'failed'];
const LIMIT = 20;

export default function SettingsEmailLogs() {
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
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-rivvra-400" />
            Email Logs
          </h2>
          <p className="text-dark-400 text-sm mt-1">
            {total > 0 ? `${total} email${total !== 1 ? 's' : ''} logged` : 'View all platform emails'}
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-3 py-2 text-sm text-dark-300 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search by recipient or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-rivvra-500/50 transition-colors"
          />
        </div>

        {/* Filter chips + date range */}
        <div className="flex flex-wrap items-center gap-3">
          {/* App filter chips */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-dark-500" />
            <span className="text-xs text-dark-500 mr-1">App:</span>
            {APPS.map(a => {
              const colors = APP_COLORS[a] || APP_COLORS.auth;
              const isActive = appFilter === a;
              return (
                <button
                  key={a}
                  onClick={() => setAppFilter(isActive ? '' : a)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
                    isActive
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : 'bg-dark-800/50 text-dark-400 border-dark-700/50 hover:text-white hover:border-dark-600'
                  }`}
                >
                  {APP_LABELS[a]}
                </button>
              );
            })}
          </div>

          {/* Status filter chips */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-dark-500 mr-1">Status:</span>
            {STATUSES.map(s => {
              const colors = STATUS_COLORS[s];
              const isActive = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(isActive ? '' : s)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-all capitalize ${
                    isActive
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : 'bg-dark-800/50 text-dark-400 border-dark-700/50 hover:text-white hover:border-dark-600'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1 text-xs bg-dark-800 border border-dark-700 rounded-md text-dark-300 focus:outline-none focus:border-rivvra-500/50 [color-scheme:dark]"
            />
            <span className="text-xs text-dark-500">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1 text-xs bg-dark-800 border border-dark-700 rounded-md text-dark-300 focus:outline-none focus:border-rivvra-500/50 [color-scheme:dark]"
            />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-dark-400 hover:text-white bg-dark-800/50 border border-dark-700/50 rounded-md hover:border-dark-600 transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1.5fr_1.2fr_80px_80px] gap-4 px-4 py-2.5 text-[10px] uppercase text-dark-500 font-semibold tracking-wider border-b border-dark-700/50 bg-dark-800/30">
          <span>Date</span>
          <span>Subject</span>
          <span>To</span>
          <span>App</span>
          <span>Status</span>
        </div>

        {/* Loading */}
        {loading && logs.length === 0 && (
          <div className="flex items-center justify-center py-16 text-dark-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading email logs...
          </div>
        )}

        {/* Empty */}
        {!loading && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-dark-400">
            <Mail className="w-10 h-10 mb-3 text-dark-600" />
            <p className="text-sm">No email logs found</p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-xs text-rivvra-400 hover:text-rivvra-300 underline"
              >
                Clear all filters
              </button>
            )}
          </div>
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
                className={`w-full grid grid-cols-[1fr_1.5fr_1.2fr_80px_80px] gap-4 px-4 py-3 text-left transition-colors border-b border-dark-700/30 ${
                  isExpanded
                    ? 'bg-rivvra-500/5'
                    : 'hover:bg-dark-800/40'
                }`}
              >
                {/* Date */}
                <span className="text-xs text-dark-300 truncate">
                  {formatDate(log.sentAt)}
                </span>

                {/* Subject */}
                <span className="text-sm text-white truncate">
                  {log.subject || '(no subject)'}
                </span>

                {/* To */}
                <span className="text-xs text-dark-300 truncate">
                  {toList[0]}
                  {toList.length > 1 && (
                    <span className="text-dark-500 ml-1">+{toList.length - 1}</span>
                  )}
                </span>

                {/* App */}
                <span className={`inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-medium rounded-md border ${appColors.bg} ${appColors.text} ${appColors.border}`}>
                  {APP_LABELS[log.app] || log.app}
                </span>

                {/* Status */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                  <StatusIcon className="w-3 h-3" />
                  {log.status}
                </span>
              </button>

              {/* Expanded details */}
              {isExpanded && (() => {
                const deliveryInfo = deliveryStatuses[log._id];
                const savedStatus = log.deliveryStatus || deliveryInfo?.deliveryStatus;
                const statusColors = DELIVERY_COLORS[savedStatus] || DELIVERY_COLORS.unknown;

                return (
                  <div className="px-4 py-4 bg-dark-800/20 border-b border-dark-700/30 space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-dark-500 text-xs">From</span>
                        <p className="text-dark-200">{log.from || '—'}</p>
                      </div>
                      <div>
                        <span className="text-dark-500 text-xs">To</span>
                        <p className="text-dark-200">{toList.join(', ')}</p>
                      </div>
                      <div>
                        <span className="text-dark-500 text-xs">Subject</span>
                        <p className="text-dark-200">{log.subject || '—'}</p>
                      </div>
                      <div>
                        <span className="text-dark-500 text-xs">Template Key</span>
                        <p className="text-dark-200 font-mono text-xs">{log.templateKey || '—'}</p>
                      </div>
                      <div>
                        <span className="text-dark-500 text-xs">Sent At</span>
                        <p className="text-dark-200">{formatDate(log.sentAt)}</p>
                      </div>
                      <div>
                        <span className="text-dark-500 text-xs">App</span>
                        <p className="text-dark-200 capitalize">{log.app || '—'}</p>
                      </div>
                    </div>

                    {/* Resend ID + Delivery Status */}
                    <div className="mt-3 bg-dark-900/50 border border-dark-700/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-dark-500 text-xs font-semibold uppercase tracking-wider">Delivery Tracking</span>
                        {log.resendId || deliveryInfo?.resendId ? (
                          <button
                            onClick={() => checkDeliveryStatus(log._id)}
                            disabled={checkingStatus === log._id}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-rivvra-400 hover:text-rivvra-300 bg-rivvra-500/10 hover:bg-rivvra-500/15 border border-rivvra-500/20 rounded-md transition-colors disabled:opacity-50"
                          >
                            {checkingStatus === log._id ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Checking...</>
                            ) : (
                              <><ExternalLink className="w-3 h-3" /> Check Delivery</>
                            )}
                          </button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-dark-500 text-xs">Resend ID</span>
                          <p className="text-dark-300 font-mono text-xs">{log.resendId || deliveryInfo?.resendId || 'Not tracked'}</p>
                        </div>
                        <div>
                          <span className="text-dark-500 text-xs">Delivery Status</span>
                          {savedStatus ? (
                            <p className={`inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 text-[10px] font-medium rounded-md border ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}>
                              {savedStatus === 'delivered' && <CheckCircle2 className="w-3 h-3" />}
                              {savedStatus === 'bounced' && <AlertCircle className="w-3 h-3" />}
                              {statusColors.label}
                            </p>
                          ) : (
                            <p className="text-dark-400 text-xs mt-0.5">{log.resendId ? 'Click "Check Delivery" to verify' : 'Not available'}</p>
                          )}
                        </div>
                      </div>
                      {log.lastCheckedAt && (
                        <p className="text-dark-600 text-[10px] mt-2">Last checked: {formatDate(log.lastCheckedAt)}</p>
                      )}
                    </div>

                    {log.error && (
                      <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <span className="text-red-400 text-xs font-semibold">Error</span>
                        <p className="text-red-300 text-sm mt-1 font-mono">{log.error}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-dark-500">
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

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
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    page === pageNum
                      ? 'bg-rivvra-500/20 text-rivvra-400 border border-rivvra-500/30'
                      : 'text-dark-400 hover:text-white hover:bg-dark-800'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
