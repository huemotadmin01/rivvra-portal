/**
 * Country-aware address labels + soft ZIP validation.
 *
 * Driven by the record's own `address.country` — NOT the company switcher.
 * Rationale: a US-incorporated company can employ an Indian hire whose
 * home address is in Bengaluru. What matters for labelling the street /
 * postal-code fields is where the address *is*, not which book we're
 * billing from.
 *
 * Usage:
 *   import { getAddressLocale, validateZip } from '../utils/addressLocale';
 *   const locale = getAddressLocale(emp.address?.country);
 *   <InlineField label={locale.zipLabel} placeholder={locale.zipPlaceholder}
 *                warn={validateZip(emp.address?.zip, emp.address?.country)} />
 *
 * Everything the util returns is additive metadata — no caller is required
 * to use any field, so wiring it in is purely presentation-layer. Country
 * detection falls back to the universal defaults whenever we don't
 * recognise the country string.
 */

const UNIVERSAL = {
  countryCode: null,
  countryDisplay: '',
  street1Label: 'Street',
  street1Placeholder: '',
  street2Label: 'Street 2',
  street2Placeholder: 'Apt, Suite, Floor',
  cityLabel: 'City',
  cityPlaceholder: '',
  stateLabel: 'State',
  statePlaceholder: '',
  zipLabel: 'Postal Code',
  zipPlaceholder: '',
  zipPattern: null,
  zipHint: '',
};

const LOCALES = {
  IN: {
    ...UNIVERSAL,
    countryCode: 'IN',
    countryDisplay: 'India',
    street1Placeholder: '123 MG Road',
    cityPlaceholder: 'Bengaluru',
    stateLabel: 'State',
    statePlaceholder: 'Karnataka',
    zipLabel: 'PIN Code',
    zipPlaceholder: '560001',
    zipPattern: /^\d{6}$/,
    zipHint: 'PIN code is usually 6 digits (e.g. 560001)',
  },
  US: {
    ...UNIVERSAL,
    countryCode: 'US',
    countryDisplay: 'United States',
    street1Placeholder: '1600 Amphitheatre Pkwy',
    street2Placeholder: 'Apt, Suite, Unit',
    cityPlaceholder: 'Mountain View',
    stateLabel: 'State',
    statePlaceholder: 'CA',
    zipLabel: 'ZIP Code',
    zipPlaceholder: '94043',
    zipPattern: /^\d{5}(-\d{4})?$/,
    zipHint: 'ZIP is usually 5 digits (94043) or ZIP+4 (94043-1351)',
  },
  CA: {
    ...UNIVERSAL,
    countryCode: 'CA',
    countryDisplay: 'Canada',
    street1Placeholder: '100 Queen St W',
    cityPlaceholder: 'Toronto',
    stateLabel: 'Province',
    statePlaceholder: 'ON',
    zipLabel: 'Postal Code',
    zipPlaceholder: 'M5H 2N2',
    // Canadian postcode — FSA (A1A) + LDU (1A1). Excludes unused letters.
    zipPattern: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
    zipHint: 'Postal code is usually A1A 1A1 (e.g. M5H 2N2)',
  },
  GB: {
    ...UNIVERSAL,
    countryCode: 'GB',
    countryDisplay: 'United Kingdom',
    street1Placeholder: '10 Downing St',
    cityPlaceholder: 'London',
    stateLabel: 'County',
    statePlaceholder: 'Greater London',
    zipLabel: 'Postcode',
    zipPlaceholder: 'SW1A 2AA',
    // Simplified UK postcode — covers the common forms (SW1A 2AA, M1 1AA,
    // B33 8TH, CR2 6XH). Special cases like GIR 0AA (non-geographic) would
    // trip this soft check; that's fine since we only warn, not block.
    zipPattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
    zipHint: 'Postcode is usually like SW1A 2AA or M1 1AA',
  },
};

// Common strings → canonical ISO alpha-2 code. Accepts the code itself too
// (e.g. "US", "us"). Anything unrecognised falls through to universal.
const COUNTRY_ALIASES = {
  in: 'IN', ind: 'IN', india: 'IN', 'republic of india': 'IN',
  us: 'US', usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US',
  'united states': 'US', 'united states of america': 'US', america: 'US',
  ca: 'CA', can: 'CA', canada: 'CA',
  gb: 'GB', uk: 'GB', 'u.k.': 'GB',
  'united kingdom': 'GB', 'great britain': 'GB', england: 'GB', britain: 'GB',
};

/**
 * Resolve a country string (name or code, any casing) to a locale config.
 * Returns the UNIVERSAL fallback when country is missing or unrecognised.
 */
export function getAddressLocale(country) {
  if (!country) return UNIVERSAL;
  const normalized = String(country).trim().toLowerCase();
  if (!normalized) return UNIVERSAL;
  const code = COUNTRY_ALIASES[normalized] || normalized.toUpperCase();
  return LOCALES[code] || UNIVERSAL;
}

/**
 * Soft-check a postal code value against its country's expected pattern.
 * - Returns `null` when the value is empty (blank-allowed; required is
 *   enforced elsewhere) or when no pattern is defined for the country.
 * - Returns a human-readable hint string when the value is present but
 *   doesn't match — callers render this as a non-blocking warning.
 *
 * Never throws and never mutates input.
 */
export function validateZip(zip, country) {
  if (zip == null) return null;
  const trimmed = String(zip).trim();
  if (!trimmed) return null;
  const locale = getAddressLocale(country);
  if (!locale.zipPattern) return null;
  return locale.zipPattern.test(trimmed) ? null : locale.zipHint;
}

/** List of supported locales — handy for pickers/tests. */
export const SUPPORTED_COUNTRY_CODES = Object.keys(LOCALES);
