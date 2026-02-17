import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Download, FileText, BarChart3 } from 'lucide-react';

const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ExportPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [reconciliation, setReconciliation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('export');

  const loadReconciliation = async () => {
    setLoading(true);
    try {
      const res = await api.get('/timesheets/reconciliation', { params: { month, year } });
      setReconciliation(res.data);
    } catch (err) {
      toast.error('Failed to load reconciliation');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = async (type) => {
    try {
      const endpoint = type === 'payroll' ? '/timesheets/export/payroll' : '/timesheets/export/invoice';
      const res = await api.get(endpoint, { params: { month, year }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${month}_${year}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`${type === 'payroll' ? 'GreytHR' : 'Odoo'} CSV downloaded`);
    } catch (err) {
      toast.error('Download failed');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Export & Reports</h1>

      {/* Month/Year Selector */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900">
            {monthNames.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900">
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('export')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${tab === 'export' ? 'bg-accent text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          <Download size={16} /> Export CSV
        </button>
        <button onClick={() => { setTab('reconciliation'); loadReconciliation(); }} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${tab === 'reconciliation' ? 'bg-accent text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          <BarChart3 size={16} /> Reconciliation
        </button>
      </div>

      {tab === 'export' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <FileText size={20} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">GreytHR Payroll CSV</h3>
                <p className="text-xs text-gray-500">Employee payroll data for GreytHR import</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Exports: Employee ID, Name, Working Days, Daily Rate, Total Payable
            </p>
            <button onClick={() => downloadCSV('payroll')}
              className="w-full bg-green-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-600 flex items-center justify-center gap-2">
              <Download size={16} /> Download Payroll CSV
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Odoo Invoice CSV</h3>
                <p className="text-xs text-gray-500">Client billing data for Odoo import</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Exports: Client, Project, Contractor, Working Days, Billing Rate, Billable Amount
            </p>
            <button onClick={() => downloadCSV('invoice')}
              className="w-full bg-blue-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-600 flex items-center justify-center gap-2">
              <Download size={16} /> Download Invoice CSV
            </button>
          </div>
        </div>
      )}

      {tab === 'reconciliation' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? <LoadingSpinner /> : reconciliation ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Contractor</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Project</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Days</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Payable</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Billable</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reconciliation.report?.map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 font-medium text-gray-900">{r.contractor}</td>
                        <td className="px-4 py-3 text-gray-600">{r.project}</td>
                        <td className="px-4 py-3 text-right">{r.workingDays}</td>
                        <td className="px-4 py-3 text-right">₹{(r.contractorPayable || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">₹{(r.clientBillable || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-medium text-green-600">₹{(r.margin || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan="3" className="px-4 py-3 font-semibold text-gray-900">Totals</td>
                      <td className="px-4 py-3 text-right font-semibold">₹{(reconciliation.totals?.totalContractorPayable || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold">₹{(reconciliation.totals?.totalClientBillable || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">₹{(reconciliation.totals?.totalMargin || 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-gray-400">No data. Select month/year and load reconciliation.</div>
          )}
        </div>
      )}
    </div>
  );
}
