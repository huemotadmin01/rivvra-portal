// ============================================================================
// RecordsList.jsx — Admin-facing list of all incentive records with filters
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import incentiveApi from '../../utils/incentiveApi';
import MonthPicker from '../../components/incentive/MonthPicker';
import { Loader2, Plus, Search, Download } from 'lucide-react';

function formatINR(amount) {
  if (amount == null) return '\u20B90';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const STATUS_STYLE = {
  draft: 'bg-dark-800 text-dark-300',
  approved: 'bg-blue-950 text-blue-300',
  paid: 'bg-emerald-950 text-emerald-300',
  cancelled: 'bg-red-950 text-red-300',
};

export default function RecordsList() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    payoutMonth: '',
    search: '',
  });

  async function onExport() {
    setExporting(true);
    try {
      await incentiveApi.exportRecordsCsv(orgSlug, {
        scope: 'admin',
        status: filters.status || undefined,
        payoutMonth: filters.payoutMonth || undefined,
        search: filters.search || undefined,
      });
    } catch (e) {
      console.error('Export failed', e);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, filters.status, filters.payoutMonth]);

  async function load() {
    setLoading(true);
    try {
      const res = await incentiveApi.listRecords(orgSlug, {
        scope: 'admin',
        status: filters.status || undefined,
        payoutMonth: filters.payoutMonth || undefined,
      });
      setRecords(res?.records || res || []);
    } catch (e) {
      console.error('Failed to load records', e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = records.filter((r) => {
    if (!filters.search) return true;
    const q = filters.search.toLowerCase();
    return (
      r.clientName?.toLowerCase().includes(q) ||
      r.consultantName?.toLowerCase().includes(q) ||
      r.recruiterName?.toLowerCase().includes(q) ||
      r.accountManagerName?.toLowerCase().includes(q) ||
      r.invoiceNumber?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Incentive Records</h1>
          <p className="text-sm text-dark-400 mt-1">
            All Recruiter / AM commission entries
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExport}
            disabled={exporting}
            className="bg-dark-800 hover:bg-dark-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Export CSV
          </button>
          <button
            onClick={() => navigate(orgPath('/incentive/records/new'))}
            className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          >
            <Plus size={16} /> New Record
          </button>
        </div>
      </div>

      <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[220px] relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500"
          />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search client, consultant, recruiter, invoice #…"
            className="w-full bg-dark-850 border border-dark-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white"
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="bg-dark-850 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <MonthPicker
          value={filters.payoutMonth}
          onChange={(v) => setFilters((f) => ({ ...f, payoutMonth: v }))}
          placeholder="Any payout month"
        />
      </div>

      <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-dark-500" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-dark-400 text-sm">
            No records match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-850 text-dark-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Invoice</th>
                  <th className="text-left px-4 py-2 font-medium">Client</th>
                  <th className="text-left px-4 py-2 font-medium">Consultant</th>
                  <th className="text-left px-4 py-2 font-medium">Recruiter</th>
                  <th className="text-left px-4 py-2 font-medium">AM</th>
                  <th className="text-right px-4 py-2 font-medium">Net Profit</th>
                  <th className="text-right px-4 py-2 font-medium">Incentive</th>
                  <th className="text-left px-4 py-2 font-medium">Payout</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r._id}
                    className="border-t border-dark-800 hover:bg-dark-850 cursor-pointer transition-colors"
                    onClick={() => navigate(orgPath(`/incentive/records/${r._id}`))}
                  >
                    <td className="px-4 py-2 text-white">
                      {r.invoiceNumber || '—'}
                    </td>
                    <td className="px-4 py-2 text-dark-300">{r.clientName || '—'}</td>
                    <td className="px-4 py-2 text-dark-300">
                      {r.consultantName || '—'}
                    </td>
                    <td className="px-4 py-2 text-dark-300">
                      {r.recruiterName || '—'}
                    </td>
                    <td className="px-4 py-2 text-dark-300">
                      {r.accountManagerName || '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-dark-300">
                      {formatINR(r.netProfit)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-white">
                      {formatINR(
                        (r.recruiterIncentive || 0) +
                          (r.accountManagerIncentive || 0)
                      )}
                    </td>
                    <td className="px-4 py-2 text-dark-300">
                      {r.payoutMonth || '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          STATUS_STYLE[r.status] || 'bg-dark-800 text-dark-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
