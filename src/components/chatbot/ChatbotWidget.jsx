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
  // Tokenize: **bold** | [24-hex id] | plain
  const out = [];
  const re = /(\*\*[^*]+\*\*)|(\[[a-f0-9]{24}\])/gi;
  let lastIdx = 0;
  let m;
  let k = 0;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > lastIdx) out.push(<span key={k++}>{raw.slice(lastIdx, m.index)}</span>);
    const seg = m[0];
    if (seg.startsWith('**')) {
      out.push(<strong key={k++} className="text-white">{seg.slice(2, -2)}</strong>);
    } else {
      // [ObjectId] — link to candidate detail (best guess; works for cand ids)
      const id = seg.slice(1, -1);
      out.push(
        <a
          key={k++}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate(`/org/${orgSlug}/ats/candidates/${id}`);
          }}
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

function ToolCallPill({ name, args, summary }) {
  const label = {
    searchCandidates: 'Searching candidates',
    getCandidate: 'Loading candidate',
    searchApplications: 'Searching applications',
    getJobPipeline: 'Loading pipeline',
    recruiterStats: 'Crunching stats',
    compareCandidates: 'Comparing candidates',
  }[name] || name;

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

  return (
    <div className="inline-flex items-start gap-2 text-[11px] rounded-md bg-dark-800/60 border border-dark-700 px-2 py-1.5 my-1 max-w-full">
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

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let acc = '';
    const tools = [];
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
      setMessages((prev) => [...prev, { role: 'assistant', content: acc, toolCalls: tools }]);
      setPendingTokens('');
      setPendingTools([]);
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
  }, [streaming]);

  // Hide widget entirely when off-route or no ATS access.
  if (!user || !orgSlug || !onAtsRoute || !hasAtsAccess) return null;

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full bg-gradient-to-br from-rivvra-500 to-rivvra-600 hover:from-rivvra-400 hover:to-rivvra-500 text-white shadow-lg shadow-rivvra-500/30 flex items-center justify-center transition-all hover:scale-105"
          aria-label="Open AI assistant"
        >
          <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2l1.5 4.5L16 8l-4.5 1.5L10 14l-1.5-4.5L4 8l4.5-1.5L10 2z"/>
            <circle cx="15" cy="15" r="2"/>
          </svg>
        </button>
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
                onClick={() => setOpen(false)}
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
                      <ToolCallPill key={tc.id} name={tc.name} args={tc.args} summary={tc.summary} />
                    ))}
                    <div className="whitespace-pre-wrap break-words">
                      {renderAssistantText(m.content, { orgSlug, navigate })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Live streaming assistant message */}
            {(pendingTokens || pendingTools.length > 0) && (
              <div className="flex justify-start">
                <div className="max-w-[92%] text-sm text-dark-200 space-y-1">
                  {pendingTools.map((tc) => (
                    <ToolCallPill key={tc.id} name={tc.name} args={tc.args} summary={tc.summary} />
                  ))}
                  {pendingTokens && (
                    <div className="whitespace-pre-wrap break-words">
                      {renderAssistantText(pendingTokens, { orgSlug, navigate })}
                      <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-rivvra-400 animate-pulse rounded-sm align-middle" />
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
