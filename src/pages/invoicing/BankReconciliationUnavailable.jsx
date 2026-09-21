// Stands in for Bank Reconciliation while it cannot work.
//
// 2026-09-21: the real page (BankReconciliationV2) is kept but no longer
// routed. It could not complete a single match: the suggestions response wraps
// each statement line's matches in `{ lineId, matches: [...] }`, and the page
// pushed the WRAPPER instead of its contents, so every row rendered
// "Payment / Invalid Date / ₹0.00" and every Match click sent
// `paymentId: undefined`, which the server rejects. Nothing in the UI could
// create a statement line either. Two independent audits found this.
//
// Rather than send a bookmark to a page that looks functional and is not, the
// old URL lands here. To restore, once matching genuinely works end to end:
//   1. App.jsx — re-add the BankReconciliationV2 lazy import and point the
//      /invoicing/reconciliation route back at it
//   2. config/apps.jsx — re-add the nav item (and the Landmark icon import)
// The page file itself was left untouched.
import { Landmark } from 'lucide-react';
import { EmptyState } from '../../components/ds';

export default function BankReconciliationUnavailable() {
  return (
    <div style={{ maxWidth: 640, margin: '48px auto' }}>
      <EmptyState icon={<Landmark size={28} />} title="Bank reconciliation isn't available yet">
        Matching bank statement lines to recorded payments is being rebuilt, so
        it's switched off for now. Your payments and invoices are unaffected —
        record payments against each invoice as usual in the meantime.
      </EmptyState>
    </div>
  );
}
