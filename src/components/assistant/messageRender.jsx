/**
 * messageRender.jsx — everything Ask Rivvra renders inside a conversation:
 * entity links, tool pills with result cards, draft cards, list links, and
 * the route → app / record helpers. Shared by the floating AssistantPanel
 * and the full-page AssistantPageV2 so both surfaces render identically.
 */

import { useState, useMemo } from 'react';

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
  [/^\/org\/[^/]+\/invoicing\/invoices\/([a-f0-9]{24})/i, 'invoice'],
  [/^\/org\/[^/]+\/incentive\/records\/([a-f0-9]{24})/i, 'incentive'],
  [/^\/org\/[^/]+\/employee\/([a-f0-9]{24})/i, 'employee'],
  [/^\/org\/[^/]+\/expenses\/([a-f0-9]{24})/i, 'expense'],
  [/^\/org\/[^/]+\/sign\/requests\/([a-f0-9]{24})/i, 'signRequest'],
  [/^\/org\/[^/]+\/documents\/([a-f0-9]{24})/i, 'document'],
  [/^\/org\/[^/]+\/outreach\/(?:leads|team-contacts|lists|team-lists)\/([a-f0-9]{24})/i, 'lead'],
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
  i: 'invoicing/invoices', n: 'incentive/records',
  e: 'employee', x: 'expenses',
  l: 'outreach/leads', s: 'sign/requests', d: 'documents',
};
const KIND_TITLE = { c: 'Open candidate', a: 'Open application', j: 'Open job', o: 'Open opportunity', k: 'Open contact', i: 'Open invoice', n: 'Open incentive record', e: 'Open employee', x: 'Open expense', l: 'Open lead', s: 'Open sign request', d: 'Open document' };
// Result-card kinds the PreviewDrawer can render; everything else navigates.
const PREVIEW_KINDS = new Set(['candidate', 'application', 'job', 'opportunity', 'contact', 'company']);

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
  const re = /(\*\*[^*]+\*\*)|(\[([^\]]+)\]\((c|a|j|o|k|i|n|e|x|l|s|d):([a-f0-9]{24})\))|(\[(c|a|j|o|k|i|n|e|x|l|s|d):[a-f0-9]{24}\])|(\[[a-f0-9]{24}\])|(\b[a-f0-9]{24}\b)/gi;
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
    } else if (/^\[[cajokinexlsd]:/i.test(seg)) {
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
  searchInvoices: 'Searching invoices', getInvoice: 'Loading invoice', outstandingByCustomer: 'Aging receivables',
  overdueSummary: 'Finding overdue invoices', paymentsReceived: 'Reading payments', draftFollowUp: 'Drafting a reminder',
  searchIncentives: 'Searching incentives', getIncentive: 'Loading incentive', incentiveSummary: 'Summing incentives',
  incentivesForInvoice: 'Tracing incentives', profitabilitySummary: 'Computing net profit',
  searchEmployees: 'Searching the directory', getEmployee: 'Loading employee', headcountSummary: 'Counting headcount', onboardingProgress: 'Checking onboarding',
  myProfile: 'Loading your profile', myDocuments: 'Listing your documents', myTasks: 'Listing your tasks',
  searchExpenses: 'Searching expenses', getExpense: 'Loading claim', expenseSummary: 'Summing expenses', whoApproves: 'Checking approver',
  timesheets: 'Reading timesheets', missingTimesheets: 'Finding missing timesheets', leaveBalances: 'Reading leave balances', leaveRequests: 'Reading leave requests', holidays: 'Reading holidays',
  payrollRuns: 'Reading payroll runs', payrollRunStatus: 'Checking payroll', salaryHolds: 'Listing salary holds', employeeSalary: 'Loading salary record', fnfSettlements: 'Reading settlements',
  mySalary: 'Loading your salary', myPayslips: 'Loading your payslips', myTax: 'Computing your TDS', myFnf: 'Loading your settlement', myAssets: 'Listing your equipment',
  searchSignRequests: 'Searching sign requests', getSignRequest: 'Loading sign request', signSummary: 'Counting signatures',
  searchDocuments: 'Searching documents', documentFolders: 'Listing folders',
  todoTasks: 'Reading your tasks', todoTeamTasks: 'Reading delegated tasks', todoSummary: 'Counting tasks', draftTodoTask: 'Drafting a task',
  searchAssets: 'Searching assets', assetSummary: 'Counting assets',
  searchLeads: 'Searching leads', getLead: 'Loading lead', repliesToReview: 'Reading replies', sequenceStats: 'Reading sequences',
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
    case 'invoice':
      return <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={cls}><path d="M4 2h9l3 3v13H4V2zm2 6h8v1.5H6V8zm0 3h8v1.5H6V11zm0 3h5v1.5H6V14z" /></svg>;
    case 'incentive':
      return <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={cls}><path d="M10 1l2.4 5 5.6.8-4 3.9.9 5.6L10 13.7l-4.9 2.6.9-5.6-4-3.9 5.6-.8z" /></svg>;
    case 'employee':
      return <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={cls}><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 8a7 7 0 0114 0H3zm11-9h4v1.5h-4V8zm0 3h4v1.5h-4V11z" /></svg>;
    case 'expense':
      return <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className={cls}><path d="M3 4h14v12H3V4zm2 2v8h10V6H5zm2 2h6v1.5H7V8zm0 3h4v1.5H7V11z" /></svg>;
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
  const isTask = draft.kind === 'todo.task';
  const isFollowUp = draft.kind === 'invoicing.followUp';
  const isEmail = draft.kind === 'email' || isFollowUp;
  const bodyText = isEmail ? `Subject: ${p.subject}\n\n${p.body}`
    : isTask ? [p.title, p.description, [p.priority ? `Priority: ${p.priority}` : null, p.dueDate ? `Due: ${p.dueDate}` : null, p.labels?.length ? `Labels: ${p.labels.join(', ')}` : null].filter(Boolean).join(' · ')].filter(Boolean).join('\n')
    : [p.summary, p.note].filter(Boolean).join('\n');

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
        <span className="text-[10px] uppercase tracking-wider text-amber-300 font-medium">Draft · {isNote ? 'note' : isTask ? 'task' : isFollowUp ? 'reminder' : isEmail ? 'email' : draft.kind}</span>
        <span className="text-xs text-dark-200 truncate">{draft.title}</span>
      </div>
      <div className="px-3 py-2 text-xs text-dark-200 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
        {isEmail && p.to && <div className="text-dark-500 mb-1">To: {p.toName ? `${p.toName} <${p.to}>` : p.to}</div>}
        {isEmail && !p.to && <div className="text-rose-300 mb-1">No email address on file for {p.toName}.</div>}
        {bodyText}
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-amber-500/20 bg-dark-900/40">
        {(isNote || isFollowUp || isTask) && draft.openPath && (
          <button type="button" onClick={openInApp} className="text-[11px] px-2.5 py-1 rounded-md bg-rivvra-500 hover:bg-rivvra-400 text-white font-medium">{isFollowUp ? 'Review & send from invoice' : isTask ? 'Review & save in To Do' : 'Review & save in app'}</button>
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

export {
  appFromPath, recordFromPath, entityPath, renderAssistantText,
  KIND_PATH, KIND_TITLE, PREVIEW_KINDS, TOOL_LABEL,
  KindIcon, ToolCallPill, DraftCard, ListLinks, AssistantMessage,
};
