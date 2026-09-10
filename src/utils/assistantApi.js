/**
 * assistantApi.js — client for Ask Rivvra (the org-wide assistant).
 *
 * Replaces chatbotApi.js (2026-09-11, Phase 0 of docs/ASK-RIVVRA-ASSISTANT.md
 * in the API repo). Two changes that matter:
 *   1. Every request carries X-Company-Id through the same hydration gate as
 *      api.js, so the answer is bound to the company in the switcher — not
 *      to the server-side preference the switcher persists in the background.
 *   2. The request body carries `context` (app + route) so the server can
 *      pick tool packs and suggestions for the page the user is on.
 *
 * SSE is read with fetch + ReadableStream because EventSource cannot send
 * POST bodies or Authorization headers.
 */

import { API_BASE_URL } from './config';
import { getActiveCompanyId } from './api';

function authHeaders() {
  const headers = {};
  const token = localStorage.getItem('rivvra_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const companyId = getActiveCompanyId();
  if (companyId) headers['X-Company-Id'] = companyId;
  return headers;
}

async function readError(resp) {
  let body = '';
  try { body = await resp.text(); } catch { /* ignore */ }
  let parsed = {};
  try { parsed = JSON.parse(body); } catch { /* ignore */ }
  const err = new Error(parsed.error || `HTTP ${resp.status}`);
  err.status = resp.status;
  err.code = parsed.code || null;
  return err;
}

/** GET capabilities: { enabled, apps, companyId, companyName, suggestions }. */
export async function fetchAssistantCapabilities(orgSlug, { app, route, signal } = {}) {
  const qs = new URLSearchParams();
  if (app) qs.set('app', app);
  if (route) qs.set('route', route);
  const url = `${API_BASE_URL}/api/org/${orgSlug}/assistant/capabilities${qs.toString() ? `?${qs}` : ''}`;
  const resp = await fetch(url, { headers: authHeaders(), signal });
  if (!resp.ok) throw await readError(resp);
  return resp.json();
}

/** POST stream: yields { event, data } for every SSE frame. */
export async function* streamAssistant(orgSlug, messages, { sessionId, context, signal } = {}) {
  const url = `${API_BASE_URL}/api/org/${orgSlug}/assistant/stream`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ messages, sessionId, context }),
    signal,
  });
  if (!resp.ok) throw await readError(resp);
  if (!resp.body) throw new Error('No response body for SSE stream');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // Frames are separated by blank lines; keep the trailing partial in buf.
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = 'message';
      const dataLines = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
      }
      const joined = dataLines.join('\n');
      // The server JSON-encodes every payload; tokens arrive as JSON strings.
      let data = joined;
      try { data = JSON.parse(joined); } catch { /* leave as string */ }
      yield { event, data };
    }
  }
  if (buf.trim()) yield { event: 'message', data: buf.trim() };
}
