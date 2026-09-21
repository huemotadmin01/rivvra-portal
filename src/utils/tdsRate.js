// Which of a TDS section's three rates applies — LABEL ONLY.
//
// The server decides the number (API src/helpers/tdsRate.js, which holds the
// full explanation); this mirrors its rule so the dropdown shows the rate that
// will actually be applied. Change both together.
//
//   kind: 'individual' (PAN 4th char P/H) | 'company' (any other valid PAN)
//         | 'none' (no valid PAN → the section-206AA rate)
//
// Until 2026-09-21 every picker read `rateIndividual`, so a contractor COMPANY
// under 194C was shown — and charged — 1% instead of 2%.
export function tdsRateFor(config, kind) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  if (!config) return 0;
  if (kind === 'none') return num(config.ratePanMissing) || Math.max(num(config.rateIndividual), num(config.rateCompany));
  if (kind === 'company') return num(config.rateCompany ?? config.rateIndividual);
  return num(config.rateIndividual);
}

export const TDS_KIND_NOTE = {
  individual: 'individual / HUF rate',
  company: 'company rate',
  none: 'no PAN on file — higher rate applies',
};
