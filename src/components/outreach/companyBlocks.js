// Shared state + helpers for "Do not work with" companies (2026-11-20).
// The dialog lives in CompanyBlock.jsx.
import { useEffect, useSyncExternalStore } from 'react';
import api from '../../utils/api';

export const BLOCK_STATUS = 'do_not_work_with';
export const BLOCK_LIST = 'Do Not Work With';

export function domainOfEmail(email) {
  return String(email || '').trim().toLowerCase().split('@')[1] || '';
}

// ── Shared, lazily loaded list of blocks (one fetch per page load) ─────────
let state = { loaded: false, canManage: false, blocks: [] };
let inflight = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function refreshCompanyBlocks() {
  inflight = api.getCompanyBlocks()
    .then((res) => {
      if (res?.success) state = { loaded: true, canManage: !!res.canManage, blocks: res.blocks || [] };
    })
    .catch(() => { state = { ...state, loaded: true }; })
    .finally(() => { inflight = null; emit(); });
  return inflight;
}

export function useCompanyBlocks() {
  const snap = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
  useEffect(() => { if (!state.loaded && !inflight) refreshCompanyBlocks(); }, []);
  return snap;
}

export function blockForEmail(blocks, email) {
  const d = domainOfEmail(email);
  return d ? blocks.find((b) => b.domain === d) || null : null;
}

export function fmtBlockDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

