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

// formatMoney — for dense payroll/finance tables.
//
// Same symbol and grouping as formatCurrency, but paise are shown ONLY when the
// value actually has them. Payroll screens list dozens of rows side by side and
// a column of trailing ".00" is pure noise that makes real paise harder to spot.
// Nothing is rounded away: a value with paise still prints them in full, so the
// figure on screen always equals the stored figure.
//
//   formatMoney(1573481)      // "₹15,73,481"
//   formatMoney(1573481.12)   // "₹15,73,481.12"
//   formatMoney(null)         // "₹0"
export function formatMoney(amount, currency = 'INR') {
  const cur = currency || 'INR';
  const num = amount == null ? 0 : Number(amount) || 0;
  const locale = cur === 'INR' ? 'en-IN' : 'en-US';
  // Round to paise first so floating-point dust (…0000001) doesn't count as paise.
  const hasPaise = Math.abs(Math.round(num * 100) - Math.round(num) * 100) > 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(num);
}

// Returns just the currency symbol (e.g. '₹', '$', '€'). Falls back to the
// ISO code if Intl can't resolve a symbol for the locale (rare).
export function currencySymbol(currency = 'INR') {
  const cur = currency || 'INR';
  try {
    const parts = new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: cur,
    }).formatToParts(0);
    return parts.find(p => p.type === 'currency')?.value || cur;
  } catch {
    return cur;
  }
}

export default formatCurrency;
