// =========================================================================
// atsEmploymentTypes.js
// =========================================================================
//
// Phase-1 / Q21+Q22 (locked 2026-05-10). Mirrors the API's
// ATS_EMPLOYMENT_TYPES table in src/ats.js. Hardcoded today; promotes
// to a fetched picklist via GET /ats/config/employment-types when we
// move to per-org configuration in v2.
//
// Each entry maps an ATS-side employment type (used on Job Positions
// and Applications) to:
//   employeeKey  → which Employee.employmentType key the Hire flow
//                  writes when promoting the candidate to an employee
//                  (Q22c=B mapping). Keys come from platform_settings
//                  .employment_types in the DB.
//   salaryUnit   → which unit the offer modal's salary input renders
//                  + which unit the API stores on
//                  application.offer.offeredCTC.unit (Q21=B).
//   salaryLabel  → human label rendered next to the salary input.
// =========================================================================

// Salary-metadata map keyed by canonical employment-type name. The
// list of names itself comes from the per-org picklist at
// /ats/config/employment-types (Q1 locked 2026-05-13 = DB-backed + 4
// canonical entries). This map provides salary-unit defaults for the
// offer modal; unknown names fall back to ATS_EMPLOYMENT_TYPE_FALLBACK.
//
// 2026-05-13 rename: "Contract" → "External Consultant" (Odoo importer
// maps Contract → External Consultant).
export const ATS_EMPLOYMENT_TYPES = {
  'External Consultant': { employeeKey: 'external_consultant', salaryUnit: 'per_day',   salaryLabel: 'Day rate' },
  'Full-Time':           { employeeKey: 'confirmed',           salaryUnit: 'lpa',       salaryLabel: 'Annual CTC (LPA)' },
  'Internal Consultant': { employeeKey: 'internal_consultant', salaryUnit: 'lpa',       salaryLabel: 'Annual CTC (LPA)' },
  'Intern':              { employeeKey: 'intern',              salaryUnit: 'per_month', salaryLabel: 'Monthly stipend' },
};

export const ATS_EMPLOYMENT_TYPE_KEYS = Object.keys(ATS_EMPLOYMENT_TYPES);
// 2026-08-31 employment-type audit: the fallback label used to read
// "Annual salary (LPA)", which let a BLANK employment type masquerade as
// a deliberate LPA field in the offer modal (wrong money units for
// day-rate roles). Renamed so a blank type self-identifies. Mirrors
// ATS_EMPLOYMENT_TYPE_FALLBACK_META in the API's src/ats.js.
export const ATS_EMPLOYMENT_TYPE_FALLBACK = { employeeKey: 'confirmed', salaryUnit: 'lpa', salaryLabel: 'Salary — employment type not set' };

// What kind of input the offer modal should render for a given salary
// unit. Used both for the input's own placeholder and to interpret the
// user's typed value before the API call.
export const SALARY_UNIT_INPUT = {
  per_day:   { placeholder: 'e.g. 4500',   helper: 'Per working day' },
  per_month: { placeholder: 'e.g. 80000',  helper: 'Per month (gross)' },
  lpa:       { placeholder: 'e.g. 12',     helper: 'Lakhs Per Annum (e.g. 12 = 12,00,000 INR/year)' },
  per_year:  { placeholder: 'e.g. 1200000', helper: 'Per year (gross)' },
};

// 2026-08-31 hardening: lowercased key index so a trimmed / case-drifted
// value still resolves to the right salary meta instead of silently
// hitting the fallback. Prod data has zero drift today (audit §2) —
// this is future-proofing only. Mirrors the API's getEmploymentTypeMeta.
const ATS_EMPLOYMENT_TYPES_NORM = Object.fromEntries(
  Object.entries(ATS_EMPLOYMENT_TYPES).map(([k, v]) => [k.toLowerCase(), v]),
);

// Look up the salary unit + label for an ATS employment type. Exact key
// match first, then a trim/whitespace-collapse/case-insensitive match.
// Returns a safe fallback (LPA units, self-identifying label) for blank
// or unknown values so the modal still renders something rather than
// crashing.
export function getEmploymentTypeMeta(employmentType) {
  if (employmentType && ATS_EMPLOYMENT_TYPES[employmentType]) return ATS_EMPLOYMENT_TYPES[employmentType];
  const norm = String(employmentType || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return ATS_EMPLOYMENT_TYPES_NORM[norm] || ATS_EMPLOYMENT_TYPE_FALLBACK;
}
