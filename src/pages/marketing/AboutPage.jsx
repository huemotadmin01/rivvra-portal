import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import Shell, { useTalkToUs } from '../../components/marketing/shell/Shell';
import { Section, Eyebrow, Shot, CtaBand } from '../../components/marketing/shell/ui';
import { SUPPORT_EMAIL } from '../../content/marketing/site';

const PRINCIPLES = [
  { title: 'One record, many apps', text: 'A client exists once. So does a consultant, an invoice and a job. Every app reads the same record, so the month closes without reconciliation.' },
  { title: 'Built for agencies, not adapted for them', text: 'Bill rates and pay rates on the same person. Client jobs and internal jobs. Placement fees and monthly staffing invoices. Recruiter commission from paid invoices. These are first-class, not workarounds.' },
  { title: 'Statutory where it matters', text: 'Indian payroll with PF, ESI, PT and TDS, GST-correct invoices, TDS on vendor bills. Where a rule is local, the product follows the local rule.' },
  { title: 'The AI reads; people decide', text: 'Ask Rivvra answers from your data and shows its sources. Résumé scoring explains itself. Nothing is sent, moved or paid by a model.' },
  { title: 'Your data stays yours', text: 'Workspaces are isolated. Exports are on every plan. Access by our staff is audit-logged and needs a reason. Delete on request.' },
  { title: 'A person answers', text: 'Support is email to the people who build the product, with a stated response time on every plan.' },
];

export default function AboutPage() {
  useDocumentMeta({ title: 'About', description: 'Rivvra is the operating platform for staffing agencies: fourteen apps on one set of records, made by a small team in Bengaluru and Austin.', path: '/about' });
  return <Shell><About /></Shell>;
}

function About() {
  const talk = useTalkToUs();
  return (
    <>
      <Section className="pt-16 md:pt-24">
        <div className="max-w-3xl">
          <Eyebrow>About Rivvra</Eyebrow>
          <h1 className="mk-display mk-h1">Staffing runs on too many tools. <span className="mk-accent">We made one.</span></h1>
          <p className="mk-lede mt-6">An agency of thirty people typically runs a sourcing tool, an ATS, a CRM, a timesheet app, an invoicing system, a payroll vendor and a pile of spreadsheets that hold it together. The spreadsheets are where the errors live. Rivvra replaces the pile with fourteen apps that share one set of records.</p>
        </div>
      </Section>

      <Section line>
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <Eyebrow>How we build</Eyebrow>
            <h2 className="mk-display mk-h2">Six things we will not compromise on.</h2>
          </div>
          <div className="lg:col-span-8 grid sm:grid-cols-2 gap-4">
            {PRINCIPLES.map((p) => <div key={p.title} className="mk-card p-6"><h3 className="mk-h4">{p.title}</h3><p className="mk-small mt-2" style={{ fontSize: 14.5, color: 'var(--mk-ink-2)' }}>{p.text}</p></div>)}
          </div>
        </div>
      </Section>

      <Section line>
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <Eyebrow>Where we operate</Eyebrow>
            <h2 className="mk-display mk-h2">Bengaluru and Austin.</h2>
            <p className="mk-p mt-4">Rivvra is developed in Bengaluru with a US entity in Austin, Texas. Customers are staffing and recruitment agencies in India, the United States and Canada, and in-house HR teams who want the self-service half of the product.</p>
            <p className="mk-p mt-3">Support hours follow India business days; priority support answers the same day. Write to <a className="mk-accent" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
          </div>
          <div className="lg:col-span-7"><Shot src="/shots/settings/companies.webp" alt="Workspace settings with two legal entities, one Indian and one American" caption="One workspace, two legal entities: an Indian private limited company and a US corporation." /></div>
        </div>
      </Section>

      <CtaBand title="See it with your own data." text="Start on the Free plan, or tell us about your agency and we will set the workspace up with you." onTalk={talk} />
    </>
  );
}
