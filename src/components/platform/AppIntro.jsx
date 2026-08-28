// ============================================================================
// AppIntro — first-visit explainer, shown once per app per user
// ============================================================================
//
// The onboarding hub tells a new admin WHAT TO DO. It never says what an app
// IS. Someone who signed up to fill roles opens Outreach and meets a contact
// search with no idea what the app is for, which of their people should live
// in it, or why it earns its place. This card answers three questions in the
// app's own landing page, then gets out of the way for good:
//
//   what   — one plain sentence, no product jargon
//   who    — the role/department that actually works in it day to day
//   why    — the concrete payoff, in staffing-agency terms
//
// Dismissal is stored per user per app on the membership (server-side, so it
// follows them across devices) — see POST /api/org/:slug/app-intro/:appId.
// Only rendered on an app's landing route, never on deep pages.
// ============================================================================

import { useState, useEffect } from 'react';
import { X, ArrowRight, Lightbulb, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';

export const APP_INTROS = {
  outreach: {
    what: 'Outreach finds prospective client companies and the hiring managers inside them, then emails them for you in multi-step sequences from your own inbox.',
    who: 'Your business-development and sales people — anyone whose job is winning new client accounts, not filling roles.',
    why: 'Instead of one-off manual emails, a sequence keeps following up automatically until someone replies, so no lead goes cold while your team is busy recruiting.',
    firstStep: { label: 'Connect Gmail and build your first list', to: '/outreach/engage' },
  },
  ats: {
    what: 'ATS is your recruiting pipeline: jobs, candidates, interviews, offers and placements, from first CV to joining date.',
    who: 'Recruiters and delivery teams — plus hiring managers who approve jobs and offers.',
    why: 'Every candidate\'s stage, feedback and document lives in one place, so nothing is lost in inboxes and you always know which roles are at risk.',
    firstStep: { label: 'Post your first job', to: '/ats/jobs/new' },
  },
  crm: {
    what: 'CRM tracks your client relationships and the deals in flight — who you are talking to, what they might sign, and what stage it is at.',
    who: 'Account managers and business development.',
    why: 'It turns "I think that client wanted three developers" into a pipeline you can forecast revenue from.',
    firstStep: { label: 'Add your first opportunity', to: '/crm/opportunities' },
  },
  invoicing: {
    what: 'Invoicing raises client invoices, records payments and vendor bills, and produces your tax reports.',
    who: 'Finance and accounts — and whoever chases payments.',
    why: 'Invoices are built from the placements and timesheets already in Rivvra, so you bill what was actually worked without re-keying anything.',
    firstStep: { label: 'Create your first invoice', to: '/invoicing/invoices/new' },
  },
  payroll: {
    what: 'Payroll calculates monthly salaries, statutory deductions and payslips for the people you employ.',
    who: 'HR and finance.',
    why: 'It reads attendance and timesheets automatically, so a payroll run is a review-and-approve rather than a spreadsheet rebuild every month.',
    firstStep: { label: 'Set up a salary structure', to: '/payroll/salary-structures' },
  },
  timesheet: {
    what: 'Timesheets capture the hours your placed contractors work against each client project, and route them for approval.',
    who: 'Contractors log time; managers approve it; finance bills from it.',
    why: 'Approved hours flow straight into both client invoices and contractor pay, so the two can never disagree.',
    firstStep: { label: 'Add a client and project', to: '/timesheet/projects' },
  },
  employee: {
    what: 'Employees is your people record: profiles, documents, onboarding, leave and exits.',
    who: 'HR, and managers for their own team.',
    why: 'One authoritative record per person means payroll, timesheets and compliance all read the same source instead of drifting apart.',
    firstStep: { label: 'Add your first employee', to: '/employee/directory' },
  },
  sign: {
    what: 'Sign sends documents for legally-binding e-signature — offer letters, rate confirmations, contracts.',
    who: 'Recruiters sending offers, and anyone who needs a client to countersign.',
    why: 'Signed documents attach themselves to the candidate or client they belong to, so you are never hunting for the executed copy.',
    firstStep: { label: 'Send your first document', to: '/sign/requests' },
  },
  contacts: {
    what: 'Contacts is your shared address book of client companies and the people inside them.',
    who: 'Everyone — it is the layer CRM, ATS and Invoicing all draw client details from.',
    why: 'Update a client once and every deal, job and invoice that references them stays correct.',
    firstStep: { label: 'Add your first client', to: '/contacts' },
  },
  documents: {
    what: 'Documents is shared file storage for the workspace, organised in folders with access control.',
    who: 'Everyone, scoped by who you let in.',
    why: 'Company policies, client contracts and templates live somewhere findable instead of in one person\'s drive.',
    firstStep: { label: 'Upload a document', to: '/documents' },
  },
  todo: {
    what: 'To-Do tracks tasks for you and your team, with reminders and a daily digest.',
    who: 'Everyone.',
    why: 'Follow-ups that would otherwise live in your head — chase this client, check that candidate — become things the system reminds you about.',
    firstStep: { label: 'Add your first task', to: '/todo' },
  },
  expenses: {
    what: 'Expenses captures employee claims and routes them through approval to reimbursement.',
    who: 'Employees submit; managers approve; finance pays.',
    why: 'Claims stop living in email threads, and approved amounts land in payroll automatically.',
    firstStep: { label: 'See how claims work', to: '/expenses' },
  },
  incentive: {
    what: 'Incentive calculates commission for your recruiters and salespeople from the placements and invoices they generated.',
    who: 'Finance and leadership; recruiters see their own.',
    why: 'Commission is derived from billed revenue already in the system, so the number is defensible and nobody rebuilds it in a spreadsheet.',
    firstStep: { label: 'Review incentive settings', to: '/incentive' },
  },
  knowledgeBase: {
    what: 'Knowledge Base is your internal handbook — policies and how-to articles your team can search or ask questions against.',
    who: 'Everyone; HR and ops usually write it.',
    why: 'The same questions stop reaching you personally, and new joiners can answer them themselves.',
    firstStep: { label: 'Browse the knowledge base', to: '/knowledge-base' },
  },
};

export function useAppIntro(orgSlug, appId) {
  const [dismissed, setDismissed] = useState(null); // null = unknown yet
  useEffect(() => {
    if (!orgSlug || !appId) return;
    api.request(`/api/org/${orgSlug}/app-intros`)
      .then((res) => setDismissed(!!res?.suppressed || (res?.dismissed || []).includes(appId)))
      .catch(() => setDismissed(true)); // fail closed: never nag on an error
  }, [orgSlug, appId]);
  const dismiss = () => {
    setDismissed(true);
    api.request(`/api/org/${orgSlug}/app-intro/${appId}/dismiss`, { method: 'POST' }).catch(() => {});
  };
  return { dismissed, dismiss };
}

export default function AppIntro({ appId, appName, orgSlug, orgPath }) {
  const intro = APP_INTROS[appId];
  const { dismissed, dismiss } = useAppIntro(orgSlug, appId);
  if (!intro || dismissed !== false) return null;

  const line = { font: "400 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 };
  const lead = { font: "600 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' };

  return (
    <div style={{
      position: 'relative', marginBottom: 20, padding: '18px 20px',
      borderRadius: 'var(--r-3, 14px)', background: 'var(--surface-2)',
      boxShadow: 'inset 0 0 0 1px var(--line-2)',
    }}>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss introduction"
        style={{
          position: 'absolute', top: 12, right: 12, background: 'none', border: 'none',
          padding: 4, cursor: 'pointer', color: 'var(--fg-4)', lineHeight: 0,
        }}
      >
        <X size={16} />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <Lightbulb size={16} style={{ color: 'var(--brand-ink)', flexShrink: 0 }} />
        <h3 style={{ font: "650 15px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
          New to {appName}?
        </h3>
      </div>

      <div style={{ display: 'grid', gap: 7, maxWidth: 780 }}>
        <p style={line}>{intro.what}</p>
        <p style={line}><span style={lead}>Who uses it: </span>{intro.who}</p>
        <p style={line}><span style={lead}>Why it helps: </span>{intro.why}</p>
      </div>

      {/* Two exits, deliberately different jobs: the first step is for someone
          ready to act; the guide is for someone who wants depth. The card
          stays three lines — anything longer belongs in the Knowledge Base,
          which is where this link goes (filtered to this app). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>
        {intro.firstStep && (
          <Link
            to={orgPath(intro.firstStep.to)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              font: "550 13px/1 'Inter', system-ui, sans-serif",
              color: 'var(--brand-ink)', textDecoration: 'none',
            }}
          >
            {intro.firstStep.label} <ArrowRight size={14} />
          </Link>
        )}
        <Link
          to={orgPath(`/knowledge-base?app=${encodeURIComponent(appId)}`)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            font: "450 13px/1 'Inter', system-ui, sans-serif",
            color: 'var(--fg-3)', textDecoration: 'none',
          }}
        >
          <BookOpen size={14} /> Read the full guide
        </Link>
      </div>
    </div>
  );
}
