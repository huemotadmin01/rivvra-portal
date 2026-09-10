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

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import {
  streamAssistant, fetchAssistantCapabilities,
  listAssistantThreads, getAssistantThread, deleteAssistantThread,
} from '../../utils/assistantApi';
import PreviewDrawer from './PreviewDrawer';

// Which app the user is in, from the route: /org/:slug/<app>/…
function appFromPath(pathname) {
  const m = /^\/org\/[^/]+\/([^/?#]+)/.exec(pathname || '');
  return m ? m[1] : null;
}

// The record the user has open, from the route. Only detail pages with a
// real id; list/new/dashboard segments never match.
const RECORD_ROUTES = [
  [/^\/org\/[^/]+\/ats\/candidates\/([a-f0-9]{24})/i, 'candidate'],
  [/^\/org\/[^/]+\/ats\/applications\/([a-f0-9]{24})/i, 'application'],
  [/^\/org\/[^/]+\/ats\/jobs\/([a-f0-9]{24})/i, 'job'],
  [/^\/org\/[^/]+\/crm\/opportunities\/([a-f0-9]{24})/i, 'opportunity'],
  [/^\/org\/[^/]+\/contacts\/([a-f0-9]{24})/i, 'contact'],
];
function recordFromPath(pathname) {
  for (const [re, kind] of RECORD_ROUTES) {
    const m = re.exec(pathname || '');
    if (m) return { kind, id: m[1] };
  }
  return null;
}

// Link kinds the model may emit: [Label](kind:id)
const KIND_PATH = {
  c: 'ats/candidates', a: 'ats/applications', j: 'ats/jobs',
  o: 'crm/opportunities', k: 'contacts',
};
const KIND_TITLE = { c: 'Open candidate', a: 'Open application', j: 'Open job', o: 'Open opportunity', k: 'Open contact' };

function entityPath(orgSlug, kind, id) {
  const p = KIND_PATH[kind];
  return p ? `/org/${orgSlug}/${p}/${id}` : null;
}

// ────────────────────────────────────────────────────────────────────────────

// Lightweight markdown for assistant text: **bold**, lists, entity links.
function renderAssistantText(text, { orgSlug, navigate }) {
  if (!text) return null;
  const parts = [];
  let lineKey = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) { parts.push(<div key={lineKey++} className="h-1.5" />); continue; }
    parts.push(<div key={lineKey++} className="leading-snug">{renderInline(raw, { orgSlug, navigate })}</div>);
  }
  return parts;
}

function renderInline(raw, { orgSlug, navigate }) {
  // Tokens, in order of precedence:
  //   **bold**
  //   [Label](k:ObjectId)      — markdown-style entity link  ← preferred
  //   [k:ObjectId]             — typed bracket-prefix marker
  //   [ObjectId]               — legacy plain-id fallback, routes to candidate
  //   bare 24-hex              — defensive: scrub if it slips into prose
  const out = [];
  const re = /(\*\*[^*]+\*\*)|(\[([^\]]+)\]\((c|a|j|o|k):([a-f0-9]{24})\))|(\[(c|a|j|o|k):[a-f0-9]{24}\])|(\[[a-f0-9]{24}\])|(\b[a-f0-9]{24}\b)/gi;
  let lastIdx = 0;
  let m;
  let k = 0;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > lastIdx) out.push(<span key={k++}>{raw.slice(lastIdx, m.index)}</span>);
    const seg = m[0];
    if (/^[a-f0-9]{24}$/i.test(seg)) {
      lastIdx = m.index + seg.length;
      if (out.length && typeof out[out.length - 1]?.props?.children === 'string') {
        const last = out[out.length - 1];
        const txt = last.props.children;
        if (txt.endsWith('#')) out[out.length - 1] = <span key={`s${k++}`}>{txt.slice(0, -1)}</span>;
      }
      continue;
    }
    if (seg.startsWith('**')) {
      out.push(<strong key={k++} className="text-white">{renderInline(seg.slice(2, -2), { orgSlug, navigate })}</strong>);
    } else if (m[2]) {
      const label = m[3];
      const kind = m[4].toLowerCase();
      const href = entityPath(orgSlug, kind, m[5]);
      out.push(
        <a key={k++} href={href} onClick={(e) => { e.preventDefault(); navigate(href); }}
          className="text-rivvra-300 hover:underline decoration-rivvra-500/40 underline-offset-2 font-medium">{label}</a>,
      );
    } else if (/^\[[cajok]:/i.test(seg)) {
      const kind = seg[1].toLowerCase();
      const href = entityPath(orgSlug, kind, seg.slice(3, -1));
      out.push(
        <a key={k++} href={href} onClick={(e) => { e.preventDefault(); navigate(href); }}
          className="text-rivvra-300 hover:underline decoration-rivvra-500/40 underline-offset-2" title={KIND_TITLE[kind]}>→</a>,
      );
    } else {
      const id = seg.slice(1, -1);
      const href = entityPath(orgSlug, 'c', id);
      out.push(
        <a key={k++} href={href} onClick={(e) => { e.preventDefault(); navigate(href); }} className="text-rivvra-300 hover:underline">#{id.slice(-6)}</a>,
      );
    }
    lastIdx = m.index + seg.length;
  }
  if (lastIdx < raw.length) out.push(<span key={k++}>{raw.slice(lastIdx)}</span>);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────

const TOOL_LABEL = {
  searchCandidates: 'Searching candidates', getCandidate: 'Loading candidate',
  searchApplications: 'Searching applications', getApplication: 'Loading application',
  searchJobs: 'Searching jobs', getJob: 'Loading job', getJobPipeline: 'Loading pipeline',
  recruiterStats: 'Crunching stats', compareCandidates: 'Comparing candidates',
  listActivities: 'Reading activity', listAttachments: 'Listing files', listPicklist: 'Reading settings',
  searchOpportunities: 'Searching deals', getOpportunity: 'Loading deal', pipelineSummary: 'Summing the pipeline',
  staleOpportunities: 'Finding quiet deals', opportunityActivities: 'Reading deal timeline',
  draftOpportunityNote: 'Drafting a note', draftContactNote: 'Drafting a note', draftEmail: 'Drafting an email',
  searchContacts: 'Searching contacts', getContact: 'Loading contact', contactsAtCompany: 'Finding people',
  engagementSummary: 'Counting engagement', searchKnowledgeBase: 'Searching the knowledge base',
  currentScope: 'Checking scope', useApp: 'Loading more tools',
};

function KindIcon({ kind }) {
  const cls = 'text-rivvra-300/80';
  switch (kind) {
    case 'application':
      return <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={cls}><path d="M4 3h10l2 2v12H4V3z" fillOpacity="0.4" /><path d="M4 3h10l2 2H4z" /></svg>;
    case 'job':
      return <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={cls}><path d="M6 6V4a2 2 0 012-2h4a2 2 0 012 2v2h3a1 1 0 011 1v9a1 1 0 01-1 1H2a1 1 0 01-1-1V7a1 1 0 011-1h4zm2 0h4V4H8v2z" /></svg>;
    case 'opportunity':
      return <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={cls}><path d="M2 14l5-5 3 3 6-7 2 2-8 9-3-3-3 3z" /></svg>;
    case 'company':
      return <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={cls}><path d="M3 18V4a1 1 0 011-1h7a1 1 0 011 1v4h4a1 1 0 011 1v9H3zm2-1h5V5H5v12zm7 0h4v-8h-4v8z" /></svg>;
    default:
      return <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={cls}><path d="M10 10a3 3 0 100-6 3 3 0 000 6zM3 17a7 7 0 0114 0H3z" /></svg>;
  }
}

function ToolCallPill({ name, args, summary, navigate, onItemClick }) {
  const label = TOOL_LABEL[name] || name;
  const argSummary = useMemo(() => {
    if (!args) return '';
    const parts = [];
    if (Array.isArray(args.skills) && args.skills.length) parts.push(args.skills.join(' + '));
    if (typeof args.minYears === 'number') parts.push(`${args.minYears}+ yrs`);
    if (args.status) parts.push(args.status);
    if (args.stageName || args.stageNameContains) parts.push(args.stageName || args.stageNameContains);
    if (args.jobNameContains) parts.push(`"${args.jobNameContains}"`);
    if (args.search) parts.push(`"${args.search}"`);
    if (args.engagement) parts.push(args.engagement.replace('_', ' '));
    if (typeof args.days === 'number') parts.push(`${args.days} days`);
    if (args.mineOnly) parts.push('mine');
    if (typeof args.minFitScore === 'number') parts.push(`fit ≥ ${args.minFitScore}`);
    return parts.join(' · ');
  }, [args]);

  const items = summary?.items || [];
  return (
    <div className="space-y-1.5 my-1">
      <div className="inline-flex items-start gap-2 text-[11px] rounded-md bg-dark-800/60 border border-dark-700 px-2 py-1.5 max-w-full">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-rivvra-300 mt-0.5 flex-shrink-0">
          {summary
            ? <path d="M16.7 5.3l-7.4 7.4-4-4-1.4 1.4 5.4 5.4 8.8-8.8z" />
            : <circle cx="10" cy="10" r="3"><animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" /></circle>}
        </svg>
        <div className="min-w-0">
          <div className="text-dark-300 font-medium">{label}{summary ? '' : '…'}</div>
          {argSummary && <div className="text-dark-500 truncate">{argSummary}</div>}
          {summary && typeof summary.matchCount === 'number' && (
            <div className="text-emerald-400 text-[10px]">{summary.matchCount} {summary.matchCount === 1 ? 'match' : 'matches'}</div>
          )}
          {summary && summary.error && <div className="text-rose-400 text-[10px]">Error: {summary.error}</div>}
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-1 pl-1">
          {items.map((it, i) => {
            const clickable = !!it._viewUrl;
            const content = (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0"><KindIcon kind={it._kind} /></span>
                  <span className="text-sm text-dark-100 truncate font-medium">{it.name}</span>
                  {it.meta && <span className="text-[11px] text-dark-500 truncate">· {it.meta}</span>}
                  {clickable && (
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" className="ml-auto text-dark-500 group-hover:text-rivvra-300 transition-colors flex-shrink-0"><path d="M4 10h10m0 0l-4-4m4 4l-4 4" /></svg>
                  )}
                </div>
                {Array.isArray(it.skills) && it.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 pl-[18px]">
                    {it.skills.map((s) => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700/60 text-dark-300 leading-tight">{s}</span>)}
                  </div>
                )}
              </>
            );
            return clickable ? (
              <a key={`${it._id}-${i}`} href={it._viewUrl}
                onClick={(e) => {
                  // Cmd/Ctrl-click = full detail page; plain click = preview drawer.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  e.preventDefault();
                  if (onItemClick) onItemClick(it); else navigate(it._viewUrl);
                }}
                className="group flex flex-col px-2 py-1.5 rounded-md bg-dark-800/40 hover:bg-dark-800 border border-dark-700/60 hover:border-rivvra-500/40 transition-all">{content}</a>
            ) : (
              <div key={`${it._id}-${i}`} className="flex flex-col px-2 py-1.5 rounded-md bg-dark-800/30 border border-dark-700/50">{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Draft card: the assistant prepared something; the user saves/sends it ──
function DraftCard({ draft, navigate }) {
  const [copied, setCopied] = useState(false);
  const p = draft.payload || {};
  const isNote = draft.kind === 'crm.note';
  const isEmail = draft.kind === 'email';
  const bodyText = isEmail ? `Subject: ${p.subject}\n\n${p.body}` : [p.summary, p.note].filter(Boolean).join('\n');

  const copy = async () => {
    try { await navigator.clipboard.writeText(isEmail ? p.body : bodyText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const openInApp = () => {
    if (!draft.openPath) return;
    const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try { sessionStorage.setItem(`rivvra_assistant_draft:${key}`, JSON.stringify(draft)); } catch { /* ignore */ }
    navigate(`${draft.openPath}${draft.openPath.includes('?') ? '&' : '?'}draft=${key}`);
  };
  const mailto = isEmail && p.to ? `mailto:${encodeURIComponent(p.to)}?subject=${encodeURIComponent(p.subject || '')}&body=${encodeURIComponent(p.body || '')}` : null;

  return (
    <div className="my-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-amber-500/20">
        <span className="text-[10px] uppercase tracking-wider text-amber-300 font-medium">Draft · {isNote ? 'note' : isEmail ? 'email' : draft.kind}</span>
        <span className="text-xs text-dark-200 truncate">{draft.title}</span>
      </div>
      <div className="px-3 py-2 text-xs text-dark-200 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
        {isEmail && p.to && <div className="text-dark-500 mb-1">To: {p.toName ? `${p.toName} <${p.to}>` : p.to}</div>}
        {isEmail && !p.to && <div className="text-rose-300 mb-1">No email address on file for {p.toName}.</div>}
        {bodyText}
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-amber-500/20 bg-dark-900/40">
        {isNote && draft.openPath && (
          <button type="button" onClick={openInApp} className="text-[11px] px-2.5 py-1 rounded-md bg-rivvra-500 hover:bg-rivvra-400 text-white font-medium">Review &amp; save in app</button>
        )}
        {mailto && (
          <a href={mailto} className="text-[11px] px-2.5 py-1 rounded-md bg-rivvra-500 hover:bg-rivvra-400 text-white font-medium">Open in mail app</a>
        )}
        <button type="button" onClick={copy} className="text-[11px] px-2.5 py-1 rounded-md border border-dark-600 text-dark-200 hover:bg-dark-800">{copied ? 'Copied' : 'Copy'}</button>
        <span className="ml-auto text-[10px] text-dark-500">Nothing is saved until you do</span>
      </div>
    </div>
  );
}

function ListLinks({ links, navigate }) {
  if (!links?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1.5">
      {links.map((l) => (
        <a key={l.url} href={l.url} onClick={(e) => { e.preventDefault(); navigate(l.url); }}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-rivvra-500/10 border border-rivvra-500/30 text-rivvra-200 hover:bg-rivvra-500/20 hover:border-rivvra-500/50 transition-colors">
          {l.label}
          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path d="M4 10h10m0 0l-4-4m4 4l-4 4" /></svg>
        </a>
      ))}
    </div>
  );
}

function AssistantMessage({ m, orgSlug, navigate, onItemClick, streamingCursor = false }) {
  return (
    <div className="max-w-[92%] text-sm text-dark-200 space-y-1">
      {m.toolCalls?.map((tc, i) => (
        <ToolCallPill key={tc.id || i} name={tc.name} args={tc.args} summary={tc.summary} navigate={navigate} onItemClick={onItemClick} />
      ))}
      {m.content && (
        <div className="whitespace-pre-wrap break-words">
          {renderAssistantText(m.content, { orgSlug, navigate })}
          {streamingCursor && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-rivvra-400 animate-pulse rounded-sm align-middle" />}
        </div>
      )}
      {m.drafts?.map((d, i) => <DraftCard key={i} draft={d} navigate={navigate} />)}
      <ListLinks links={m.listLinks} navigate={navigate} />
    </div>
  );
}

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
        drafts: [], // stored drafts are titles only; the cards were one-shot
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
  const onItemClick = (it) => setPreviewItem({ kind: it._kind, id: it._id });
  const emptyState = messages.length === 0 && !pending;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Ask Rivvra (⌘K)"
          className="fixed bottom-6 right-6 z-40 group inline-flex items-center gap-2.5 pl-3 pr-3.5 h-11 rounded-full bg-dark-900/95 backdrop-blur border border-dark-700/80 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)_inset] hover:border-rivvra-500/40 hover:bg-dark-800/95 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ease-out text-sm font-medium text-white tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-rivvra-500/40"
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
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-2 ring-dark-900 shadow-[0_0_6px_rgba(52,211,153,0.5)]" aria-hidden="true" />
          </span>
          <span className="leading-none">Ask Rivvra</span>
          {/* dark-300 on purpose: this launcher renders OUTSIDE .ds-shell, so the
              palette bridge never reaches it (see 2026-08 contrast note). */}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-0.5 text-[10px] font-mono text-dark-300 group-hover:text-dark-100 px-1.5 py-0.5 rounded border border-dark-700 bg-dark-950/40 leading-none transition-colors">⌘K</kbd>
        </button>
      )}

      {previewItem && <PreviewDrawer item={previewItem} orgSlug={orgSlug} onClose={() => setPreviewItem(null)} />}

      {open && (
        <div className="fixed bottom-5 right-5 z-40 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl bg-dark-900 border border-dark-700 shadow-2xl shadow-black/40 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700 bg-gradient-to-r from-dark-800 to-dark-900">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-md bg-rivvra-500/15 text-rivvra-300 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l1.5 4.5L16 8l-4.5 1.5L10 14l-1.5-4.5L4 8l4.5-1.5L10 2z" /></svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Ask Rivvra</div>
                {/* Scope chip — the company every answer is bound to, from the server. */}
                <div className="text-[10px] text-dark-400 flex items-center gap-1" title="Answers are limited to this company">
                  <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3 18V4a1 1 0 011-1h7a1 1 0 011 1v4h4a1 1 0 011 1v9h1v1H2v-1h1zm2-1h5V5H5v12zm7 0h4v-8h-4v8zM6 6h3v2H6V6zm0 3h3v2H6V9zm0 3h3v2H6v-2zm7 0h2v2h-2v-2zm0-3h2v2h-2V9z" /></svg>
                  <span className="truncate max-w-[220px]">{scopeName}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {(messages.length > 0 || threadId) && (
                <button type="button" onClick={resetConversation} className="text-[11px] text-dark-400 hover:text-dark-200 px-2 py-1 rounded hover:bg-dark-800" aria-label="Start a new conversation">New</button>
              )}
              <button type="button" onClick={closePanel} className="h-7 w-7 rounded text-dark-400 hover:text-white hover:bg-dark-800 flex items-center justify-center" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M14.3 5.7L10 10l4.3 4.3-1.4 1.4L8.6 11.4l-4.3 4.3L2.9 14.3 7.2 10 2.9 5.7 4.3 4.3l4.3 4.3 4.3-4.3z" /></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {emptyState && (
              <div className="space-y-3 pt-2">
                <div className="text-xs text-dark-400 px-1">Ask about your data in {scopeName} — I search your real records, and only this company's.</div>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((q) => (
                    <button key={q} type="button" onClick={() => send(q)} className="text-left text-xs px-3 py-2 rounded-lg bg-dark-800/60 border border-dark-700 text-dark-200 hover:bg-dark-800 hover:border-rivvra-500/40 transition-colors">{q}</button>
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
                  <div className="max-w-[85%] bg-rivvra-500/20 border border-rivvra-500/30 text-white text-sm rounded-2xl rounded-br-md px-3 py-2">{m.content}</div>
                ) : (
                  <AssistantMessage m={m} orgSlug={orgSlug} navigate={navigate} onItemClick={onItemClick} />
                )}
              </div>
            ))}

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
                <AssistantMessage m={pending} orgSlug={orgSlug} navigate={navigate} onItemClick={onItemClick} streamingCursor />
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-dark-700 p-2 bg-dark-900">
            <div className="flex items-end gap-2 rounded-lg bg-dark-800 border border-dark-700 focus-within:border-rivvra-500/50 px-2 py-1.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask about your data…"
                rows={1}
                disabled={streaming}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-dark-500 resize-none focus:outline-none disabled:opacity-50 py-1 max-h-32"
                style={{ minHeight: '24px' }}
              />
              {streaming ? (
                <button type="button" onClick={stop} className="h-8 w-8 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center" aria-label="Stop">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="1" /></svg>
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()} className="h-8 w-8 rounded-md bg-rivvra-500 hover:bg-rivvra-400 disabled:bg-dark-700 disabled:text-dark-500 text-white flex items-center justify-center transition-colors" aria-label="Send">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10l16-8-7 16-2-6-7-2z" /></svg>
                </button>
              )}
            </div>
            <div className="text-[10px] text-dark-400 px-1 pt-1">
              Press Enter to send · Shift+Enter for newline · Answers limited to {scopeName}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
