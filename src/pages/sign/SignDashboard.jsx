import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import {
  Loader2, FileText, Send, CheckCircle2, XCircle,
  LayoutTemplate, Plus, Upload, Clock, User,
} from 'lucide-react';

/* ── Status badge helper ──────────────────────────────────────────────── */
const STATUS_STYLES = {
  sent:      'bg-blue-500/10 text-blue-400',
  signed:    'bg-emerald-500/10 text-emerald-400',
  cancelled: 'bg-red-500/10 text-red-400',
  expired:   'bg-orange-500/10 text-orange-400',
  draft:     'bg-dark-700 text-dark-400',
  refused:   'bg-red-500/10 text-red-400',
};

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.draft;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

/* ── Stat Card ────────────────────────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, iconColor }) {
  return (
    <div className="bg-dark-900 rounded-xl p-6 border border-dark-800">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${iconColor}`}>
          <Icon size={20} />
        </div>
        <span className="text-sm text-dark-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

/* ── Main SignDashboard Component ──────────────────────────────────────── */
export default function SignDashboard() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, sent: 0, signed: 0, cancelled: 0 });
  const [templateCount, setTemplateCount] = useState(0);
  const [recentRequests, setRecentRequests] = useState([]);

  const fetchDashboard = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await signApi.getDashboard(orgSlug);
      if (res.success !== false) {
        setStats(res.stats || { total: 0, sent: 0, signed: 0, cancelled: 0 });
        setTemplateCount(res.templateCount || 0);
        setRecentRequests(res.recentRequests || []);
      } else {
        showToast('Failed to load dashboard data', 'error');
      }
    } catch {
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sign Dashboard</h1>
          <p className="text-dark-400 text-sm mt-1">
            Overview of your electronic signature requests
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(orgPath('/sign/templates'))}
            className="bg-dark-800 hover:bg-dark-700 text-dark-200 border border-dark-700 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Upload size={16} />
            Upload Template
          </button>
          <button
            onClick={() => navigate(orgPath('/sign/requests?create=true'))}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            New Request
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Requests"
          value={stats.total}
          icon={FileText}
          iconColor="bg-indigo-500/10 text-indigo-400"
        />
        <StatCard
          label="Pending (Sent)"
          value={stats.sent}
          icon={Send}
          iconColor="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label="Signed"
          value={stats.signed}
          icon={CheckCircle2}
          iconColor="bg-emerald-500/10 text-emerald-400"
        />
        <StatCard
          label="Templates"
          value={templateCount}
          icon={LayoutTemplate}
          iconColor="bg-purple-500/10 text-purple-400"
        />
      </div>

      {/* Recent Requests Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-white">Recent Requests</h2>
        </div>

        {recentRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-dark-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No requests yet</h3>
            <p className="text-dark-400 text-sm text-center max-w-sm">
              Create your first signature request to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-3 text-dark-400 font-medium">Document</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Signers</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Created</th>
                  <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Created By</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((req) => {
                  const totalSigners = req.signers?.length || 0;
                  const signedCount = req.signers?.filter((s) => s.state === 'completed').length || 0;

                  return (
                    <tr
                      key={req._id}
                      onClick={() => navigate(orgPath(`/sign/requests/${req._id}`))}
                      className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                            <FileText size={14} className="text-indigo-400" />
                          </div>
                          <span className="text-white font-medium truncate max-w-[200px]">
                            {req.reference || req.name || 'Untitled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.state} />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-dark-700 rounded-full h-1.5 w-20">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all"
                              style={{ width: totalSigners > 0 ? `${(signedCount / totalSigners) * 100}%` : '0%' }}
                            />
                          </div>
                          <span className="text-dark-400 text-xs whitespace-nowrap">
                            {signedCount}/{totalSigners}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-dark-400 text-xs hidden sm:table-cell">
                        {formatDate(req.createdAt)}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center">
                            <User size={12} className="text-dark-400" />
                          </div>
                          <span className="text-dark-300 text-xs truncate max-w-[120px]">
                            {req.createdByName || req.createdBy?.name || '\u2014'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
