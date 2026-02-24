import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import { Download, FileText, BarChart3, Loader2 } from 'lucide-react';

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TimesheetExport() {
  const { showToast } = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [reconciliation, setReconciliation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('export');

  const loadReconciliation = async () => {
    setLoading(true);
    try {
      const res = await timesheetApi.get('/timesheets/reconciliation', { params: { month, year } });
      setReconciliation(res.data);
    } catch (err) {
      showToast('Failed to load reconciliation', 'error');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = async (type) => {
    try {
      const endpoint = type === 'payroll' ? '/timesheets/export/payroll' : '/timesheets/export/invoice';
      const res = await timesheetApi.get(endpoint, { params: { month, year }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${month}_${year}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast(`${type === 'payroll' ? 'GreytHR' : 'Odoo'} CSV downloaded`);
    } catch (err) {
      showToast('Download failed', 'error');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Export & Reports</h1>

      {/* Month/Year Selector */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-1">Month</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="input-field w-auto">
            {monthNames.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-1">Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="input-field w-auto">
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('export')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
            tab === 'export' ? 'bg-rivvra-500 text-dark-950' : 'bg-dark-800 border border-dark-700 text-dark-300'
          }`}>
          <Download size={16} /> Export CSV
        </button>
        <button onClick={() => { setTab('reconciliation'); loadReconciliation(); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
            tab === 'reconciliation' ? 'bg-rivvra-500 text-dark-950' : 'bg-dark-800 border border-dark-700 text-dark-300'
          }`}>
          <BarChart3 size={16} /> Reconciliation
        </button>
      </div>

      {tab === 'export' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* GreytHR Payroll CSV */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <FileText size={20} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">GreytHR Payroll CSV</h3>
                <p className="text-xs text-dark-500">Employee payroll data for GreytHR import</p>
              </div>
            </div>
            <p className="text-sm text-dark-300 mb-4">
              Exports: Employee ID, Name, Working Days, Daily Rate, Total Payable
            </p>
            <button onClick={() => downloadCSV('payroll')}
              className="w-full bg-emerald-500 text-dark-950 py-2 rounded-lg text-sm font-medium hover:bg-emerald-400 flex items-center justify-center gap-2 transition-colors">
              <Download size={16} /> Download Payroll CSV
            </button>
          </div>

          {/* Odoo Invoice CSV */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <FileText size={20} className="text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Odoo Invoice CSV</h3>
                <p className="text-xs text-dark-500">Client billing data for Odoo import</p>
              </div>
            </div>
            <p className="text-sm text-dark-300 mb-4">
              Exports: Client, Project, Contractor, Working Days, Billing Rate, Billable Amount
            </p>
            <button onClick={() => downloadCSV('invoice')}
              className="w-full bg-blue-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-400 flex items-center justify-center gap-2 transition-colors">
              <Download size={16} /> Download Invoice CSV
            </button>
          </div>
        </div>
      )}

      {tab === 'reconciliation' && (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
            </div>
          ) : reconciliation ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-dark-800">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-dark-400">Contractor</th>
                    <th className="text-left px-4 py-3 font-medium text-dark-400">Project</th>
                    <th className="text-right px-4 py-3 font-medium text-dark-400">Days</th>
                    <th className="text-right px-4 py-3 font-medium text-dark-400">Payable</th>
                    <th className="text-right px-4 py-3 font-medium text-dark-400">Billable</th>
                    <th className="text-right px-4 py-3 font-medium text-dark-400">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {reconciliation.report?.map((r, i) => (
                    <tr key={i} className="hover:bg-dark-800/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">{r.contractor}</td>
                      <td className="px-4 py-3 text-dark-300">{r.project}</td>
                      <td className="px-4 py-3 text-right text-dark-300">{r.workingDays}</td>
                      <td className="px-4 py-3 text-right text-dark-300">₹{(r.contractorPayable || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-dark-300">₹{(r.clientBillable || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-400">₹{(r.margin || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-dark-800">
                  <tr>
                    <td colSpan="3" className="px-4 py-3 font-semibold text-white">Totals</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">₹{(reconciliation.totals?.totalContractorPayable || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">₹{(reconciliation.totals?.totalClientBillable || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-400">₹{(reconciliation.totals?.totalMargin || 0).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-dark-500">No data. Select month/year and load reconciliation.</div>
          )}
        </div>
      )}
    </div>
  );
}
