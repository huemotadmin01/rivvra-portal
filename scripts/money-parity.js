/**
 * money-parity.js — prove a migrated page renders identical money.
 *
 * Paste into the browser console on the page under test. Capture once with the
 * legacy component routed, once with the v2 one, against the SAME data, then
 * diff. The claim "the numbers didn't change" becomes evidence rather than an
 * assertion — which is the bar for any page that prints salary, a settlement
 * or an invoice total.
 *
 *   __money.capture('legacy')     // with PageSwitch pointed at the legacy page
 *   __money.capture('v2')         // after flipping it to the v2 page
 *   __money.diff()                // → { ok: true } or the first mismatch
 *
 * Order matters as much as the values: a page that renders the right figures
 * in the wrong cells is still wrong, and comparing sorted sets would hide it.
 *
 * Deliberately matches on the RENDERED STRING, not the underlying number.
 * Formatting is the thing most likely to drift in a layout pass — a lakh
 * grouping lost, a symbol swapped, a currency defaulted to the company's
 * instead of the record's — and all of those leave the number intact.
 */
(function () {
  // ₹1,23,456.78 · $1,234 · €99 · ~ 1,23,456 (the CRM unspecified-currency
  // form) · USD 1,234 · 12.5%  — percentages included because a dashboard's
  // rates sit beside its money and drift the same way.
  const MONEY = /(?:[₹$€£¥]|~)\s?[\d,]+(?:\.\d+)?|\b[A-Z]{3}\s?[\d,]+(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?%/g;

  const store = {};

  function read() {
    // textContent, not innerText: innerText returns '' when the pane is
    // hidden because it needs layout.
    const t = document.body.textContent || '';
    return t.match(MONEY) || [];
  }

  window.__money = {
    capture(label) {
      store[label] = read();
      return { label, count: store[label].length, values: store[label] };
    },
    diff(a = 'legacy', b = 'v2') {
      const x = store[a], y = store[b];
      if (!x || !y) return { ok: false, error: `capture both '${a}' and '${b}' first` };
      if (x.length !== y.length) {
        return { ok: false, reason: 'count', [a]: x.length, [b]: y.length, onlyIn: x.length > y.length ? a : b };
      }
      for (let i = 0; i < x.length; i++) {
        if (x[i] !== y[i]) return { ok: false, reason: 'value', index: i, [a]: x[i], [b]: y[i] };
      }
      return { ok: true, count: x.length, values: x };
    },
    dump: () => store,
  };
  return 'money-parity ready — __money.capture("legacy") / .capture("v2") / .diff()';
})();
