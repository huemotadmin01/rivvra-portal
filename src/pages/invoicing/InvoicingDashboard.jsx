import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { Loader2, Plus, FileText } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount, currency = 'INR') {
  const cur = currency || 'INR';
  const locale = cur === 'INR' ? 'en-IN' : 'en-US';
  if (amount == null) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(0);
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 2,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Journal Card (Odoo-style)
// ---------------------------------------------------------------------------

// Maps a journal to the correct list page. Vendor/employee bills live on
// their own routes; everything else (sale/bank/cash/misc) stays on /invoices.
function listBaseFor(journal) {
  if (journal.code === 'EMPBI') return '/invoicing/employee-bills';
  if (journal.type === 'purchase') return '/invoicing/bills';
  return '/invoicing/invoices';
}

function listUrlFor(journal, params = {}) {
  const base = listBaseFor(journal);
  const usesJournalCode = base === '/invoicing/invoices';
  const qs = new URLSearchParams();
  if (usesJournalCode && journal.code) qs.set('journalCode', journal.code);
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}

function JournalCard({ journal, orgSlug, orgPath, navigate }) {
  const {
    name,
    code,
    type,
    _id,
    unpaidCount = 0,
    unpaidAmount = 0,
    lateCount = 0,
    lateAmount = 0,
    bars = [],
    currency,
    draftCount = 0,
    draftAmount = 0,
    hasIrregularSequences = false,
  } = journal;

  const hasStats = unpaidCount > 0 || lateCount > 0 || draftCount > 0;
  const maxBar = Math.max(...bars.map((b) => b.amount), 1);

  const fmtAmount = (amt) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 2,
    }).format(amt);

  const newPath =
    listBaseFor(journal) === '/invoicing/invoices'
      ? `/invoicing/invoices/new?journalId=${_id}`
      : `${listBaseFor(journal)}/new?journalId=${_id}`;

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl p-5 hover:border-dark-600 transition-all group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <h3
          className="text-rivvra-500 font-semibold text-base cursor-pointer hover:underline leading-tight"
          onClick={() => navigate(orgPath(listUrlFor(journal)))}
        >
          {name}
        </h3>
        <button
          onClick={() => navigate(orgPath(newPath))}
          className="bg-rivvra-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-rivvra-600 transition-colors shrink-0 ml-3"
        >
          New
        </button>
      </div>

      {/* Stats rows */}
      {hasStats && (
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-1">
            {unpaidCount > 0 && (
              <div
                className="text-sm cursor-pointer hover:underline"
                onClick={() =>
                  navigate(orgPath(listUrlFor(journal, { status: 'sent' })))
                }
              >
                <span className="text-amber-400 font-medium">
                  {unpaidCount} Unpaid
                </span>
              </div>
            )}
            {lateCount > 0 && (
              <div
                className="text-sm cursor-pointer hover:underline"
                onClick={() =>
                  navigate(orgPath(listUrlFor(journal, { status: 'overdue' })))
                }
              >
                <span className="text-red-400 font-medium">
                  {lateCount} Late
                </span>
              </div>
            )}
            {draftCount > 0 && (
              <div
                className="text-sm cursor-pointer hover:underline"
                onClick={() =>
                  navigate(orgPath(listUrlFor(journal, { status: 'draft' })))
                }
              >
                <span className="text-dark-300 font-medium">
                  {draftCount} Draft
                </span>
              </div>
            )}
          </div>
          <div className="text-right space-y-1">
            {unpaidCount > 0 && (
              <div className="text-sm text-white font-medium">
                {fmtAmount(unpaidAmount)}
              </div>
            )}
            {lateCount > 0 && (
              <div className="text-sm text-red-400">
                {fmtAmount(lateAmount)}
              </div>
            )}
            {draftCount > 0 && (
              <div className="text-sm text-dark-400">
                {fmtAmount(draftAmount)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Irregular sequences warning */}
      {hasIrregularSequences && (
        <div className="text-xs text-red-400 mt-2">⚠ Irregular Sequences</div>
      )}

      {/* Mini bar chart */}
      {hasStats && bars.length > 0 && (
        <div className="mt-3">
          <div className="flex items-end gap-2 mb-1" style={{ height: 64 }}>
            {bars.map((bar, i) => {
              const pct = maxBar > 0 ? bar.amount / maxBar : 0;
              const h = Math.max(4, Math.round(pct * 56));
              const hasValue = bar.amount > 0;
              return (
                <div key={i} className="flex-1">
                  <div
                    className={`w-full rounded-t ${hasValue ? 'bg-teal-500/70' : 'bg-dark-700'}`}
                    style={{ height: h, marginTop: 64 - h }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            {bars.map((bar, i) => (
              <div key={i} className="flex-1 text-center">
                <span className="text-[10px] text-dark-400 leading-tight block">
                  {bar.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasStats && (
        <div className="text-sm text-dark-500 mt-1">No open invoices</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact card for "Other" journals (bank, cash, misc)
// ---------------------------------------------------------------------------

function CompactJournalCard({ journal, orgPath, navigate }) {
  const { name, _id } = journal;

  const newPath =
    listBaseFor(journal) === '/invoicing/invoices'
      ? `/invoicing/invoices/new?journalId=${_id}`
      : `${listBaseFor(journal)}/new?journalId=${_id}`;

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl p-4 hover:border-dark-600 transition-all flex items-center justify-between">
      <h3
        className="text-rivvra-500 font-medium text-sm cursor-pointer hover:underline truncate"
        onClick={() => navigate(orgPath(listUrlFor(journal)))}
      >
        {name}
      </h3>
      <button
        onClick={() => navigate(orgPath(newPath))}
        className="bg-dark-700 text-dark-300 text-xs px-2.5 py-1 rounded-lg hover:bg-dark-600 transition-colors shrink-0 ml-3"
      >
        New
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }) {
  return (
    <h2 className="text-sm font-semibold text-dark-200 uppercase tracking-wider mb-3">
      {title}
    </h2>
  );
}

// ---------------------------------------------------------------------------
// KPI strip (top-level numbers)
// ---------------------------------------------------------------------------

function KPIStrip({ kpis, currency }) {
  const items = [
    { label: 'Total Invoiced', value: kpis.totalInvoiced, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: 'Collected', value: kpis.totalCollected, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Outstanding', value: kpis.totalOutstanding, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { label: 'Overdue', value: kpis.totalOverdue, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-xl border p-4 ${item.bg}`}
        >
          <span className="text-xs font-medium opacity-70 uppercase tracking-wider block mb-1">
            {item.label}
          </span>
          <p className={`text-xl font-bold ${item.color}`}>
            {formatCurrency(item.value || 0, currency)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function InvoicingDashboard() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const navigate = useNavigate();
  const companyCurrency = currentCompany?.currency || 'INR';

  const [journals, setJournals] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!orgSlug) return;
    setLoading(true);
    setError(false);

    Promise.all([
      invoicingApi.getJournalStats(orgSlug).catch(() => null),
      invoicingApi.getDashboard(orgSlug).catch(() => null),
    ])
      .then(([statsRes, dashRes]) => {
        if (statsRes?.success && statsRes.journalStats) {
          setJournals(statsRes.journalStats);
        }
        if (dashRes?.success && dashRes.kpis) {
          setKpis(dashRes.kpis);
        }
        if (!statsRes?.success && !dashRes?.success) {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  // ---------- Loading ----------
  if (loading) {
    return (
      <div className="bg-dark-900 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-dark-400 animate-spin" />
      </div>
    );
  }

  // ---------- Error / empty ----------
  if (error && journals.length === 0) {
    return (
      <div className="bg-dark-900 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <FileText size={40} className="text-dark-600 mx-auto mb-3" />
          <p className="text-dark-500 text-sm">
            Unable to load dashboard data.
          </p>
        </div>
      </div>
    );
  }

  // ---------- Group journals by type (Odoo ordering) ----------
  const purchaseJournals = journals.filter((j) => j.type === 'purchase');
  const bankJournals = journals.filter(
    (j) => j.type === 'bank' || j.type === 'cash'
  );
  const saleJournals = journals.filter((j) => j.type === 'sale');
  const otherJournals = journals.filter(
    (j) =>
      j.type !== 'sale' &&
      j.type !== 'purchase' &&
      j.type !== 'bank' &&
      j.type !== 'cash'
  );

  // Top row: purchase + bank journals combined (like Odoo shows Vendor Bills, Bank, Employee Bills together)
  const topRowJournals = [...purchaseJournals, ...bankJournals];

  const cardProps = { orgSlug, orgPath, navigate };

  return (
    <div className="bg-dark-900 min-h-screen">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Invoicing</h1>
            <p className="text-xs text-dark-400 mt-0.5">Dashboard</p>
          </div>
          <button
            onClick={() => navigate(orgPath('/invoicing/invoices/new'))}
            className="bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus size={14} />
            New Invoice
          </button>
        </div>

        {/* ---- KPI Strip ---- */}
        {kpis && <KPIStrip kpis={kpis} currency={companyCurrency} />}

        {/* ---- Top row: Purchase + Bank journals ---- */}
        {topRowJournals.length > 0 && (
          <div>
            <SectionHeader title="Bills & Banking" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {topRowJournals.map((j) => (
                <JournalCard key={j._id} journal={j} {...cardProps} />
              ))}
            </div>
          </div>
        )}

        {/* ---- Sale journals (main grid) ---- */}
        {saleJournals.length > 0 && (
          <div>
            <SectionHeader title="Customer Invoices" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {saleJournals.map((j) => (
                <JournalCard key={j._id} journal={j} {...cardProps} />
              ))}
            </div>
          </div>
        )}

        {/* ---- Other journals (compact row) ---- */}
        {otherJournals.length > 0 && (
          <div>
            <SectionHeader title="Other" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {otherJournals.map((j) => (
                <CompactJournalCard
                  key={j._id}
                  journal={j}
                  orgPath={orgPath}
                  navigate={navigate}
                />
              ))}
            </div>
          </div>
        )}

        {/* ---- Completely empty state ---- */}
        {journals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-dark-500">
            <FileText size={48} className="mb-4 opacity-30" />
            <p className="text-base font-medium text-dark-400">
              No journals found
            </p>
            <p className="text-sm mt-1 opacity-60">
              Create journals to start managing invoices
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
