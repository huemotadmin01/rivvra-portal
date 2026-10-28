// Query params for the Applications table on an ATS job page.
//
// 2026-10-28: the table gained a search box and Stage / Signature / Status
// filters. They are applied SERVER-side (the list is paged 15 at a time, so a
// client-side filter would only ever search the visible page). Sorting is
// deliberately untouched: filters never change the order — 'fit' is always
// AI job-fit score, highest first, exactly as before.

export const RATE_CONF_FILTER_OPTIONS = [
  { value: 'signed', label: 'Signed by both parties' },
  { value: 'awaiting', label: 'Awaiting signature' },
  { value: 'none', label: 'Not sent' },
  { value: 'refused', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled / expired' },
  { value: 'bypassed', label: 'Bypassed by admin' },
];

export const APP_STATUS_FILTER_OPTIONS = [
  { value: 'ongoing', label: 'Active' },
  { value: 'hired', label: 'Hired' },
  { value: 'refused', label: 'Refused' },
];

const RC_VALUES = new Set(RATE_CONF_FILTER_OPTIONS.map((o) => o.value));
const STATUS_VALUES = new Set(APP_STATUS_FILTER_OPTIONS.map((o) => o.value));

export function buildJobApplicationsParams({
  jobId, page = 1, limit = 15, sort = 'fit',
  search = '', stageId = '', rateConfirmation = '', status = '',
} = {}) {
  const params = {
    jobId,
    page,
    limit,
    sort: sort === 'fit' ? 'aiJobFitScore' : 'appliedOn',
    dir: 'desc',
    withFit: 1,
  };
  const q = String(search || '').trim();
  if (q) params.search = q.slice(0, 100);
  if (stageId) params.stageId = String(stageId);
  if (RC_VALUES.has(rateConfirmation)) params.rateConfirmation = rateConfirmation;
  if (STATUS_VALUES.has(status)) params.applicationStatus = status;
  return params;
}

export function hasActiveJobAppFilters({ search = '', stageId = '', rateConfirmation = '', status = '' } = {}) {
  return !!(String(search || '').trim() || stageId || rateConfirmation || status);
}
