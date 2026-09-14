import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import Shell, { useTalkToUs } from '../../components/marketing/shell/Shell';
import { Section, Eyebrow, AppIcon, CtaBand, Shot } from '../../components/marketing/shell/ui';
import { APPS, APP_BY_ID, appHref } from '../../content/marketing/apps';

const GROUPS = [
  { title: 'Win and place', text: 'From a LinkedIn profile to a hired consultant.', ids: ['outreach', 'crm', 'ats', 'contacts'] },
  { title: 'Run the month', text: 'Hours, invoices, payroll and commission, from the same records.', ids: ['timesheet', 'invoicing', 'payroll', 'incentive', 'expenses'] },
  { title: 'Run the company', text: 'People, documents, signatures and the small tasks in between.', ids: ['employee', 'sign', 'documents', 'todo', 'knowledgeBase'] },
];

const CONNECTIONS = [
  ['Outreach → CRM', 'A saved lead becomes a deal without retyping the company.'],
  ['CRM → ATS', 'A won staffing deal opens the job with the client attached.'],
  ['ATS → Employee', 'A hired candidate becomes an employee with offer details carried over.'],
  ['Employee → Timesheets', 'Assignments set which project a consultant fills hours against and at what rates.'],
  ['Timesheets → Invoicing', 'Approved hours build the client invoice for the period.'],
  ['Timesheets → Payroll', 'Attendance and approved sheets set the days paid.'],
  ['Invoicing → Incentive', 'A paid invoice mints commission drafts for the recruiter and account manager.'],
  ['Expenses → Invoicing', 'An approved claim becomes an employee bill to pay.'],
];

export default function FeaturesPage() {
  useDocumentMeta({ title: 'Features', description: 'Fourteen apps for staffing agencies: Outreach, ATS, CRM, Contacts, Timesheets, Invoicing, Payroll, Incentive, Expenses, Employee, Sign, Documents, To-Do and Knowledge Base.', path: '/features' });
  return <Shell><Features /></Shell>;
}

function Features() {
  const talk = useTalkToUs();
  return (
    <>
      <Section className="pt-16 md:pt-24">
        <div className="max-w-3xl">
          <Eyebrow>Features</Eyebrow>
          <h1 className="mk-display mk-h1">Fourteen apps. <span className="mk-accent">One set of records.</span></h1>
          <p className="mk-lede mt-6">Pick what you need now and add the rest later. Each app stands on its own; together they carry a client from first email to paid invoice without anyone typing a name twice.</p>
        </div>
      </Section>

      {GROUPS.map((g, gi) => (
        <Section key={g.title} line tight={gi > 0}>
          <div className="grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-3"><h2 className="mk-h3">{g.title}</h2><p className="mk-small mt-2" style={{ fontSize: 14.5 }}>{g.text}</p></div>
            <div className="lg:col-span-9 grid sm:grid-cols-2 gap-3">
              {g.ids.map((id) => { const a = APP_BY_ID[id]; return (
                <Link key={id} to={appHref(a)} className="mk-card mk-card--hover p-5 grid gap-3">
                  <div className="flex items-center gap-3"><AppIcon app={a} size={36} /><span className="mk-h4">{a.name}</span></div>
                  <p className="mk-small" style={{ fontSize: 14, color: 'var(--mk-ink-2)' }}>{a.short}</p>
                  <div className="mk-shot mk-shot--crop"><img src={a.hero} alt="" width="2400" height="1350" loading="lazy" decoding="async" /></div>
                  <span className="text-[13.5px] font-medium mk-accent inline-flex items-center gap-1">See {a.name} <ArrowRight style={{ width: 14, height: 14 }} /></span>
                </Link>
              ); })}
            </div>
          </div>
        </Section>
      ))}

      <Section line>
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <Eyebrow>How they connect</Eyebrow>
            <h2 className="mk-display mk-h2">Eight hand-offs that used to be spreadsheets.</h2>
          </div>
          <div className="lg:col-span-8">
            <table className="mk-table">
              <tbody>{CONNECTIONS.map(([k, v]) => <tr key={k}><td className="mk-mono" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{k}</td><td>{v}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section line>
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <Eyebrow>Access</Eyebrow>
            <h2 className="mk-display mk-h2">Per-person app access, per-entity data.</h2>
            <p className="mk-p mt-4">Admins choose which apps each member can open. A workspace can hold more than one legal entity, and records are scoped to the entity a person works in. Consultants see self service and nothing else.</p>
          </div>
          <div className="lg:col-span-7"><Shot src="/shots/settings/users.webp" alt="Users and access: members with app access chips and roles" /></div>
        </div>
      </Section>

      <CtaBand title="Every app, on the Free plan." text="Three seats, all fourteen apps, no card. Upgrade when the limits bite." onTalk={talk} />
    </>
  );
}
