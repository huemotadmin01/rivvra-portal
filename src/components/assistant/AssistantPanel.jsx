/**
 * AssistantPanel.jsx — Ask Rivvra, the floating org-wide assistant.
 *
 * Lives bottom-right on every authenticated /org/:slug/* page. Whether it
 * renders at all is the SERVER's call: GET /assistant/capabilities returns
 * `enabled:false` when none of the apps this user can reach are enabled for
 * the assistant, and the launcher stays hidden.
 *
 * Company boundary: every request carries X-Company-Id (assistantApi.js),
 * the server answers with a `scope` event naming the company it bound the
 * answer to, and the header shows it. Switching company clears the
 * conversation — a thread never spans two companies (the server refuses
 * with THREAD_COMPANY_MISMATCH anyway).
 *
 * Phase 1 (2026-09-11): conversations live on the server (threads), the
 * panel sends one message at a time; the record the user has open travels
 * as context; drafts (notes, emails) arrive as cards the user saves or
 * sends themselves; result links cover ATS, CRM and Contacts.
 *
 * Backend: src/assistant/index.js in the API repo for the event protocol.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import SupportDialog from '../SupportDialog';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import {
  streamAssistant, fetchAssistantCapabilities,
  listAssistantThreads, getAssistantThread, deleteAssistantThread,
} from '../../utils/assistantApi';
import PreviewDrawer from './PreviewDrawer';
import { appFromPath, recordFromPath, PREVIEW_KINDS, AssistantMessage } from './messageRender';
import './assistant.css';

// ────────────────────────────────────────────────────────────────────────────

export default function AssistantPanel() {
  const location = useLocation();
  const { slug: routeSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { currentCompany } = useCompany();
  const orgSlug = routeSlug || currentOrg?.slug;
  const currentCompanyId = currentCompany?._id ? String(currentCompany._id) : null;
  const currentApp = appFromPath(location.pathname);
  const onLauncher = /^\/org\/[^/]+\/home\/?$/.test(location.pathname);

  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState(null);       // server capabilities; { enabled:false } hides the launcher
  const [scope, setScope] = useState(null);     // company the last answer was bound to
  const [threadId, setThreadId] = useState(null);
  // Hand-off to a person: opens the shared support dialog with this
  // conversation's id attached. The assistant never emails on its own.
  const [supportOpen, setSupportOpen] = useState(false);
  const [threads, setThreads] = useState([]);   // recent conversations for this company
  const [messages, setMessages] = useState([]); // [{ role, content, toolCalls?, drafts?, listLinks? }]
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState(null); // { content, toolCalls, drafts, listLinks } while streaming
  const [previewItem, setPreviewItem] = useState(null);
  const [input, setInput] = useState('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const sendRef = useRef(null);

  const enabled = !!caps?.enabled;

  // Capabilities: once per (workspace, company).
  useEffect(() => {
    if (!user || !orgSlug || !currentCompanyId) { setCaps(null); return undefined; }
    const ctrl = new AbortController();
    fetchAssistantCapabilities(orgSlug, { app: currentApp, signal: ctrl.signal })
      .then((res) => { if (!ctrl.signal.aborted) setCaps(res); })
      .catch((err) => { if (!ctrl.signal.aborted) setCaps({ enabled: false, error: err.code || err.message }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, orgSlug, currentCompanyId]);

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setPending(null);
    setPreviewItem(null);
    setThreadId(null);
    setScope(null);
  }, []);

  // Company switch = new conversation, and the recent list is the other
  // company's now.
  const prevCompanyRef = useRef(currentCompanyId);
  useEffect(() => {
    if (prevCompanyRef.current && currentCompanyId && prevCompanyRef.current !== currentCompanyId) {
      resetConversation();
      setThreads([]);
    }
    prevCompanyRef.current = currentCompanyId;
  }, [currentCompanyId, resetConversation]);

  // Recent conversations, loaded when the panel opens on an empty state.
  useEffect(() => {
    if (!open || !enabled || !orgSlug || threadId || messages.length) return undefined;
    const ctrl = new AbortController();
    listAssistantThreads(orgSlug, { signal: ctrl.signal })
      .then((res) => { if (!ctrl.signal.aborted) setThreads(res.threads || []); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [open, enabled, orgSlug, threadId, messages.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pending]);

  const send = useCallback(async (textOverride, { retryThread = true } = {}) => {
    const text = (textOverride ?? input).trim();
    if (!text || streaming || !orgSlug) return;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setStreaming(true);
    const live = { content: '', toolCalls: [], drafts: [], listLinks: [] };
    setPending({ ...live });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const context = { app: currentApp, route: location.pathname, record: recordFromPath(location.pathname) };
    let usedThread = threadId;
    try {
      for await (const { event, data } of streamAssistant(orgSlug, text, { threadId, context, signal: ctrl.signal })) {
        if (event === 'scope') {
          setScope(data);
          if (data?.threadId) { usedThread = data.threadId; setThreadId(data.threadId); }
        } else if (event === 'token') {
          live.content += typeof data === 'string' ? data : '';
        } else if (event === 'tool_call') {
          live.toolCalls.push({ id: data.id, name: data.name, args: data.args, summary: null });
        } else if (event === 'tool_result') {
          const t = live.toolCalls.find((x) => x.id === data.id);
          if (t) t.summary = data.summary;
        } else if (event === 'draft') {
          live.drafts.push(data);
        } else if (event === 'list_link') {
          if (data?.url && !live.listLinks.find((l) => l.url === data.url)) live.listLinks.push({ label: data.label, url: data.url });
        } else if (event === 'error') {
          live.content += `\n\n_⚠️ ${data?.message || 'Something went wrong'}_`;
        }
        setPending({ ...live, toolCalls: [...live.toolCalls], drafts: [...live.drafts], listLinks: [...live.listLinks] });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        live.content += '\n\n_(stopped)_';
      } else if (err.code === 'THREAD_COMPANY_MISMATCH' || err.code === 'THREAD_NOT_FOUND') {
        // The thread belongs to another company or is gone: start fresh and
        // resend this one message once.
        setStreaming(false);
        setPending(null);
        setMessages((prev) => prev.slice(0, -1));
        setThreadId(null);
        abortRef.current = null;
        if (retryThread) { setTimeout(() => sendRef.current?.(text, { retryThread: false }), 0); }
        return;
      } else {
        if (err.code === 'ASSISTANT_NO_APPS' || err.code === 'ASSISTANT_DISABLED') setCaps({ enabled: false, error: err.code });
        live.content = (live.content || '') + (live.content ? '\n\n' : '') + `_⚠️ ${err.message || 'Network error'}_`;
      }
    } finally {
      if (abortRef.current === ctrl) {
        setMessages((prev) => [...prev, { role: 'assistant', ...live }]);
        setPending(null);
        setStreaming(false);
        abortRef.current = null;
        if (usedThread) setThreads([]); // stale; refetched next time the empty state shows
      }
    }
  }, [input, streaming, orgSlug, threadId, currentApp, location.pathname]);
  sendRef.current = send;

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);

  const openThread = useCallback(async (id) => {
    if (!orgSlug) return;
    try {
      const res = await getAssistantThread(orgSlug, id);
      const msgs = (res.messages || []).map((m) => ({
        role: m.role,
        content: m.content || '',
        toolCalls: (m.toolCalls || []).map((tc, i) => ({ id: `${m._id}-${i}`, name: tc.name, args: tc.args, summary: { ok: !tc.error, matchCount: tc.resultCount ?? undefined, error: tc.error || undefined } })),
        drafts: (m.drafts || []).filter((d) => d && d.kind).map((d) => ({ ...d, payload: {} })), // stored: id/kind/title/status/openPath, no request → cards show outcome only
      }));
      setMessages(msgs);
      setThreadId(String(res.thread._id));
      setPending(null);
    } catch (err) {
      if (err.code === 'THREAD_COMPANY_MISMATCH') setThreads([]);
    }
  }, [orgSlug]);

  const removeThread = useCallback(async (id) => {
    try { await deleteAssistantThread(orgSlug, id); } catch { /* ignore */ }
    setThreads((prev) => prev.filter((t) => String(t._id) !== String(id)));
  }, [orgSlug]);

  const closePanel = useCallback(() => {
    if (streaming) abortRef.current?.abort();
    setOpen(false);
  }, [streaming]);

  // ⌘K opens the assistant from any page it is enabled on — except the app
  // launcher, whose own ⌘K opens its search (which can hand a question here
  // through the rivvra:assistant:ask event). ESC closes the panel unless a
  // PreviewDrawer is open above it.
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (onLauncher) return;
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open && !previewItem) {
        closePanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, open, previewItem, closePanel, onLauncher]);

  // "Ask Rivvra: …" from the launcher search.
  useEffect(() => {
    if (!enabled) return undefined;
    const onAsk = (e) => {
      const text = String(e.detail?.text || '').trim();
      if (!text) return;
      setOpen(true);
      setTimeout(() => sendRef.current?.(text), 0);
    };
    window.addEventListener('rivvra:assistant:ask', onAsk);
    return () => window.removeEventListener('rivvra:assistant:ask', onAsk);
  }, [enabled]);

  // Abort any in-flight stream when the panel unmounts.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  if (!user || !orgSlug || !enabled) return null;

  const scopeName = scope?.companyName || caps?.companyName || currentCompany?.name || currentOrg?.name || 'Rivvra';
  const suggestions = Array.isArray(caps?.suggestions) ? caps.suggestions : [];
  const onItemClick = (it) => {
    if (PREVIEW_KINDS.has(it._kind)) setPreviewItem({ kind: it._kind, id: it._id });
    else if (it._viewUrl) navigate(it._viewUrl);
  };
  const emptyState = messages.length === 0 && !pending;

  // `ds-shell ra-root` (assistant.css): the assistant mounts outside the v2
  // shell, so this wrapper is what makes it follow the V2 light/dark theme.
  return (
    <div className="ds-shell ra-root">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Ask Rivvra (⌘K)"
          className="ra-launcher fixed bottom-6 right-6 z-40 group inline-flex items-center gap-2.5 pl-3 pr-3.5 h-11 rounded-full hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ease-out text-sm font-medium tracking-tight focus:outline-none"
        >
          <span className="relative inline-flex items-center justify-center w-5 h-5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-rivvra-300 transition-transform duration-300 group-hover:rotate-[15deg]">
              <defs>
                <linearGradient id="aiStarGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#6ee7b7" /><stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              <path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z" stroke="url(#aiStarGrad)" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand)', boxShadow: '0 0 0 2px var(--surface-1)' }} aria-hidden="true" />
          </span>
          <span className="leading-none">Ask Rivvra</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded leading-none">⌘K</kbd>
        </button>
      )}

      {previewItem && <PreviewDrawer item={previewItem} orgSlug={orgSlug} besidePanel onClose={() => setPreviewItem(null)} />}
      <SupportDialog key="support" open={supportOpen} onClose={() => setSupportOpen(false)} prefill={(() => { const q = [...messages].reverse().find((m) => m.role === 'user')?.content || ''; return { subject: q ? `Help with: ${q.slice(0, 80)}` : '', threadId: threadId || undefined, lastQuestion: q || undefined }; })()} />

      {open && (
        // z-[56]: above the v2 sidebar (z 40) so the preview drawer (z 55,
        // beside the panel) never slides under it. Height stops below the
        // 56px top bar so the page header stays reachable.
        <div className="ra-panel fixed bottom-5 right-5 z-[56] w-[420px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-84px)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="ra-head flex items-center justify-between gap-2 pl-4 pr-2 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l1.5 4.5L16 8l-4.5 1.5L10 14l-1.5-4.5L4 8l4.5-1.5L10 2z" /></svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>Ask Rivvra</div>
                {/* Scope chip — the company every answer is bound to, from the server. */}
                <div className="text-[11px] flex items-center gap-1 min-w-0" style={{ color: 'var(--fg-3)' }} title={`Answers are limited to ${scopeName}`}>
                  <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3 18V4a1 1 0 011-1h7a1 1 0 011 1v4h4a1 1 0 011 1v9h1v1H2v-1h1zm2-1h5V5H5v12zm7 0h4v-8h-4v8zM6 6h3v2H6V6zm0 3h3v2H6V9zm0 3h3v2H6v-2zm7 0h2v2h-2v-2zm0-3h2v2h-2V9z" /></svg>
                  <span className="truncate">{scopeName}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* Icon buttons with tooltips: the text buttons ate the company name. */}
              {(messages.length > 0 || threadId) && (
                <button type="button" onClick={resetConversation} className="ra-iconbtn h-7 w-7 flex items-center justify-center" aria-label="New conversation" title="New conversation">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5z" /></svg>
                </button>
              )}
              <button type="button" onClick={() => setSupportOpen(true)} className="ra-iconbtn h-7 w-7 flex items-center justify-center" aria-label="Talk to a person" title="Talk to a person — emails support with this conversation attached">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3a2 2 0 002 2h1V8H6a4 4 0 018 0h-1v5h1a2 2 0 01-1.7 2H10v2h2.3A4 4 0 0016 13V8a6 6 0 00-6-6z" /></svg>
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); navigate(`/org/${orgSlug}/assistant${threadId ? `?thread=${threadId}` : ''}`); }}
                className="ra-iconbtn h-7 w-7 flex items-center justify-center"
                aria-label="Open full view"
                title="Open full view"
              >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h6v2H5v4H3V3zm8 0h6v6h-2V5h-4V3zM3 11h2v4h4v2H3v-6zm12 0h2v6h-6v-2h4v-4z" /></svg>
              </button>
              <button type="button" onClick={closePanel} className="ra-iconbtn h-7 w-7 flex items-center justify-center" aria-label="Close" title="Close (Esc)">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M14.3 5.7L10 10l4.3 4.3-1.4 1.4L8.6 11.4l-4.3 4.3L2.9 14.3 7.2 10 2.9 5.7 4.3 4.3l4.3 4.3 4.3-4.3z" /></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {emptyState && (
              <div className="space-y-3 pt-2">
                <div className="text-[12.5px] px-1" style={{ color: 'var(--fg-3)' }}>Ask about your data in {scopeName} — I search your real records, and only this company's.</div>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((q) => (
                    <button key={q} type="button" onClick={() => send(q)} className="ra-chip-btn">{q}</button>
                  ))}
                </div>
                {threads.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-dark-500 px-1 mb-1">Recent</div>
                    <div className="flex flex-col gap-1">
                      {threads.slice(0, 6).map((t) => (
                        <div key={t._id} className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-dark-800 border border-transparent hover:border-dark-700">
                          <button type="button" onClick={() => openThread(t._id)} className="flex-1 min-w-0 text-left">
                            <div className="text-xs text-dark-200 truncate">{t.title}</div>
                            <div className="text-[10px] text-dark-500">{t.messageCount || 0} messages · {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleDateString() : ''}</div>
                          </button>
                          <button type="button" onClick={() => removeThread(t._id)} className="opacity-0 group-hover:opacity-100 text-dark-500 hover:text-rose-300 text-[11px] px-1" aria-label="Delete conversation">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'user' ? (
                  <div className="ra-user-bubble max-w-[85%] text-[13.5px] px-3 py-2 whitespace-pre-wrap break-words">{m.content}</div>
                ) : (
                  <AssistantMessage m={m} orgSlug={orgSlug} navigate={navigate} onItemClick={onItemClick} threadId={threadId} />
                )}
              </div>
            ))}

            {!streaming && messages.length > 0 && messages[messages.length - 1].role === 'assistant'
              && /no result found|couldn.t find|can.t help with that|contact support/i.test(String(messages[messages.length - 1].content || '')) && (
              <div className="flex justify-start">
                <button type="button" onClick={() => setSupportOpen(true)} className="text-[11px] text-rivvra-300 hover:text-rivvra-200 px-2 py-1 rounded border border-rivvra-500/30 hover:bg-rivvra-500/10">
                  Talk to a human →
                </button>
              </div>
            )}

            {streaming && pending && !pending.content && pending.toolCalls.length === 0 && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 text-xs text-dark-400 px-3 py-2 rounded-md bg-dark-800/40 border border-dark-700/50">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rivvra-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rivvra-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rivvra-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span>Thinking…</span>
                </div>
              </div>
            )}

            {pending && (pending.content || pending.toolCalls.length > 0) && (
              <div className="flex justify-start">
                <AssistantMessage m={pending} orgSlug={orgSlug} navigate={navigate} onItemClick={onItemClick} streamingCursor threadId={threadId} />
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="ra-foot p-2.5">
            <div className="ra-input flex items-end gap-2 px-2.5 py-1.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask about your data…"
                rows={1}
                disabled={streaming}
                className="flex-1 bg-transparent text-[13.5px] resize-none focus:outline-none disabled:opacity-50 py-1 max-h-32"
                style={{ minHeight: '24px' }}
              />
              {streaming ? (
                <button type="button" onClick={stop} className="h-8 w-8 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center" aria-label="Stop">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="1" /></svg>
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()} className="ra-send h-8 w-8 flex items-center justify-center transition-colors" aria-label="Send">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10l16-8-7 16-2-6-7-2z" /></svg>
                </button>
              )}
            </div>
            <div className="text-[10.5px] px-1 pt-1.5 truncate" style={{ color: 'var(--fg-4)' }} title={`Answers limited to ${scopeName}`}>
              Enter to send · Shift+Enter for a new line
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
