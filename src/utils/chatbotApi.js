/**
 * chatbotApi.js — SSE client for the ATS chatbot.
 *
 * The deployed API uses fetch + ReadableStream for SSE (not the legacy
 * EventSource API) because EventSource can't send POST or Authorization
 * headers. This wrapper parses SSE frames out of the response body and
 * yields `{event, data}` objects via an async iterator.
 *
 * Usage:
 *   for await (const { event, data } of streamChatbot(orgSlug, messages)) {
 *     if (event === 'token') appendText(data);
 *     if (event === 'tool_call') showPill(JSON.parse(data));
 *     ...
 *   }
 */

import { API_BASE_URL } from './config';

export async function* streamChatbot(orgSlug, messages, { sessionId, signal } = {}) {
  const token = localStorage.getItem('rivvra_token');
  const url = `${API_BASE_URL}/api/org/${orgSlug}/ats/chatbot/stream`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, sessionId }),
    signal,
  });

  if (!resp.ok) {
    // Non-2xx — read body once for a usable error, then surface.
    let body = '';
    try { body = await resp.text(); } catch {}
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    const err = new Error(parsed.error || `HTTP ${resp.status}`);
    err.status = resp.status;
    err.code = parsed.code || null;
    throw err;
  }
  if (!resp.body) throw new Error('No response body for SSE stream');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE frames are separated by blank lines (\n\n). Parse + emit each
    // complete frame; keep the trailing partial frame in `buf`.
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
      const raw_ = dataLines.join('\n');
      // Server JSON-encodes every payload so newlines + special chars
      // round-trip cleanly. Token events arrive as JSON strings (need
      // unwrapping). tool_call/result/done arrive as JSON objects.
      let data = raw_;
      try { data = JSON.parse(raw_); } catch { /* leave as string */ }
      yield { event, data };
    }
  }

  // Flush any final partial frame (rare — server always closes with \n\n).
  if (buf.trim()) {
    yield { event: 'message', data: buf.trim() };
  }
}
