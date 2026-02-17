import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { CheckCircle2, XCircle, Eye, ChevronDown, ChevronUp } from 'lucide-react';

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const statusColors = {
  'full-day': 'bg-green-500',
  'half-day': 'bg-yellow-400',
  'leave': 'bg-red-400',
  'holiday': 'bg-purple-400',
  'weekend': 'bg-gray-300',
};

export default function ApprovalPage() {
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [filter, setFilter] = useState('submitted');

  const load = () => {
    setLoading(true);
    api.get('/timesheets')
      .then(r => setTimesheets(r.data))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    try {
      await api.patch(`/timesheets/${id}/approve`);
      toast.success('Timesheet approved');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approval failed');
    }
  };

  const handleReject = async () => {
    try {
      await api.patch(`/timesheets/${rejectId}/reject`, { rejectionReason: rejectReason });
      toast.success('Timesheet rejected');
      setRejectId(null);
      setRejectReason('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Rejection failed');
    }
  };

  const filtered = timesheets.filter(t => filter === 'all' || t.status === filter);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Timesheet Approvals</h1>
        <p className="text-gray-500 text-sm">Review and approve contractor timesheets</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['submitted', 'approved', 'draft', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-accent text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({timesheets.filter(t => f === 'all' || t.status === f).length})
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            No timesheets found
          </div>
        ) : (
          filtered.map(ts => (
            <div key={ts._id} className="bg-white rounded-xl border border-gray-200">
              <div
                className="p-4 flex items-center justify-between cursor-pointer"
                onClick={() => setExpanded(expanded === ts._id ? null : ts._id)}
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {ts.contractor?.fullName} — {monthNames[ts.month]} {ts.year}
                  </p>
                  <p className="text-sm text-gray-500">
                    {ts.project?.name} • {ts.client?.name} • {ts.totalWorkingDays} days
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    ts.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                    ts.status === 'approved' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {ts.status}
                  </span>
                  {expanded === ts._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {expanded === ts._id && (
                <div className="border-t border-gray-100 p-4">
                  {/* Mini calendar */}
                  <div className="grid grid-cols-7 gap-1 mb-4">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i} className="text-center text-[10px] text-gray-400 font-medium">{d}</div>
                    ))}
                    {Array.from({ length: new Date(ts.year, ts.month - 1, 1).getDay() }).map((_, i) => (
                      <div key={`e-${i}`} />
                    ))}
                    {ts.entries?.map((entry, i) => (
                      <div key={i} className="text-center">
                        <div className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center text-[10px] text-white font-medium ${statusColors[entry.status] || 'bg-gray-200'}`}>
                          {new Date(entry.date).getDate()}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 text-sm text-gray-600 mb-4">
                    <span>Full: {ts.totalFullDays}</span>
                    <span>Half: {ts.totalHalfDays}</span>
                    <span>Total: {ts.totalWorkingDays}</span>
                  </div>

                  {ts.status === 'submitted' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(ts._id)}
                        className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600 flex items-center gap-2"
                      >
                        <CheckCircle2 size={16} /> Approve
                      </button>
                      <button
                        onClick={() => setRejectId(ts._id)}
                        className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 flex items-center gap-2"
                      >
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Reject Timesheet</h3>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full border border-gray-300 rounded-lg p-3 text-sm mb-4 min-h-[100px] outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejectId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleReject} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
