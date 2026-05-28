/**
 * ChatbotWidget.jsx — floating ATS assistant.
 *
 * Lives bottom-right on every authenticated /org/:slug/ats/* page. Click
 * the FAB to open a slide-up panel with a streaming conversation.
 *
 * Wire: mount once inside OrgPlatformLayout (see App.jsx). The widget
 * gates itself on route + ATS app access.
 *
 * Backend: POST /api/org/:slug/ats/chatbot/stream (SSE). See
 * src/chatbot.js on the API side for the event protocol.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { streamChatbot } from '../../utils/chatbotApi';
import PreviewDrawer from './PreviewDrawer';

const SAMPLE_QUERIES = [
  'Find Salesforce developers with 8+ years',
  'Show me open applications scoring 80+',
  'How many ongoing applications do we have?',
  'Who has applied for Python Django roles?',
  'Compare the top 3 candidates for our UiPath role',
];

// ────────────────────────────────────────────────────────────────────────────

function generateSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Lightweight markdown for assistant text: **bold**, lists, candidate links.
// Candidate refs in [bracketed] 24-char hex are turned into <a> tags.
function renderAssistantText(text, { orgSlug, navigate }) {
  if (!text) return null;
  // Split into lines for list handling.
  const parts = [];
  let lineKey = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) { parts.push(<div key={lineKey++} className="h-1.5" />); continue; }
    parts.push(<div key={lineKey++} className="leading-snug">{renderInline(raw, { orgSlug, navigate })}</div>);
  }
  return parts;
}

function renderInline(raw, { orgSlug, navigate }) {
  // Tokenize, in order of precedence:
  //   **bold**
  //   [Label](c:ObjectId)   — markdown-style entity link  ← preferred
  //   [c:ObjectId] / [a:…] / [j:…]   — typed bracket-prefix marker
  //   [ObjectId]            — legacy plain-id fallback, routes to candidate
  //   bare 24-hex           — defensive: scrub if it slips into prose
  const out = [];
  const re = /(\*\*[^*]+\*\*)|(\[([^\]]+)\]\((c|a|j):([a-f0-9]{24})\))|(\[(c|a|j):[a-f0-9]{24}\])|(\[[a-f0-9]{24}\])|(\b[a-f0-9]{24}\b)/gi;
  const KIND_PATH = { c: 'candidates', a: 'applications', j: 'jobs' };
  let lastIdx = 0;
  let m;
  let k = 0;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > lastIdx) out.push(<span key={k++}>{raw.slice(lastIdx, m.index)}</span>);
    const seg = m[0];
    // Bare 24-hex (not inside brackets) — silently drop. The LLM was told
    // not to do this but we don't trust it.
    if (/^[a-f0-9]{24}$/i.test(seg)) {
      lastIdx = m.index + seg.length;
      // Also swallow a leading hash if present (#abc123 cleanup).
      if (out.length && typeof out[out.length-1]?.props?.children === 'string') {
        const last = out[out.length-1];
        const txt = last.props.children;
        if (txt.endsWith('#')) {
          out[out.length-1] = <span key={`s${k++}`}>{txt.slice(0, -1)}</span>;
        }
      }
      continue;
    }
    if (seg.startsWith('**')) {
      // Recursively parse the bold's content so e.g. **[Name](c:id)**
      // renders as <strong><a>Name</a></strong> — without this the
      // outer bold swallows the markdown link as plain text.
      out.push(
        <strong key={k++} className="text-white">
          {renderInline(seg.slice(2, -2), { orgSlug, navigate })}
        </strong>,
      );
    } else if (m[2]) {
      // Markdown-style entity link: [Label](kind:id)
      const label = m[3];
      const kind = m[4].toLowerCase();
      const id = m[5];
      const path = KIND_PATH[kind];
      out.push(
        <a
          key={k++}
          href={`/org/${orgSlug}/ats/${path}/${id}`}
          onClick={(e) => { e.preventDefault(); navigate(`/org/${orgSlug}/ats/${path}/${id}`); }}
          className="text-rivvra-300 hover:underline decoration-rivvra-500/40 underline-offset-2 font-medium"
        >{label}</a>,
      );
    } else if (seg.match(/^\[[caj]:/i)) {
      const kind = seg[1].toLowerCase();
      const id = seg.slice(3, -1);
      const path = KIND_PATH[kind];
      out.push(
        <a
          key={k++}
          href={`/org/${orgSlug}/ats/${path}/${id}`}
          onClick={(e) => { e.preventDefault(); navigate(`/org/${orgSlug}/ats/${path}/${id}`); }}
          className="text-rivvra-300 hover:underline decoration-rivvra-500/40 underline-offset-2"
          title={kind === 'c' ? 'Open candidate' : kind === 'a' ? 'Open application' : 'Open job'}
        >→</a>,
      );
    } else {
      // Legacy [ObjectId] — assume candidate.
      const id = seg.slice(1, -1);
      out.push(
        <a
          key={k++}
          href={`/org/${orgSlug}/ats/candidates/${id}`}
          onClick={(e) => { e.preventDefault(); navigate(`/org/${orgSlug}/ats/candidates/${id}`); }}
          className="text-rivvra-300 hover:underline"
        >#{id.slice(-6)}</a>,
      );
    }
    lastIdx = m.index + seg.length;
  }
  if (lastIdx < raw.length) out.push(<span key={k++}>{raw.slice(lastIdx)}</span>);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────

function ToolCallPill({ name, args, summary, navigate, onItemClick }) {
  const label = {
    searchCandidates: 'Searching candidates',
    getCandidate: 'Loading candidate',
    searchApplications: 'Searching applications',
    getJobPipeline: 'Loading pipeline',
    recruiterStats: 'Crunching stats',
    compareCandidates: 'Comparing candidates',
  }[name] || name;

  const KIND_ICON = {
    candidate: (
      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="text-rivvra-300/80">
        <path d="M10 10a3 3 0 100-6 3 3 0 000 6zM3 17a7 7 0 0114 0H3z"/>
      </svg>
    ),
    application: (
      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="text-rivvra-300/80">
        <path d="M4 3h10l2 2v12H4V3z" fillOpacity="0.4"/>
        <path d="M4 3h10l2 2H4z"/>
      </svg>
    ),
    job: (
      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="text-rivvra-300/80">
        <path d="M6 6V4a2 2 0 012-2h4a2 2 0 012 2v2h3a1 1 0 011 1v9a1 1 0 01-1 1H2a1 1 0 01-1-1V7a1 1 0 011-1h4zm2 0h4V4H8v2z"/>
      </svg>
    ),
  };

  const argSummary = useMemo(() => {
    if (!args) return '';
    const parts = [];
    if (Array.isArray(args.skills) && args.skills.length) parts.push(args.skills.join(' + '));
    if (typeof args.minYears === 'number') parts.push(`${args.minYears}+ yrs`);
    if (args.status) parts.push(args.status);
    if (args.stageName) parts.push(args.stageName);
    if (args.jobNameContains) parts.push(`"${args.jobNameContains}"`);
    if (typeof args.minFitScore === 'number') parts.push(`fit ≥ ${args.minFitScore}`);
    return parts.join(' · ');
  }, [args]);

  const items = summary?.items || [];

  return (
    <div className="space-y-1.5 my-1">
      <div className="inline-flex items-start gap-2 text-[11px] rounded-md bg-dark-800/60 border border-dark-700 px-2 py-1.5 max-w-full">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-rivvra-300 mt-0.5 flex-shrink-0">
          {summary
            ? <path d="M16.7 5.3l-7.4 7.4-4-4-1.4 1.4 5.4 5.4 8.8-8.8z"/>
            : <circle cx="10" cy="10" r="3"><animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite"/></circle>}
        </svg>
        <div className="min-w-0">
          <div className="text-dark-300 font-medium">{label}{summary ? '' : '…'}</div>
          {argSummary && <div className="text-dark-500 truncate">{argSummary}</div>}
          {summary && typeof summary.matchCount === 'number' && (
            <div className="text-emerald-400 text-[10px]">{summary.matchCount} {summary.matchCount === 1 ? 'match' : 'matches'}</div>
          )}
          {summary && summary.error && (
            <div className="text-rose-400 text-[10px]">Error: {summary.error}</div>
          )}
        </div>
      </div>

      {/* Linkable result cards — guaranteed clickable, independent of LLM
          formatting. The recruiter doesn't need the bot to ask for IDs;
          they can jump directly from any card to the detail page. */}
      {items.length > 0 && (
        <div className="flex flex-col gap-1 pl-1">
          {items.map((it, i) => {
            const clickable = !!it._viewUrl;
            const content = (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0">{KIND_ICON[it._kind] || KIND_ICON.candidate}</span>
                  <span className="text-sm text-dark-100 truncate font-medium">{it.name}</span>
                  {it.meta && <span className="text-[11px] text-dark-500 truncate">· {it.meta}</span>}
                  {clickable && (
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" className="ml-auto text-dark-500 group-hover:text-rivvra-300 transition-colors flex-shrink-0">
                      <path d="M4 10h10m0 0l-4-4m4 4l-4 4"/>
                    </svg>
                  )}
                </div>
                {Array.isArray(it.skills) && it.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 pl-[18px]">
                    {it.skills.map((s) => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-dark-700/60 text-dark-300 leading-tight">{s}</span>
                    ))}
                  </div>
                )}
              </>
            );
            return clickable ? (
              <a
                key={`${it._id}-${i}`}
                href={it._viewUrl}
                onClick={(e) => {
                  // Cmd/Ctrl-click = open the full detail page in this tab
                  // (recruiter wants the canonical editor). Plain click =
                  // preview drawer (recruiter wants to stay in chat flow).
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                  e.preventDefault();
                  if (onItemClick) onItemClick(it);
                  else navigate(it._viewUrl);
                }}
                className="group flex flex-col px-2 py-1.5 rounded-md bg-dark-800/40 hover:bg-dark-800 border border-dark-700/60 hover:border-rivvra-500/40 transition-all"
              >{content}</a>
            ) : (
              <div key={`${it._id}-${i}`} className="flex flex-col px-2 py-1.5 rounded-md bg-dark-800/30 border border-dark-700/50">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function ChatbotWidget() {
  const location = useLocation();
  const { slug: routeSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg, getAppRole } = useOrg();
  const orgSlug = routeSlug || currentOrg?.slug;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // [{role, content, toolCalls?}]
  const [streaming, setStreaming] = useState(false);
  const [pendingTokens, setPendingTokens] = useState('');
  const [pendingTools, setPendingTools] = useState([]);
  const [pendingListLinks, setPendingListLinks] = useState([]);
  // Phase 3.3 — clicking a result card opens this preview drawer instead
  // of navigating away. Cmd/Ctrl-click bypasses to the full detail page.
  const [previewItem, setPreviewItem] = useState(null); // { kind, id }
  const [input, setInput] = useState('');
  const [sessionId] = useState(() => generateSessionId());
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  // Render only on ATS routes — chatbot v1 is ATS-scoped, would be confusing
  // to surface on payroll/CRM pages where it can't answer questions.
  const onAtsRoute = location.pathname.includes('/ats/') || location.pathname.endsWith('/ats');
  const hasAtsAccess = !!getAppRole?.('ats');

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pendingTokens, pendingTools]);

  const send = useCallback(async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text || streaming || !orgSlug) return;
    const userMsg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setStreaming(true);
    setPendingTokens('');
    setPendingTools([]);
    setPendingListLinks([]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let acc = '';
    const tools = [];
    const listLinks = [];
    try {
      // `data` arrives already-parsed (chatbotApi unwraps the JSON envelope).
      // For token events it's a string; for tool_call/result it's an object.
      for await (const { event, data } of streamChatbot(orgSlug, history, { sessionId, signal: ctrl.signal })) {
        if (event === 'token') {
          acc += typeof data === 'string' ? data : '';
          setPendingTokens(acc);
        } else if (event === 'tool_call') {
          tools.push({ id: data.id, name: data.name, args: data.args, summary: null });
          setPendingTools([...tools]);
        } else if (event === 'tool_result') {
          const t = tools.find((x) => x.id === data.id);
          if (t) { t.summary = data.summary; }
          setPendingTools([...tools]);
        } else if (event === 'list_link') {
          if (data?.url && !listLinks.find((l) => l.url === data.url)) {
            listLinks.push({ label: data.label, url: data.url });
            setPendingListLinks([...listLinks]);
          }
        } else if (event === 'error') {
          acc += `\n\n_⚠️ ${data?.message || 'Something went wrong'}_`;
          setPendingTokens(acc);
        } else if (event === 'done') {
          // Server flushed final stream. Done.
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        acc += '\n\n_(stopped)_';
      } else {
        acc = (acc || '') + (acc ? '\n\n' : '') + `_⚠️ ${err.message || 'Network error'}_`;
      }
      setPendingTokens(acc);
    } finally {
      setMessages((prev) => [...prev, { role: 'assistant', content: acc, toolCalls: tools, listLinks }]);
      setPendingTokens('');
      setPendingTools([]);
      setPendingListLinks([]);
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, orgSlug, messages, sessionId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setPendingTokens('');
    setPendingTools([]);
    setPendingListLinks([]);
    setPreviewItem(null);
  }, [streaming]);

  // Closing the panel must abort any in-flight stream — otherwise tokens
  // keep generating on the backend (cost) and the next open() shows stale
  // pendingTokens.
  const closePanel = useCallback(() => {
    if (streaming) abortRef.current?.abort();
    setOpen(false);
  }, [streaming]);

  // ⌘K / Ctrl-K opens the assistant from anywhere on an ATS page.
  // ESC closes the PANEL — but only when no PreviewDrawer is open above
  // it. Otherwise a single ESC press would close both at once.
  useEffect(() => {
    if (!onAtsRoute || !hasAtsAccess) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
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
  }, [onAtsRoute, hasAtsAccess, open, previewItem]);

  // Bug 5 fix: abort any in-flight stream when the widget unmounts (route
  // change while a query is mid-flight). Without this the fetch keeps
  // running in the background and the server keeps generating tokens.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Hide widget entirely when off-route or no ATS access.
  if (!user || !orgSlug || !onAtsRoute || !hasAtsAccess) return null;

  return (
    <>
      {/* FAB — pill with icon + label + shortcut. Restrained dark monochrome
          with one rivvra accent on the icon, matches Linear/v0/Vercel style.
          See ChatbotWidget redesign 2026-05-28. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant (⌘K)"
          className="fixed bottom-6 right-6 z-40 group inline-flex items-center gap-2.5 pl-3 pr-3.5 h-11 rounded-full bg-dark-900/95 backdrop-blur border border-dark-700/80 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)_inset] hover:border-rivvra-500/40 hover:bg-dark-800/95 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ease-out text-sm font-medium text-white tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-rivvra-500/40"
        >
          <span className="relative inline-flex items-center justify-center w-5 h-5">
            {/* 4-point star with stroked, two-stop gradient — feels hand-drawn,
                not a filled diamond. */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-rivvra-300 transition-transform duration-300 group-hover:rotate-[15deg]">
              <defs>
                <linearGradient id="aiStarGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#6ee7b7"/>
                  <stop offset="100%" stopColor="#10b981"/>
                </linearGradient>
              </defs>
              <path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z" stroke="url(#aiStarGrad)" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
            {/* Online dot — static green pulse, indicates "AI is ready". */}
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-2 ring-dark-900 shadow-[0_0_6px_rgba(52,211,153,0.5)]" aria-hidden="true" />
          </span>
          <span className="leading-none">Ask AI</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-0.5 text-[10px] font-mono text-dark-500 group-hover:text-dark-400 px-1.5 py-0.5 rounded border border-dark-700 bg-dark-950/40 leading-none transition-colors">⌘K</kbd>
        </button>
      )}

      {/* Preview drawer (left side) — rendered when user clicks a result
          card. Keeps the chat panel visible on the right so they can
          glance at a candidate and keep scanning others. */}
      {previewItem && (
        <PreviewDrawer
          item={previewItem}
          orgSlug={orgSlug}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl bg-dark-900 border border-dark-700 shadow-2xl shadow-black/40 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700 bg-gradient-to-r from-dark-800 to-dark-900">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-rivvra-500/15 text-rivvra-300 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2l1.5 4.5L16 8l-4.5 1.5L10 14l-1.5-4.5L4 8l4.5-1.5L10 2z"/>
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">ATS Assistant</div>
                <div className="text-[10px] text-dark-500">{currentOrg?.name || 'Rivvra'}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="text-[11px] text-dark-400 hover:text-dark-200 px-2 py-1 rounded hover:bg-dark-800"
                  aria-label="Clear conversation"
                >Clear</button>
              )}
              <button
                type="button"
                onClick={closePanel}
                className="h-7 w-7 rounded text-dark-400 hover:text-white hover:bg-dark-800 flex items-center justify-center"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M14.3 5.7L10 10l4.3 4.3-1.4 1.4L8.6 11.4l-4.3 4.3L2.9 14.3 7.2 10 2.9 5.7 4.3 4.3l4.3 4.3 4.3-4.3z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && pendingTokens === '' && pendingTools.length === 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-xs text-dark-400 px-1">Ask me about candidates, jobs, or applications — I search your real data.</div>
                <div className="flex flex-col gap-1.5">
                  {SAMPLE_QUERIES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="text-left text-xs px-3 py-2 rounded-lg bg-dark-800/60 border border-dark-700 text-dark-200 hover:bg-dark-800 hover:border-rivvra-500/40 transition-colors"
                    >{q}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'user' ? (
                  <div className="max-w-[85%] bg-rivvra-500/20 border border-rivvra-500/30 text-white text-sm rounded-2xl rounded-br-md px-3 py-2">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[92%] text-sm text-dark-200 space-y-1">
                    {m.toolCalls?.map((tc) => (
                      <ToolCallPill key={tc.id} name={tc.name} args={tc.args} summary={tc.summary} navigate={navigate} onItemClick={(it) => setPreviewItem({ kind: it._kind, id: it._id })} />
                    ))}
                    <div className="whitespace-pre-wrap break-words">
                      {renderAssistantText(m.content, { orgSlug, navigate })}
                    </div>
                    {m.listLinks?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1.5">
                        {m.listLinks.map((l) => (
                          <a
                            key={l.url}
                            href={l.url}
                            onClick={(e) => { e.preventDefault(); navigate(l.url); }}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-rivvra-500/10 border border-rivvra-500/30 text-rivvra-200 hover:bg-rivvra-500/20 hover:border-rivvra-500/50 transition-colors"
                          >
                            {l.label}
                            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path d="M4 10h10m0 0l-4-4m4 4l-4 4"/></svg>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* "Thinking…" placeholder while we wait for the first SSE event
                after the user submits — covers the dead zone before any
                tool_call or token has arrived. Shown only when streaming
                is in flight and we haven't surfaced anything yet. */}
            {streaming && !pendingTokens && pendingTools.length === 0 && (
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

            {/* Live streaming assistant message */}
            {(pendingTokens || pendingTools.length > 0) && (
              <div className="flex justify-start">
                <div className="max-w-[92%] text-sm text-dark-200 space-y-1">
                  {pendingTools.map((tc) => (
                    <ToolCallPill key={tc.id} name={tc.name} args={tc.args} summary={tc.summary} navigate={navigate} onItemClick={(it) => setPreviewItem({ kind: it._kind, id: it._id })} />
                  ))}
                  {pendingTokens && (
                    <div className="whitespace-pre-wrap break-words">
                      {renderAssistantText(pendingTokens, { orgSlug, navigate })}
                      <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-rivvra-400 animate-pulse rounded-sm align-middle" />
                    </div>
                  )}
                  {pendingListLinks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1.5">
                      {pendingListLinks.map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          onClick={(e) => { e.preventDefault(); navigate(l.url); }}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-rivvra-500/10 border border-rivvra-500/30 text-rivvra-200 hover:bg-rivvra-500/20 hover:border-rivvra-500/50 transition-colors"
                        >
                          {l.label}
                          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path d="M4 10h10m0 0l-4-4m4 4l-4 4"/></svg>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="border-t border-dark-700 p-2 bg-dark-900"
          >
            <div className="flex items-end gap-2 rounded-lg bg-dark-800 border border-dark-700 focus-within:border-rivvra-500/50 px-2 py-1.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about candidates, applications, jobs…"
                rows={1}
                disabled={streaming}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-dark-500 resize-none focus:outline-none disabled:opacity-50 py-1 max-h-32"
                style={{ minHeight: '24px' }}
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="h-8 w-8 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center"
                  aria-label="Stop"
                >
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="1"/></svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="h-8 w-8 rounded-md bg-rivvra-500 hover:bg-rivvra-400 disabled:bg-dark-700 disabled:text-dark-500 text-white flex items-center justify-center transition-colors"
                  aria-label="Send"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 10l16-8-7 16-2-6-7-2z"/>
                  </svg>
                </button>
              )}
            </div>
            <div className="text-[10px] text-dark-500 px-1 pt-1">
              Press Enter to send · Shift+Enter for newline · Searches your real ATS data
            </div>
          </form>
        </div>
      )}
    </>
  );
}
