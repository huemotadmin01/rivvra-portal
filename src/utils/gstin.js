// ============================================================================
// gstin.js — client-side GSTIN validation (format + state code + checksum).
// Mirrors the backend helpers/gstinValidate.js so we can give instant inline
// feedback without a network round-trip. The GSTIN spec (and its mod-36 check
// digit) is fixed, so this won't drift.
// ============================================================================
const GSTIN_FORMAT_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;
const CODE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const VALID_STATE_CODES = new Set([
  ...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')),
  '97', '99',
]);

function computeCheckDigit(first14) {
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i--) {
    const cp = CODE.indexOf(first14[i]);
    if (cp < 0) return null;
    let addend = factor * cp;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / 36) + (addend % 36);
    sum += addend;
  }
  return CODE[(36 - (sum % 36)) % 36];
}

export function validateGstin(raw) {
  const gstin = String(raw || '').trim().toUpperCase();
  if (!gstin) return { ok: false, reason: 'empty', normalized: '' };
  if (!GSTIN_FORMAT_RE.test(gstin)) return { ok: false, reason: 'Invalid format (expected 15 chars, e.g. 22AAAAA0000A1Z5)', normalized: gstin };
  if (!VALID_STATE_CODES.has(gstin.slice(0, 2))) return { ok: false, reason: `Unknown state code "${gstin.slice(0, 2)}"`, normalized: gstin };
  if (computeCheckDigit(gstin.slice(0, 14)) !== gstin[14]) return { ok: false, reason: 'Checksum mismatch — likely a typo', normalized: gstin };
  return { ok: true, reason: null, normalized: gstin };
}
