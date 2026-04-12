import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { usePlatform } from '../../context/PlatformContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Loader2, Plus, ChevronDown, ChevronRight, Landmark,
  CheckCircle2, Clock, RefreshCw, X, ArrowDownLeft, ArrowUpRight,
  Sparkles, Link2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount) {
  if (amount == null) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-dark-700 text-dark-300',
    processing: 'bg-blue-500/10 text-blue-400',
    reconciled: 'bg-emerald-500/10 text-emerald-400',
  };
  const key = (status || 'draft').toLowerCase();
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[key] || styles.draft}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Draft'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// New Statement Form
// ---------------------------------------------------------------------------

function NewStatementForm({ onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: '',
    date: '',
    startBalance: '',
    endBalance: '',
  });

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      name: form.name,
      date: form.date,
      startBalance: parseFloat(form.startBalance) || 0,
      endBalance: parseFloat(form.endBalance) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-dark-850 border border-dark-700 rounded-xl p-5 mb-6">
      <h3 className="text-white font-semibold mb-4">New Bank Statement</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm text-dark-300 mb-1">Statement Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => update('name', e.target.value)}
            required
            placeholder="e.g. March 2026 - Chase"
            className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
          />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1">Date</label>
          <input
            type="date"
            value={form.date}
            onChange={e => update('date', e.target.value)}
            required
            className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
          />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1">Start Balance</label>
          <input
            type="number"
            step="0.01"
            value={form.startBalance}
            onChange={e => update('startBalance', e.target.value)}
            required
            placeholder="0.00"
            className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
          />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1">End Balance</label>
          <input
            type="number"
            step="0.01"
            value={form.endBalance}
            onChange={e => update('endBalance', e.target.value)}
            required
            placeholder="0.00"
            className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
          />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          type="submit"
          disabled={saving}
          className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Create Statement
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-dark-400 hover:text-white text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Match Modal
// ---------------------------------------------------------------------------

function MatchModal({ line, suggestions, onMatch, onClose, matching }) {
  if (!line) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div>
            <h3 className="text-white font-semibold">Match Transaction</h3>
            <p className="text-sm text-dark-400 mt-1">
              {formatDate(line.date)} &mdash; {line.description} &mdash; {formatCurrency(line.amount)}
            </p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 max-h-80 overflow-y-auto space-y-3">
          {(!suggestions || suggestions.length === 0) ? (
            <p className="text-dark-400 text-sm text-center py-6">No matching payments found.</p>
          ) : (
            suggestions.map((s) => (
              <div
                key={s._id || s.id}
                className="flex items-center justify-between bg-dark-800 border border-dark-700 rounded-lg p-3 hover:border-rivvra-500/50 transition-colors"
              >
                <div>
                  <p className="text-white text-sm font-medium">{s.reference || s.invoiceNumber || 'Payment'}</p>
                  <p className="text-dark-400 text-xs mt-0.5">
                    {formatDate(s.date)} &middot; {s.method || s.type || '-'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white text-sm font-medium">{formatCurrency(s.amount)}</span>
                  <button
                    onClick={() => onMatch(line._id || line.id, s._id || s.id)}
                    disabled={matching}
                    className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {matching ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                    Match
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-dark-700 flex justify-end">
          <button onClick={onClose} className="text-dark-400 hover:text-white text-sm transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Statement Row (expandable)
// ---------------------------------------------------------------------------

function StatementRow({ statement, orgSlug, showToast, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState({});
  const [matchLine, setMatchLine] = useState(null);
  const [matching, setMatching] = useState(false);

  const lines = statement.lines || [];
  const reconciledCount = lines.filter(l => l.reconciled).length;

  const handleGetSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await invoicingApi.getReconciliationSuggestions(orgSlug, statement._id || statement.id);
      const data = res.suggestions || res.data || res;
      const mapped = {};
      if (Array.isArray(data)) {
        data.forEach(s => {
          const lineId = s.lineId || s.line_id;
          if (lineId) {
            if (!mapped[lineId]) mapped[lineId] = [];
            mapped[lineId].push(s);
          }
        });
      } else if (typeof data === 'object') {
        Object.assign(mapped, data);
      }
      setSuggestions(mapped);
      showToast('Suggestions loaded');
    } catch (err) {
      showToast(err.message || 'Failed to get suggestions', 'error');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleMatch = async (lineId, paymentId) => {
    setMatching(true);
    try {
      await invoicingApi.reconcileLine(orgSlug, statement._id || statement.id, { lineId, paymentId });
      showToast('Line reconciled successfully');
      setMatchLine(null);
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to reconcile', 'error');
    } finally {
      setMatching(false);
    }
  };

  return (
    <>
      <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-dark-800/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            {expanded
              ? <ChevronDown size={18} className="text-dark-400" />
              : <ChevronRight size={18} className="text-dark-400" />
            }
            <Landmark size={18} className="text-rivvra-400" />
            <div>
              <p className="text-white font-medium">{statement.name || 'Untitled Statement'}</p>
              <p className="text-dark-400 text-xs mt-0.5">
                {formatDate(statement.date)} &middot; {reconciledCount}/{lines.length} lines reconciled
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-dark-400 text-xs">Start</p>
              <p className="text-white text-sm font-medium">{formatCurrency(statement.startBalance)}</p>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-dark-400 text-xs">End</p>
              <p className="text-white text-sm font-medium">{formatCurrency(statement.endBalance)}</p>
            </div>
            <StatusBadge status={statement.status} />
          </div>
        </button>

        {/* Expanded lines */}
        {expanded && (
          <div className="border-t border-dark-700">
            {/* Actions bar */}
            <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/30">
              <button
                onClick={handleGetSuggestions}
                disabled={loadingSuggestions}
                className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loadingSuggestions ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Get Suggestions
              </button>
              <span className="text-dark-500 text-xs">
                {reconciledCount} of {lines.length} lines reconciled
              </span>
            </div>

            {/* Lines table */}
            {lines.length === 0 ? (
              <div className="px-4 py-8 text-center text-dark-500 text-sm">
                No statement lines found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-700 text-dark-400 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5 font-medium">Date</th>
                      <th className="text-left px-4 py-2.5 font-medium">Description</th>
                      <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                      <th className="text-center px-4 py-2.5 font-medium">Status</th>
                      <th className="text-right px-4 py-2.5 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => {
                      const lineId = line._id || line.id || idx;
                      const isCredit = line.amount >= 0;
                      const lineSuggestions = suggestions[lineId] || [];

                      return (
                        <tr
                          key={lineId}
                          className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-dark-300">{formatDate(line.date)}</td>
                          <td className="px-4 py-3 text-white">{line.description || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-flex items-center gap-1 font-medium ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isCredit ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                              {formatCurrency(Math.abs(line.amount))}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {line.reconciled ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                                <CheckCircle2 size={14} />
                                Reconciled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-dark-500 text-xs">
                                <Clock size={14} />
                                Unreconciled
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!line.reconciled && (
                              <button
                                onClick={() => setMatchLine({ ...line, _id: lineId, _suggestions: lineSuggestions })}
                                className="text-rivvra-400 hover:text-rivvra-300 text-xs font-medium transition-colors flex items-center gap-1 ml-auto"
                              >
                                <Link2 size={13} />
                                Match
                                {lineSuggestions.length > 0 && (
                                  <span className="bg-rivvra-500/20 text-rivvra-400 rounded-full px-1.5 py-0.5 text-[10px] ml-1">
                                    {lineSuggestions.length}
                                  </span>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Match modal */}
      {matchLine && (
        <MatchModal
          line={matchLine}
          suggestions={matchLine._suggestions || []}
          onMatch={handleMatch}
          onClose={() => setMatchLine(null)}
          matching={matching}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BankReconciliation() {
  const { orgSlug } = useOrg();
  const { showToast } = useToast();

  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchStatements = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await invoicingApi.listBankStatements(orgSlug);
      setStatements(res.statements || res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load statements', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => {
    fetchStatements();
  }, [fetchStatements]);

  const handleCreateStatement = async (data) => {
    setSaving(true);
    try {
      await invoicingApi.createBankStatement(orgSlug, data);
      showToast('Statement created');
      setShowForm(false);
      fetchStatements();
    } catch (err) {
      showToast(err.message || 'Failed to create statement', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-900 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Bank Reconciliation</h1>
          <p className="text-dark-400 text-sm mt-1">
            Match bank statement lines with recorded payments
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 self-start"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Cancel' : 'New Statement'}
        </button>
      </div>

      {/* New statement form */}
      {showForm && (
        <NewStatementForm
          onSave={handleCreateStatement}
          onCancel={() => setShowForm(false)}
          saving={saving}
        />
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-7 h-7 text-rivvra-500 animate-spin" />
        </div>
      ) : statements.length === 0 ? (
        /* Empty state */
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-12 text-center">
          <Landmark className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <h3 className="text-white font-semibold text-lg mb-2">No bank statements yet</h3>
          <p className="text-dark-400 text-sm mb-6">
            Import or create a bank statement to start reconciling transactions.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <Plus size={16} />
            New Statement
          </button>
        </div>
      ) : (
        /* Statement list */
        <div className="space-y-4">
          {statements.map((stmt) => (
            <StatementRow
              key={stmt._id || stmt.id}
              statement={stmt}
              orgSlug={orgSlug}
              showToast={showToast}
              onRefresh={fetchStatements}
            />
          ))}
        </div>
      )}
    </div>
  );
}
