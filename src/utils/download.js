// ============================================================================
// download.js — Authenticated file download (for CSV exports, signed PDFs, etc.)
// ============================================================================
//
// Triggers a browser download of an API endpoint, with the JWT and
// X-Company-Id headers attached. Plain <a download href="..."> doesn't
// work for our endpoints because the backend gates everything behind
// the Authorization header — so we fetch as a blob, build a temporary
// blob: URL, and click a synthetic anchor.
//
// Usage:
//   await downloadFile('/api/org/foo/crm/opportunities/export.csv?search=acme',
//                      'opportunities_2026-05-02.csv');
// ============================================================================

import { API_BASE_URL } from './config';
import { getActiveCompanyId } from './api';

export async function downloadFile(endpoint, filename) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rivvra_token') : null;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const companyId = getActiveCompanyId();
  if (companyId) headers['X-Company-Id'] = companyId;

  const res = await fetch(`${API_BASE_URL}${endpoint}`, { headers });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Download failed (${res.status}): ${errText.slice(0, 200) || res.statusText}`);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the browser has finished kicking off the save.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
