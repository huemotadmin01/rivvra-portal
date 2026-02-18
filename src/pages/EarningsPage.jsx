import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Clock } from 'lucide-react';

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function EarningsPage() {
  const [current, setCurrent] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [history, setHistory] = useState([]);
  const [disbursement, setDisbursement] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/earnings/current').then(r => setCurrent(r.data)).catch(err => {
        console.error('Failed to load current earnings:', err);
        toast.error('Failed to load current earnings');
      }),
      api.get('/earnings/previous').then(r => setPrevious(r.data)).catch(err => {
        console.error('Failed to load previous earnings:', err);
      }),
      api.get('/earnings/history').then(r => setHistory(r.data)).catch(err => {
        console.error('Failed to load earnings history:', err);
        toast.error('Failed to load earnings history');
      }),
      api.get('/earnings/disbursement-info').then(r => setDisbursement(r.data)).catch(err => {
        console.error('Failed to load disbursement info:', err);
      }),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const EarningsCard = ({ data, title }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-medium text-gray-500 mb-3">{title}</h3>
      {data ? (
        <>
          <p className="text-2xl font-bold text-gray-900">₹{(data.earnings?.grossAmount || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{data.earnings?.calculation}</p>
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Hours</span>
              <span className="font-medium text-gray-900">{data.breakdown?.totalHours || 0}h</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Working Days</span>
              <span className="font-medium text-gray-900">{data.breakdown?.totalWorkingDays || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Leaves</span>
              <span className="font-medium text-gray-900">{data.breakdown?.totalLeaves || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Holidays</span>
              <span className="font-medium text-gray-900">{data.breakdown?.totalHolidays || 0}</span>
            </div>
          </div>
          {data.timesheetStatus && (
            <div className={`mt-3 px-2 py-1 rounded text-xs font-medium inline-block ${
              data.timesheetStatus === 'approved' ? 'bg-green-100 text-green-700' :
              data.timesheetStatus === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {data.timesheetStatus}
            </div>
          )}
          {data.projectBreakdowns?.length > 1 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Per Project</p>
              {data.projectBreakdowns.map((pb, i) => (
                <div key={i} className="flex justify-between text-xs py-1">
                  <span className="text-gray-600">{pb.project}</span>
                  <span className="font-medium">{pb.totalHours || 0}h ({pb.workingDays} days)</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-gray-400">No data available</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Earnings</h1>
        <p className="text-gray-500 text-sm">Track your income and payment schedule</p>
      </div>

      {/* Current & Previous Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EarningsCard
          data={current}
          title={current ? `${monthNames[current.month]} ${current.year} (Current)` : 'Current Month'}
        />
        <EarningsCard
          data={previous}
          title={previous ? `${monthNames[previous.month]} ${previous.year} (Previous)` : 'Previous Month'}
        />
      </div>

      {/* Disbursement Schedule */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-accent" />
          <h3 className="font-semibold text-gray-900">Salary Disbursement Schedule</h3>
        </div>
        {disbursement?.nextDisbursementDate ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900">
                {new Date(disbursement.nextDisbursementDate).toLocaleDateString('en-IN', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                })}
              </p>
              {disbursement.countdown && (
                <p className="text-accent font-medium mt-1">{disbursement.countdown}</p>
              )}
              {disbursement.note && (
                <p className="text-sm text-gray-500 mt-1">{disbursement.note}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Estimated Amount</p>
              <p className="text-xl font-bold text-gray-900">₹{(disbursement.estimatedAmount || 0).toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-400">Disbursement schedule not configured</p>
        )}
      </div>

      {/* Earnings History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Earnings History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Month</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Hours</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Days</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Rate</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Earnings</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((h, i) => (
                <tr key={i} className={
                  h.paymentStatus === 'paid' ? 'bg-green-50/50' :
                  h.timesheetStatus === 'approved' ? 'bg-yellow-50/50' : ''
                }>
                  <td className="px-4 py-3 font-medium text-gray-900">{monthNames[h.month]} {h.year}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{h.totalHours || 0}h</td>
                  <td className="px-4 py-3 text-right text-gray-600">{h.totalWorkingDays}</td>
                  <td className="px-4 py-3 text-right text-gray-600">₹{(h.dailyRate || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">₹{(h.grossAmount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      h.timesheetStatus === 'approved' ? 'bg-green-100 text-green-700' :
                      h.timesheetStatus === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {h.timesheetStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${
                      h.paymentStatus === 'paid' ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {h.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
