// ============================================================================
// currency.js — Currency formatting helpers (frontend)
// ============================================================================
//
// CRM / invoicing / dashboards used to hardcode ₹ and 'en-IN' across many
// pages. With Huemot operating in INR today and Gagstek/Zenzart on the
// horizon (potentially USD/CAD), that hardcoding either silently
// mis-labels foreign-currency rows or forces every page to repeat the
// same lookup. This module is the single source of truth for: which
// symbol goes with which ISO code, and how to format an amount.
//
// Per-row amounts: pass the doc's own `currency` field.
//   formatMoney(opp.expectedRevenue, opp.currency)
//
// Aggregates / totals where there's no per-row currency: pass the active
// company's currency (from CompanyContext).
//   formatMoney(totalRevenue, currentCompany?.currency)
//
// Falls back to '₹' / 'en-IN' if neither is provided — matches the
// existing visual default so the change is non-breaking on Huemot.
// ============================================================================

const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  CAD: 'CA$',
  AUD: 'A$',
  SGD: 'S$',
  EUR: '€',
  GBP: '£',
  AED: 'AED ',
};

const CURRENCY_LOCALES = {
  INR: 'en-IN',
  USD: 'en-US',
  CAD: 'en-CA',
  AUD: 'en-AU',
  SGD: 'en-SG',
  EUR: 'en-IE',
  GBP: 'en-GB',
  AED: 'en-AE',
};

export function currencySymbol(code) {
  if (!code) return '₹';
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

export function currencyLocale(code) {
  return CURRENCY_LOCALES[code] || 'en-IN';
}

/**
 * Format a numeric amount with the right symbol + locale grouping.
 * Returns '—' for null/undefined/empty input so callers can use it
 * unconditionally in JSX without their own conditional logic.
 */
export function formatMoney(value, code) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return `${currencySymbol(code)}${num.toLocaleString(currencyLocale(code))}`;
}
