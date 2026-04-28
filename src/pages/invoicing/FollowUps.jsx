import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  Loader2, Send, ChevronDown, ChevronRight, AlertTriangle,
  Clock, Mail, Settings2, Save, History, RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysBetween(dateStr) {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Follow-up Level Dot
// ---------------------------------------------------------------------------

function LevelDot({ level }) {
  const colors = {
    1: 'bg-emerald-400',
    2: 'bg-amber-400',
    3: 'bg-red-400',
  };
  const labels = {
    1: 'Level 1 — Gentle',
    2: 'Level 2 — Firm',
    3: 'Level 3 — Final',
  };
  const lvl = level || 1;

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${colors[lvl] || colors[1]}`} />
      <span className="text-sm text-dark-300">{labels[lvl] || `Level ${lvl}`}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Follow-up Config Section
// ---------------------------------------------------------------------------

function FollowUpConfig({ orgSlug, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await invoicingApi.getFollowUpConfig(orgSlug);
      setConfig(res.config || res.data || res);
    } catch (err) {
      showToast(err.message || 'Failed to load config', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => {
    if (expanded && !config) fetchConfig();
  }, [expanded, config, fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoicingApi.updateFollowUpConfig(orgSlug, config);
      showToast('Follow-up config saved');
    } catch (err) {
      showToast(err.message || 'Failed to save config', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateLevel = (index, key, value) => {
    setConfig(prev => {
      const levels = [...(prev.levels || [])];
      levels[index] = { ...levels[index], [key]: value };
      return { ...prev, levels };
    });
  };

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-dark-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={18} className="text-dark-400" /> : <ChevronRight size={18} className="text-dark-400" />}
          <Settings2 size={18} className="text-rivvra-400" />
          <div>
            <p className="text-white font-medium">Follow-up Configuration</p>
            <p className="text-dark-400 text-xs mt-0.5">Configure escalation levels, delays, and templates</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-dark-700 p-5">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 size={20} className="text-rivvra-500 animate-spin" />
            </div>
          ) : !config ? (
            <p className="text-dark-500 text-sm text-center py-4">No configuration data available.</p>
          ) : (
            <>
              <div className="space-y-6">
                {(config.levels || []).map((level, idx) => (
                  <div key={idx} className="bg-dark-800 border border-dark-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <LevelDot level={idx + 1} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-dark-300 mb-1">Delay (days after due)</label>
                        <input
                          type="number"
                          min="1"
                          value={level.delayDays || ''}
                          onChange={e => updateLevel(idx, 'delayDays', parseInt(e.target.value) || 0)}
                          className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-dark-300 mb-1">Email Subject</label>
                        <input
                          type="text"
                          value={level.emailSubject || ''}
                          onChange={e => updateLevel(idx, 'emailSubject', e.target.value)}
                          className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                        />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-1">
                        <label className="block text-sm text-dark-300 mb-1">Template</label>
                        <textarea
                          value={level.emailBody || ''}
                          onChange={e => updateLevel(idx, 'emailBody', e.target.value)}
                          rows={3}
                          className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Configuration
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow-up Logs Section
// ---------------------------------------------------------------------------

function FollowUpLogs({ orgSlug, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await invoicingApi.listFollowUpLogs(orgSlug);
      setLogs(res.logs || res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => {
    if (expanded && logs.length === 0) fetchLogs();
  }, [expanded, logs.length, fetchLogs]);

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-dark-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={18} className="text-dark-400" /> : <ChevronRight size={18} className="text-dark-400" />}
          <History size={18} className="text-rivvra-400" />
          <div>
            <p className="text-white font-medium">Follow-up Logs</p>
            <p className="text-dark-400 text-xs mt-0.5">Recent follow-up activity and send history</p>
          </div>
        </div>
        {expanded && (
          <button
            onClick={(e) => { e.stopPropagation(); fetchLogs(); }}
            className="text-dark-400 hover:text-white transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </button>

      {expanded && (
        <div className="border-t border-dark-700">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 size={20} className="text-rivvra-500 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="px-4 py-8 text-center text-dark-500 text-sm">
              No follow-up logs yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700 text-dark-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Invoice</th>
                    <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                    <th className="text-center px-4 py-2.5 font-medium">Level</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={log._id || log.id || idx} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                      <td className="px-4 py-3 text-dark-300">{formatDate(log.sentAt || log.createdAt)}</td>
                      <td className="px-4 py-3 text-white font-medium">{log.invoiceNumber || log.invoiceId || '-'}</td>
                      <td className="px-4 py-3 text-dark-300">{log.contactName || log.customerName || log.customer || '-'}</td>
                      <td className="px-4 py-3 text-center"><LevelDot level={log.level} /></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                          log.status === 'sent' ? 'text-emerald-400' :
                          log.status === 'failed' ? 'text-red-400' :
                          'text-dark-400'
                        }`}>
                          {log.status === 'sent' ? <Mail size={13} /> : <AlertTriangle size={13} />}
                          {log.status ? log.status.charAt(0).toUpperCase() + log.status.slice(1) : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function FollowUps() {
  const { orgSlug } = useOrg();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState(null);

  const fetchOverdue = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    setInvoices([]);
    try {
      const res = await invoicingApi.listOverdueInvoices(orgSlug);
      setInvoices(res.invoices || res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load overdue invoices', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, showToast, currentCompany?._id]);

  useEffect(() => {
    fetchOverdue();
  }, [fetchOverdue]);

  const handleSendFollowUp = async (invoice) => {
    const invoiceId = invoice._id || invoice.id;
    const level = invoice.nextFollowUpLevel || invoice.followUpLevel || 1;
    setSendingId(invoiceId);
    try {
      await invoicingApi.sendFollowUp(orgSlug, invoiceId, { level });
      showToast(`Follow-up (Level ${level}) sent for ${invoice.number || invoice.invoiceNumber || invoiceId}`);
      fetchOverdue();
    } catch (err) {
      showToast(err.message || 'Failed to send follow-up', 'error');
    } finally {
      setSendingId(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-900 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Follow-ups</h1>
          <p className="text-dark-400 text-sm mt-1">
            Manage overdue invoice follow-ups and escalations
          </p>
        </div>
        <button
          onClick={fetchOverdue}
          disabled={loading}
          className="text-dark-400 hover:text-white transition-colors self-start flex items-center gap-2 text-sm"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Overdue invoices table */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-dark-700 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-400" />
          <h2 className="text-white font-semibold">Overdue Invoices</h2>
          {!loading && (
            <span className="text-dark-500 text-sm">({invoices.length})</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-7 h-7 text-rivvra-500 animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Clock className="w-10 h-10 text-dark-600 mx-auto mb-3" />
            <p className="text-dark-400 text-sm">No overdue invoices. You are all caught up!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 text-dark-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Invoice #</th>
                  <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                  <th className="text-right px-4 py-2.5 font-medium">Amount Due</th>
                  <th className="text-left px-4 py-2.5 font-medium">Due Date</th>
                  <th className="text-right px-4 py-2.5 font-medium">Days Past Due</th>
                  <th className="text-left px-4 py-2.5 font-medium">Last Follow-up</th>
                  <th className="text-center px-4 py-2.5 font-medium">Next Level</th>
                  <th className="text-right px-4 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const invId = inv._id || inv.id;
                  const pastDue = daysBetween(inv.dueDate);
                  const nextLevel = inv.nextFollowUpLevel || inv.followUpLevel || 1;

                  return (
                    <tr
                      key={invId}
                      className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium">
                        {inv.number || inv.invoiceNumber || '-'}
                      </td>
                      <td className="px-4 py-3 text-dark-300">
                        {inv.contactName || inv.customerName || inv.customer?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-white font-medium">
                        {formatCurrency(inv.amountDue ?? inv.total)}
                      </td>
                      <td className="px-4 py-3 text-dark-300">
                        {formatDate(inv.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${
                          pastDue > 60 ? 'text-red-400' :
                          pastDue > 30 ? 'text-amber-400' :
                          'text-dark-300'
                        }`}>
                          {pastDue}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-dark-400 text-xs">
                        {formatDate(inv.lastFollowUpDate || inv.lastFollowUp || inv.lastFollowUpAt)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <LevelDot level={nextLevel} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleSendFollowUp(inv)}
                          disabled={sendingId === invId}
                          className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          {sendingId === invId
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Send size={12} />
                          }
                          Send Follow-up
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Config and Logs sections */}
      <div className="space-y-4">
        <FollowUpConfig orgSlug={orgSlug} showToast={showToast} />
        <FollowUpLogs orgSlug={orgSlug} showToast={showToast} />
      </div>
    </div>
  );
}
