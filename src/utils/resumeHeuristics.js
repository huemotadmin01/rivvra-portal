// Is this file a résumé, or paperwork that happened to be uploaded next to one?
//
// 2026-10-07: 305 attachments carried isResume=true while being a Rate &
// Terms Confirmation, a CTC sheet, a Gmail print-to-PDF of the JD, an offer
// letter, a certificate, an SOW… The flag landed on whatever got uploaded,
// and everything downstream — the AI scorer, the resume gate, "resume on
// file" on the New Application page, Suggested Candidates — read a JD as
// the CV. Two data sweeps fixed 229 candidates; this keeps it from
// recurring. Filename-only, so it WARNS — it never blocks a recruiter who
// knows better. Keep in sync with the sweep regex in
// scripts/… (API repo) if you add a pattern.
const PAPERWORK = [
  [/Mail - |Mail Re/i, 'an email printout'],
  [/Rate ?& ?Terms|Rate_Terms|CTC ?& ?Terms|Terms Confirmation|Confirmation/i, 'a rate / CTC confirmation'],
  [/Offer Letter|Appointment/i, 'an offer or appointment letter'],
  [/Agreement|\bSOW\b|Exhibit|\bEx\._|\bNDA\b|\bLOA\b/i, 'a contract or agreement'],
  [/Certificate|marks ?card|marksheet/i, 'a certificate or mark sheet'],
  [/Pan[_ ]?card|Aadha?ar|Passport/i, 'an identity document'],
  [/Payslip|Invoice|Experience Letter|Relieving/i, 'an HR or finance document'],
  [/Acknowledg/i, 'an acknowledgement'],
];

/** Returns a short description of what the file looks like, or null when it looks like a résumé. */
export function paperworkReason(fileName) {
  const name = String(fileName || '');
  for (const [re, label] of PAPERWORK) if (re.test(name)) return label;
  return null;
}
