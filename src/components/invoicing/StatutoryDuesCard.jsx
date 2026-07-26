// ============================================================================
// StatutoryDuesCard — upcoming/overdue GST & TDS deadlines (India companies).
// Self-fetching and self-hiding: renders nothing for non-INR companies, on
// error, or when every recent period is already filed. Used on the Invoicing
// dashboard and as a strip on the Follow-ups page.
// ============================================================================
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { CalendarClock, ChevronRight } from 'lucide-react';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function StatutoryDuesCard() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  const isIndia = currentCompany?.currency === 'INR';

  useEffect(() => {
    if (!orgSlug || !isIndia) { setItems(null); return; }
    let cancelled = false;
    invoicingApi.getStatutoryDues(orgSlug)
      .then((res) => { if (!cancelled) setItems(res.data?.items || []); })
      .catch(() => { if (!cancelled) setItems(null); });
    return () => { cancelled = true; };
  }, [orgSlug, isIndia, currentCompany?._id]);

  if (!isIndia || !items || items.length === 0) return null;

  const target = (kind) => orgPath(kind.startsWith('tds') ? '/invoicing/reports/tds' : '/invoicing/reports/tax');

  return (
    <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-dark-700 flex items-center gap-2.5">
        <CalendarClock size={16} className="text-amber-400" />
        <h3 className="text-sm font-semibold text-white flex-1">Statutory dues</h3>
        <span className="text-[11px] text-dark-400">GST &amp; TDS</span>
      </div>
      <div className="divide-y divide-dark-700/50">
        {items.map((it, i) => {
          const overdue = it.status === 'overdue';
          const due = new Date(it.dueDate);
          return (
            <button key={i} onClick={() => navigate(target(it.kind))}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-dark-800/60 transition-colors text-left">
              <span className={`w-2 h-2 rounded-full shrink-0 ${overdue ? 'bg-red-400' : 'bg-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">
                  {it.label} · {MONTH_ABBR[it.month - 1]} {it.year}
                </p>
                <p className={`text-xs ${overdue ? 'text-red-400' : 'text-dark-400'}`}>
                  {overdue ? 'Overdue — was due ' : 'Due '}
                  {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              {it.amount != null && (
                <span className="text-sm font-semibold text-amber-400 tabular-nums">{formatCurrency(it.amount, 'INR')}</span>
              )}
              <ChevronRight size={14} className="text-dark-500 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
