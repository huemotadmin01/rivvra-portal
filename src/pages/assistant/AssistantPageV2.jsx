// ============================================================================
// AssistantPageV2.jsx — Ask Rivvra, full page (Phase 4, 2026-09-11).
//
// Same backend and the same message renderer as the floating panel
// (components/assistant/messageRender.jsx); this surface adds a proper
// conversation list for the current company and room to read long answers.
// Everything is bound to the company in the switcher: the thread list is
// per company, and switching company clears the open conversation (the
// server refuses to continue a thread across companies anyway).
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import {
  streamAssistant, fetchAssistantCapabilities,
  listAssistantThreads, getAssistantThread, deleteAssistantThread,
} from '../../utils/assistantApi';
import { PREVIEW_KINDS, AssistantMessage } from '../../components/assistant/messageRender';
import PreviewDrawer from '../../components/assistant/PreviewDrawer';
import { Button, EmptyState, PageHeader } from '../../components/ds';
import { MessageSquare, Plus, Trash2, Send, Square } from 'lucide-react';

export default function AssistantPageV2() {
  const { slug: routeSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { currentCompany } = useCompany();
  const orgSlug = routeSlug || currentOrg?.slug;
  const currentCompanyId = currentCompany?._id ? String(currentCompany._id) : null;

  const [caps, setCaps] = useState(null);
  const [scope, setScope] = useState(null);
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(searchParams.get('thread') || null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [input, setInput] = useState('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const sendRef = useRef(null);

  const enabled = !!caps?.enabled;
  const scopeName = scope?.companyName || caps?.companyName || currentCompany?.name || currentOrg?.name || 'Rivvra';

  useEffect(() => {
    if (!user || !orgSlug || !currentCompanyId) { setCaps(null); return undefined; }
    const ctrl = new AbortController();
    fetchAssistantCapabilities(orgSlug, { signal: ctrl.signal })
      .then((res) => { if (!ctrl.signal.aborted) setCaps(res); })
      .catch((err) => { if (!ctrl.signal.aborted) setCaps({ enabled: false, error: err.code || err.message }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, orgSlug, currentCompanyId]);

  const refreshThreads = useCallback(() => {
    if (!orgSlug || !enabled) return;
    listAssistantThreads(orgSlug).then((res) => setThreads(res.threads || [])).catch(() => {});
  }, [orgSlug, enabled]);
  useEffect(() => { refreshThreads(); }, [refreshThreads, currentCompanyId]);

  const openThread = useCallback(async (id) => {
    if (!orgSlug || !id) return;
    abortRef.current?.abort();
    try {
      const res = await getAssistantThread(orgSlug, id);
      setMessages((res.messages || []).map((m) => ({
        role: m.role,
        content: m.content || '',
        toolCalls: (m.toolCalls || []).map((tc, i) => ({ id: `${m._id}-${i}`, name: tc.name, args: tc.args, summary: { ok: !tc.error, matchCount: tc.resultCount ?? undefined, error: tc.error || undefined } })),
        drafts: (m.drafts || []).filter((d) => d && d.kind).map((d) => ({ ...d, payload: {} })),
      })));
      setThreadId(String(res.thread._id));
      setPending(null);
      setSearchParams({ thread: String(res.thread._id) }, { replace: true });
    } catch (err) {
      setThreadId(null);
      setMessages([]);
      setSearchParams({}, { replace: true });
      if (err.code === 'THREAD_COMPANY_MISMATCH') refreshThreads();
    }
  }, [orgSlug, setSearchParams, refreshThreads]);

  // Deep link ?thread= and company switch.
  const prevCompanyRef = useRef(currentCompanyId);
  useEffect(() => {
    if (prevCompanyRef.current && currentCompanyId && prevCompanyRef.current !== currentCompanyId) {
      abortRef.current?.abort();
      setMessages([]); setPending(null); setThreadId(null); setScope(null); setPreviewItem(null);
      setSearchParams({}, { replace: true });
    }
    prevCompanyRef.current = currentCompanyId;
  }, [currentCompanyId, setSearchParams]);
  useEffect(() => {
    const wanted = searchParams.get('thread');
    if (enabled && wanted && wanted !== threadId && messages.length === 0) openThread(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, searchParams]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, pending]);

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]); setPending(null); setThreadId(null); setScope(null); setPreviewItem(null);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const removeThread = useCallback(async (id) => {
    try { await deleteAssistantThread(orgSlug, id); } catch { /* ignore */ }
    setThreads((prev) => prev.filter((t) => String(t._id) !== String(id)));
    if (String(id) === String(threadId)) newConversation();
  }, [orgSlug, threadId, newConversation]);

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
    let usedThread = threadId;
    try {
      for await (const { event, data } of streamAssistant(orgSlug, text, { threadId, context: { app: null, route: `/org/${orgSlug}/assistant` }, signal: ctrl.signal })) {
        if (event === 'scope') { setScope(data); if (data?.threadId) { usedThread = data.threadId; setThreadId(data.threadId); setSearchParams({ thread: data.threadId }, { replace: true }); } }
        else if (event === 'token') live.content += typeof data === 'string' ? data : '';
        else if (event === 'tool_call') live.toolCalls.push({ id: data.id, name: data.name, args: data.args, summary: null });
        else if (event === 'tool_result') { const t = live.toolCalls.find((x) => x.id === data.id); if (t) t.summary = data.summary; }
        else if (event === 'draft') live.drafts.push(data);
        else if (event === 'list_link') { if (data?.url && !live.listLinks.find((l) => l.url === data.url)) live.listLinks.push({ label: data.label, url: data.url }); }
        else if (event === 'error') live.content += `\n\n_⚠️ ${data?.message || 'Something went wrong'}_`;
        setPending({ ...live, toolCalls: [...live.toolCalls], drafts: [...live.drafts], listLinks: [...live.listLinks] });
      }
    } catch (err) {
      if (err.name === 'AbortError') live.content += '\n\n_(stopped)_';
      else if (err.code === 'THREAD_COMPANY_MISMATCH' || err.code === 'THREAD_NOT_FOUND') {
        setStreaming(false); setPending(null); setMessages((prev) => prev.slice(0, -1)); setThreadId(null); abortRef.current = null;
        if (retryThread) setTimeout(() => sendRef.current?.(text, { retryThread: false }), 0);
        return;
      } else {
        if (err.code === 'ASSISTANT_NO_APPS' || err.code === 'ASSISTANT_DISABLED') setCaps({ enabled: false, error: err.code });
        live.content = (live.content || '') + (live.content ? '\n\n' : '') + `_⚠️ ${err.message || 'Network error'}_`;
      }
    } finally {
      if (abortRef.current === ctrl) {
        setMessages((prev) => [...prev, { role: 'assistant', ...live }]);
        setPending(null); setStreaming(false); abortRef.current = null;
        if (usedThread) refreshThreads();
      }
    }
  }, [input, streaming, orgSlug, threadId, setSearchParams, refreshThreads]);
  sendRef.current = send;

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const onItemClick = (it) => { if (PREVIEW_KINDS.has(it._kind)) setPreviewItem({ kind: it._kind, id: it._id }); else if (it._viewUrl) navigate(it._viewUrl); };
  const suggestions = Array.isArray(caps?.suggestions) ? caps.suggestions : [];

  if (caps && !enabled) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto' }}>
        <PageHeader title="Ask Rivvra" sub={scopeName} />
        <EmptyState icon={<MessageSquare size={22} />} title="Ask Rivvra is not available here">None of the apps you can use are enabled for the assistant in this workspace yet.</EmptyState>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1180, margin: '0 auto', minHeight: 'calc(100dvh - 140px)' }}>
      <PageHeader
        title="Ask Rivvra"
        sub={`Answers are limited to ${scopeName}`}
        actions={<Button variant="secondary" size="sm" iconLeft={<Plus size={14} />} onClick={newConversation}>New conversation</Button>}
      />
      {previewItem && <PreviewDrawer item={previewItem} orgSlug={orgSlug} onClose={() => setPreviewItem(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 16, flex: 1, minHeight: 0 }} className="assistant-page-grid">
        {/* Conversations */}
        <aside style={{ borderRadius: 'var(--r-2, 10px)', background: 'var(--surface-1, #10161d)', boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.08))', padding: 8, overflowY: 'auto', maxHeight: 'calc(100dvh - 200px)' }}>
          <div className="text-[10px] uppercase tracking-wider px-2 py-1" style={{ color: 'var(--fg-3, #8b96a3)' }}>Conversations · {scopeName}</div>
          {threads.length === 0 && <div className="text-xs px-2 py-3" style={{ color: 'var(--fg-3, #8b96a3)' }}>No conversations yet in this company.</div>}
          {threads.map((t) => {
            const active = String(t._id) === String(threadId);
            return (
              <div key={t._id} className="group flex items-center gap-1 rounded-md px-2 py-1.5" style={{ background: active ? 'var(--surface-2, #141b24)' : 'transparent' }}>
                <button type="button" onClick={() => openThread(t._id)} className="flex-1 min-w-0 text-left">
                  <div className="text-xs truncate" style={{ color: 'var(--fg, #eef2f6)' }}>{t.title}</div>
                  <div className="text-[10px]" style={{ color: 'var(--fg-3, #8b96a3)' }}>{t.messageCount || 0} messages · {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleDateString() : ''}</div>
                </button>
                <button type="button" onClick={() => removeThread(t._id)} className="opacity-0 group-hover:opacity-100 px-1" style={{ color: 'var(--fg-3, #8b96a3)' }} aria-label="Delete conversation"><Trash2 size={12} /></button>
              </div>
            );
          })}
        </aside>

        {/* Conversation */}
        <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRadius: 'var(--r-2, 10px)', background: 'var(--surface-1, #10161d)', boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.08))' }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, maxHeight: 'calc(100dvh - 280px)' }} className="space-y-4">
            {messages.length === 0 && !pending && (
              <div className="space-y-3">
                <div className="text-sm" style={{ color: 'var(--fg-2, #b8c1cc)' }}>Ask about your data in {scopeName}. I search your real records, and only this company's.</div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((q) => (
                    <button key={q} type="button" onClick={() => send(q)} className="text-left text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2, #141b24)', color: 'var(--fg, #eef2f6)', boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.08))' }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'user'
                  ? <div className="max-w-[75%] text-sm rounded-2xl rounded-br-md px-3 py-2" style={{ background: 'color-mix(in srgb, var(--brand, #22c55e) 18%, transparent)', color: 'var(--fg, #eef2f6)' }}>{m.content}</div>
                  : <AssistantMessage m={m} orgSlug={orgSlug} navigate={navigate} onItemClick={onItemClick} threadId={threadId} />}
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                {pending.content || pending.toolCalls.length
                  ? <AssistantMessage m={pending} orgSlug={orgSlug} navigate={navigate} onItemClick={onItemClick} streamingCursor threadId={threadId} />
                  : <div className="text-xs" style={{ color: 'var(--fg-3, #8b96a3)' }}>Thinking…</div>}
              </div>
            )}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ padding: 12, borderTop: '1px solid var(--line-2, rgba(255,255,255,.08))' }}>
            <div className="flex items-end gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--surface-2, #141b24)', boxShadow: 'inset 0 0 0 1px var(--line-2, rgba(255,255,255,.08))' }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask about your data…"
                rows={2}
                disabled={streaming}
                className="flex-1 bg-transparent text-sm resize-none focus:outline-none disabled:opacity-50"
                style={{ color: 'var(--fg, #eef2f6)', minHeight: 40, maxHeight: 200 }}
              />
              {streaming
                ? <Button variant="secondary" size="sm" iconLeft={<Square size={12} />} onClick={() => abortRef.current?.abort()}>Stop</Button>
                : <Button variant="primary" size="sm" iconLeft={<Send size={12} />} type="submit" disabled={!input.trim()}>Send</Button>}
            </div>
            <div className="text-[10px] pt-1 px-1" style={{ color: 'var(--fg-3, #8b96a3)' }}>Enter to send · Shift+Enter for a new line · Answers limited to {scopeName}</div>
          </form>
        </section>
      </div>
      <style>{`@media (max-width: 800px) { .assistant-page-grid { grid-template-columns: 1fr !important; } .assistant-page-grid aside { max-height: 180px !important; } }`}</style>
    </div>
  );
}
