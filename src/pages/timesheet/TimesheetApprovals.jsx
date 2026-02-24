import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, RotateCcw, Loader2 } from 'lucide-react';

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const statusColors = {
  'working': 'bg-emerald-500',
  'leave': 'bg-red-500',
  'holiday': 'bg-purple-500',
  'weekend': 'bg-dark-600',
};

export default function TimesheetApprovals() {
  const { showToast } = useToast();
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [filter, setFilter] = useState('submitted');

  const load = () => {
    setLoading(true);
    timesheetApi.get('/timesheets')
      .then(r => setTimesheets(r.data))
      .catch(() => showToast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    if (!window.confirm('Are you sure you want to approve this timesheet?')) return;
    try {
      await timesheetApi.patch(`/timesheets/${id}/approve`);
      showToast('Timesheet approved');
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Approval failed', 'error'); }
  };

  const handleRevert = async (id) => {
    if (!window.confirm('Revert this timesheet to draft?')) return;
    try {
      await timesheetApi.patch(`/timesheets/${id}/revert`);
      showToast('Timesheet reverted to draft');
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Revert failed', 'error'); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { showToast('Please provide a reason', 'error'); return; }
    try {
      await timesheetApi.patch(`/timesheets/${rejectId}/reject`, { rejectionReason: rejectReason.trim() });
      showToast('Timesheet rejected');
      setRejectId(null); setRejectReason('');
      load();
    } catch (err) { showToast(err.response?.data?.message || 'Rejection failed', 'error'); }
  };

  const filtered = timesheets.filter(t => filter === 'all' || t.status === filter);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-dark-400" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Timesheet Approvals</h1>
        <p className="text-dark-400 text-sm">Review and approve contractor timesheets</p>
      </div>

      <div className="flex gap-2">
        {['submitted', 'approved', 'draft', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-rivvra-500 text-dark-950' : 'bg-dark-800 border border-dark-700 text-dark-300 hover:bg-dark-700'
            }`}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({timesheets.filter(t => f === 'all' || t.status === f).length})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-dark-500">No timesheets found</div>
        ) : (
          filtered.map(ts => (
            <div key={ts._id} className="card">
              <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(expanded === ts._id ? null : ts._id)}>
                <div>
                  <p className="font-medium text-white">{ts.contractor?.fullName} — {monthNames[ts.month]} {ts.year}</p>
                  <p className="text-sm text-dark-400">{ts.project?.name} • {ts.client?.name} • {ts.totalHours || 0}h ({ts.totalWorkingDays} days)</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    ts.status === 'submitted' ? 'bg-amber-500/10 text-amber-400' :
                    ts.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-dark-700 text-dark-400'
                  }`}>{ts.status}</span>
                  {expanded === ts._id ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
                </div>
              </div>

              {expanded === ts._id && (
                <div className="border-t border-dark-800 p-4">
                  <div className="grid grid-cols-7 gap-1 mb-4">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i} className="text-center text-[10px] text-dark-500 font-medium">{d}</div>
                    ))}
                    {Array.from({ length: new Date(ts.year, ts.month - 1, 1).getDay() }).map((_, i) => <div key={`e-${i}`} />)}
                    {ts.entries?.map((entry, i) => {
                      const isWorking = entry.status === 'working';
                      const hours = entry.hours || 0;
                      return (
                        <div key={i} className="text-center">
                          <div className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-[9px] font-medium text-white ${
                            isWorking && hours > 8 ? 'bg-blue-500' :
                            isWorking && hours > 0 ? 'bg-emerald-500' :
                            statusColors[entry.status] || 'bg-dark-700'
                          }`} title={`${hours}h - ${entry.status}`}>
                            {isWorking ? hours : new Date(entry.date).getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 text-sm text-dark-300 mb-4">
                    <span>Hours: {ts.totalHours || 0}h</span>
                    <span>Days: {ts.totalWorkingDays}</span>
                    <span>Leaves: {ts.entries?.filter(e => e.status === 'leave').length || 0}</span>
                    <span>Holidays: {ts.entries?.filter(e => e.status === 'holiday').length || 0}</span>
                  </div>

                  {ts.status === 'submitted' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(ts._id)}
                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-400 flex items-center gap-2 transition-colors">
                        <CheckCircle2 size={16} /> Approve
                      </button>
                      <button onClick={() => setRejectId(ts._id)}
                        className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400 flex items-center gap-2 transition-colors">
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  )}

                  {ts.status === 'approved' && (
                    <button onClick={() => handleRevert(ts._id)}
                      className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-400 flex items-center gap-2 transition-colors">
                      <RotateCcw size={16} /> Revert to Draft
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {rejectId && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Reject Timesheet</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..."
              className="w-full bg-dark-800/50 border border-dark-700 rounded-lg p-3 text-sm text-white placeholder-dark-500 mb-4 min-h-[100px] outline-none focus:border-rivvra-500 focus:ring-2 focus:ring-rivvra-500/20" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejectId(null)} className="px-4 py-2 text-sm text-dark-400 hover:bg-dark-800 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleReject} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-400 transition-colors">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
