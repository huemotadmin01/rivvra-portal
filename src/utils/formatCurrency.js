// ============================================================================
// formatCurrency — shared currency formatter for all money display
// ============================================================================
//
// Usage:
//   import { formatCurrency } from '../utils/formatCurrency';
//   formatCurrency(1000, 'INR')  // "₹1,000.00"
//   formatCurrency(1000, 'USD')  // "$1,000.00"
//   formatCurrency(null, 'USD')  // "$0.00"
//
// Invoice currency precedence: invoice.currency (already inherited from
// contact.defaultCurrency → company.currency at creation time) is the
// authoritative source. Never couple this util to company — pass the
// record's own currency field.
//
// ============================================================================

export function formatCurrency(amount, currency = 'INR') {
  const cur = currency || 'INR';
  const num = amount == null ? 0 : Number(amount) || 0;
  const locale = cur === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 2,
  }).format(num);
}

export default formatCurrency;
