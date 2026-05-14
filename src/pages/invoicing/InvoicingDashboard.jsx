import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { Loader2, Plus, FileText } from 'lucide-react';

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

// All bill types share /invoicing/bills/new (the form reads journalId from
// the query). There is no /invoicing/employee-bills/new route.
function newUrlFor(journal) {
  const isBillJournal = journal.code === 'EMPBI' || journal.type === 'purchase';
  const base = isBillJournal ? '/invoicing/bills/new' : '/invoicing/invoices/new';
  return journal._id ? `${base}?journalId=${journal._id}` : base;
}

// Renders one sub-block of stats + a mini bar chart for a single currency
// inside a journal card. A journal with one currency shows exactly one of
// these (no header); a mixed-currency journal stacks multiple, each
// labelled with its ISO code.
function JournalCurrencyBlock({ row, journal, orgPath, navigate, showLabel }) {
  const { currency, notPaidCount = 0, notPaidAmount = 0, lateCount = 0, lateAmount = 0, draftCount = 0, draftAmount = 0, bars = [] } = row;
  const hasStats = notPaidCount > 0 || lateCount > 0 || draftCount > 0;
  const maxBar = Math.max(...bars.map((b) => b.amount), 1);
  const fmt = (amt) =>
    new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 2,
    }).format(amt || 0);

  return (
    <div>
      {showLabel && (
        <div className="text-[10px] font-medium text-dark-400 uppercase tracking-wider mb-1.5">
          {currency}
        </div>
      )}
      {hasStats && (
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-1">
            {notPaidCount > 0 && (
              <div
                className="text-sm cursor-pointer hover:underline"
                onClick={() => navigate(orgPath(listUrlFor(journal, { paymentStatus: 'not_paid' })))}
              >
                <span className="text-amber-400 font-medium">{notPaidCount} Not Paid</span>
              </div>
            )}
            {lateCount > 0 && (
              <div
                className="text-sm cursor-pointer hover:underline"
                onClick={() => navigate(orgPath(listUrlFor(journal, { overdue: 'true' })))}
              >
                <span className="text-red-400 font-medium">{lateCount} Late</span>
              </div>
            )}
            {draftCount > 0 && (
              <div
                className="text-sm cursor-pointer hover:underline"
                onClick={() => navigate(orgPath(listUrlFor(journal, { status: 'draft' })))}
              >
                <span className="text-dark-300 font-medium">{draftCount} Draft</span>
              </div>
            )}
          </div>
          <div className="text-right space-y-1">
            {notPaidCount > 0 && <div className="text-sm text-white font-medium">{fmt(notPaidAmount)}</div>}
            {lateCount > 0 && <div className="text-sm text-red-400">{fmt(lateAmount)}</div>}
            {draftCount > 0 && <div className="text-sm text-dark-400">{fmt(draftAmount)}</div>}
          </div>
        </div>
      )}

      {hasStats && bars.length > 0 && (
        <div>
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
                <span className="text-[10px] text-dark-400 leading-tight block">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JournalCard({ journal, orgPath, navigate }) {
  const { name, hasIrregularSequences = false } = journal;
  // New shape: journal.byCurrency = [{ currency, notPaidCount, ... }, ...].
  // The API drops zero-only rows already, so any row here is real activity.
  const rows = Array.isArray(journal.byCurrency) ? journal.byCurrency : [];
  const newPath = newUrlFor(journal);
  const showLabels = rows.length > 1;

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl p-5 hover:border-dark-600 transition-all group">
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

      {rows.length === 0 ? (
        <div className="text-sm text-dark-500 mt-1">No open invoices</div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <JournalCurrencyBlock
              key={row.currency}
              row={row}
              journal={journal}
              orgPath={orgPath}
              navigate={navigate}
              showLabel={showLabels}
            />
          ))}
        </div>
      )}

      {hasIrregularSequences && (
        <div className="text-xs text-red-400 mt-3">⚠ Irregular Sequences</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact card for "Other" journals (bank, cash, misc)
// ---------------------------------------------------------------------------

function CompactJournalCard({ journal, orgPath, navigate }) {
  const { name } = journal;
  const newPath = newUrlFor(journal);

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

function KPIStrip({ kpis }) {
  // Backward-compat: older API responses returned flat scalars (totalInvoiced
  // etc.) which silently summed across currencies. New API returns
  // kpis.byCurrency: [{ currency, totalInvoiced, ... }, ...]. Render one row
  // per currency; an empty array still renders nothing without crashing.
  const rows = Array.isArray(kpis?.byCurrency) ? kpis.byCurrency : [];
  if (rows.length === 0) {
    return <p className="text-sm text-dark-500">No invoicing activity yet.</p>;
  }

  const cells = [
    { key: 'totalInvoiced', label: 'Total Invoiced', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { key: 'totalCollected', label: 'Collected', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { key: 'totalOutstanding', label: 'Outstanding', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { key: 'totalOverdue', label: 'Overdue', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  ];

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.currency}>
          {rows.length > 1 && (
            <div className="text-xs font-medium text-dark-400 uppercase tracking-wider mb-1.5">
              {row.currency}
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cells.map((cell) => (
              <div key={cell.key} className={`rounded-xl border p-4 ${cell.bg}`}>
                <span className="text-xs font-medium opacity-70 uppercase tracking-wider block mb-1">
                  {cell.label}
                </span>
                <p className={`text-xl font-bold ${cell.color}`}>
                  {formatCurrency(row[cell.key] || 0, row.currency)}
                </p>
              </div>
            ))}
          </div>
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
        // Reset state on every company switch so stale numbers from the
        // previous company never linger if the new fetches return nothing.
        setJournals(statsRes?.success && statsRes.journalStats ? statsRes.journalStats : []);
        setKpis(dashRes?.success && dashRes.kpis ? dashRes.kpis : null);
        if (!statsRes?.success && !dashRes?.success) {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orgSlug, currentCompany?._id]);

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

  const cardProps = { orgPath, navigate };

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
        {kpis && (
          <div>
            <SectionHeader title="Customer Invoices Summary" />
            <KPIStrip kpis={kpis} />
          </div>
        )}

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
