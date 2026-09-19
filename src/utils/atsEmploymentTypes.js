// Offer-input presentation for a given salary unit.
//
// 2026-09-19: the name→meaning map that used to live here is GONE, along with
// getEmploymentTypeMeta. An employment type's MEANING — what its salary figure
// represents, and which payroll category the person becomes on hire — now
// travels on the customer's own picklist row and reaches the browser already
// resolved: `application.employmentMeaning` on the application detail, and
// `meaning` on each row of GET /ats/config/employment-types.
//
// Why it was removed rather than kept in sync: this file duplicated a four-name
// map from the API, while every new workspace was seeded with six names. An
// agency that picked "Contract" — a name we offered them — had a day rate of
// 4,500 captured as an annual package and the person hired onto payroll as
// permanent staff. Reintroducing a name-keyed map here restores that bug.
// See the API's helpers/atsEmploymentMeaning.js.

// What kind of input the offer modal should render for a given salary
// unit. Used both for the input's own placeholder and to interpret the
// user's typed value before the API call.
export const SALARY_UNIT_INPUT = {
  per_day:   { placeholder: 'e.g. 4500',   helper: 'Per working day' },
  // 2026-08-31: rate-based (per_day meta) roles can be agreed per-HOUR
  // (e.g. external consultants billed hourly). The offer modal offers a
  // per_day/per_hour choice for those roles only; the chosen unit is
  // stored on offer.offeredCTC.unit. Capture-side only — downstream
  // (hire promotion, payroll) has no per_hour conversion yet.
  per_hour:  { placeholder: 'e.g. 600',    helper: 'Per hour' },
  per_month: { placeholder: 'e.g. 80000',  helper: 'Per month (gross)' },
  lpa:       { placeholder: 'e.g. 12',     helper: 'Lakhs Per Annum (e.g. 12 = 12,00,000 INR/year)' },
  per_year:  { placeholder: 'e.g. 1200000', helper: 'Per year (gross)' },
};
