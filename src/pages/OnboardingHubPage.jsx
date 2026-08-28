// ============================================================================
// OnboardingHubPage — the workspace onboarding hub (Apollo-style)
// ============================================================================
//
// Route: /org/:slug/getting-started
//
// A destination, not a banner. The earlier welcome card was dismissible and
// lived on the launcher, so the moment a new admin skipped it the guidance was
// gone forever — and it only ever tracked records created, never the
// configuration that actually gates each app. This page:
//
//   • groups tasks by OUTCOME ("Set up your workspace", "Start hiring",
//     "Bill your clients", …) rather than by app menu order — a new admin
//     thinks in goals, not in our navigation;
//   • marks completion from the server's own detections (records + config),
//     so nothing is self-reported and nothing can drift;
//   • is permanently reachable from the sidebar progress rail, so skipping is
//     "later", not "never".
//
// Groups whose app isn't enabled are dropped entirely — an org without payroll
// never sees payroll setup. Data comes from GET /api/org/:slug/getting-started,
// the same endpoint the launcher card uses.
// ============================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ArrowRight, ArrowLeft, Sparkles, Rocket } from 'lucide-react';
import { useOrg } from '../context/OrgContext';
import { usePlatform } from '../context/PlatformContext';
import { Panel, Button, PageSpinner, EmptyState } from '../components/ds';
import { useGettingStarted } from '../components/WorkspaceGetStarted';

const h1Style = { font: "700 26px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 };
const subStyle = { font: "400 14px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: '6px 0 0' };
const groupTitle = { font: "650 16px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 };
const groupSub = { font: "400 12.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: '3px 0 0' };
const taskLabel = { font: "500 14px/1.4 'Inter', system-ui, sans-serif", margin: 0 };
const taskDesc = { font: "400 12.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: '2px 0 0' };

export function buildOnboardingGroups({ data, apps, orgPath }) {
  const c = data?.counts || {};
  const cfg = data?.config || {};
  const has = (a) => apps.has(a);

  const groups = [
    {
      key: 'workspace',
      title: 'Set up your workspace',
      sub: 'The details that appear on everything you send',
      tasks: [
        {
          label: 'Complete your company profile',
          desc: cfg.companyProfileNeedsGstin
            ? 'Address and GSTIN — without a GSTIN your invoices cannot be issued as tax invoices'
            : 'Address, tax details and bank details appear on every invoice',
          done: !!cfg.companyProfileComplete,
          to: orgPath('/settings/companies'), cta: 'Complete',
        },
        {
          label: 'Invite your team',
          desc: 'Teammates get their own login, and you control app access per person',
          done: (c.members || 0) > 1,
          to: orgPath('/settings/users'), cta: 'Invite',
        },
        ...(data?.sampleDataPresent ? [{
          label: 'Remove the example data when you are done exploring',
          desc: 'Clears every sample job, candidate and invoice in one click',
          done: false,
          to: orgPath('/settings/general'), cta: 'Manage',
        }] : []),
      ],
    },
    ...(has('ats') ? [{
      key: 'hiring',
      title: 'Start hiring',
      sub: 'Jobs, your careers page, and your first candidates',
      tasks: [
        {
          label: 'Turn on your careers page',
          desc: 'Required before any job can be published publicly',
          done: !!cfg.careersEnabled,
          to: orgPath('/settings/ats'), cta: 'Enable',
        },
        {
          label: 'Post your first job',
          desc: 'Jobs drive candidates, pipelines and placements',
          done: (c.jobs || 0) > 0,
          to: orgPath('/ats/jobs/new'), cta: 'Post job',
        },
      ],
    }] : []),
    ...(has('contacts') || has('crm') ? [{
      key: 'clients',
      title: 'Bring in your clients',
      sub: 'Clients tie deals, jobs and invoices together',
      tasks: [
        {
          label: 'Add your first client',
          desc: 'Or import your existing client list from a CSV',
          done: (c.contacts || 0) > 0,
          to: orgPath('/contacts'), cta: 'Add client',
        },
      ],
    }] : []),
    ...(has('outreach') ? [{
      key: 'outreach',
      title: 'Win new business',
      sub: 'Reach prospects from your own email address',
      tasks: [
        {
          label: 'Connect Gmail',
          desc: 'Sequences stay paused until your sending account is connected',
          done: !!cfg.gmailConnected,
          to: orgPath('/outreach/engage'), cta: 'Connect',
        },
        {
          label: 'Import your first leads',
          desc: 'Use the Chrome extension on LinkedIn, or add leads manually',
          done: (c.leads || 0) > 0,
          to: orgPath('/outreach/leads'), cta: 'Import',
        },
      ],
    }] : []),
    ...(has('invoicing') ? [{
      key: 'billing',
      title: 'Bill your clients',
      sub: 'Journals, taxes and payment terms are already configured',
      tasks: [
        {
          label: 'Create your first invoice',
          desc: 'Raise it against a client and send it straight from Rivvra',
          done: (c.invoices || 0) > 0,
          to: orgPath('/invoicing/invoices/new'), cta: 'Create',
        },
      ],
    }] : []),
    ...(has('payroll') || has('timesheet') ? [{
      key: 'payroll',
      title: 'Pay your people',
      sub: 'Structures and projects must exist before the first run',
      tasks: [
        ...(has('payroll') ? [{
          label: 'Create a salary structure',
          desc: 'Payroll silently skips employees with no structure to calculate from',
          done: !!cfg.salaryStructureExists,
          to: orgPath('/payroll/salary-structures'), cta: 'Create',
        }] : []),
        ...(has('timesheet') ? [{
          label: 'Add a client and project',
          desc: 'Contractors can only log time against a project they are assigned to',
          done: !!cfg.timesheetProjectExists,
          to: orgPath('/timesheet/projects'), cta: 'Set up',
        }] : []),
      ],
    }] : []),
  ];

  return groups.filter((g) => g.tasks.length > 0);
}

export default function OnboardingHubPage() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  // The hub is a permanent destination: it renders even once dismissed, so
  // read the endpoint directly rather than through the card's show/hide.
  const { data, dismissed, restore } = useGettingStarted(currentOrg?.slug);

  const apps = useMemo(() => new Set(currentOrg?.enabledApps || []), [currentOrg?.enabledApps]);
  const groups = useMemo(
    () => (data ? buildOnboardingGroups({ data, apps, orgPath }) : []),
    [data, apps, orgPath],
  );

  if (!data) return <PageSpinner />;

  const allTasks = groups.flatMap((g) => g.tasks);
  const doneCount = allTasks.filter((t) => t.done).length;
  const pct = allTasks.length ? Math.round((doneCount / allTasks.length) * 100) : 0;
  const allDone = doneCount === allTasks.length && allTasks.length > 0;

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '32px 24px 64px' }}>
      {/* This page renders in the launcher-style shell (no sidebar), so it
          must carry its own way out — otherwise the only exit is the browser
          back button. */}
      <Link
        to={orgPath('/home')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18,
          font: "500 13px/1 'Inter', system-ui, sans-serif",
          color: 'var(--fg-3)', textDecoration: 'none',
        }}
      >
        <ArrowLeft size={15} /> Back to workspace
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 8 }}>
        <span style={{
          width: 42, height: 42, borderRadius: 'var(--r-2, 12px)', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--brand-soft)', color: 'var(--brand-ink)',
        }}>
          <Rocket size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={h1Style}>Get started with Rivvra</h1>
          <p style={subStyle}>
            {allDone
              ? `${currentOrg?.name || 'Your workspace'} is fully set up. Nice work.`
              : `A short setup for ${currentOrg?.name || 'your workspace'} — each step unlocks part of the platform. Come back any time.`}
          </p>
        </div>
      </div>

      {/* Overall progress */}
      <div style={{ margin: '20px 0 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ font: "500 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
            {doneCount} of {allTasks.length} steps complete
          </span>
          <span style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)' }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--brand)', transition: 'width var(--d-3, 240ms) ease' }} />
        </div>
      </div>

      {/* The teaser was hidden from the launcher — offer it back here, so
          "Hide" is never a one-way door. */}
      {dismissed && (
        <Panel style={{ marginBottom: 16 }}>
          <div style={{ padding: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ ...taskLabel, color: 'var(--fg)' }}>Hidden from your home page</p>
              <p style={taskDesc}>This hub stays available in the sidebar. Show the reminder on Home again?</p>
            </div>
            <Button variant="secondary" size="sm" onClick={restore} style={{ flexShrink: 0 }}>
              Show on Home
            </Button>
          </div>
        </Panel>
      )}

      {allDone && (
        <Panel style={{ marginBottom: 24 }}>
          <div style={{ padding: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Sparkles size={20} style={{ color: 'var(--brand-ink)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ ...taskLabel, color: 'var(--fg)' }}>You&apos;re all set up</p>
              <p style={taskDesc}>Everything below is done. This page stays here if you add apps later.</p>
            </div>
            <Button as={Link} to={orgPath('/home')} variant="secondary" size="sm" iconRight={<ArrowRight size={14} />}>
              Go to workspace
            </Button>
          </div>
        </Panel>
      )}

      {groups.length === 0 && (
        <EmptyState title="Nothing to set up" description="No apps are enabled for this workspace yet." />
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {groups.map((group) => {
          const gDone = group.tasks.filter((t) => t.done).length;
          return (
            <Panel key={group.key}>
              <div style={{ padding: 6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={groupTitle}>{group.title}</h2>
                    <p style={groupSub}>{group.sub}</p>
                  </div>
                  <span style={{
                    font: "500 12px/1 'Inter', system-ui, sans-serif", whiteSpace: 'nowrap',
                    color: gDone === group.tasks.length ? 'var(--brand-ink)' : 'var(--fg-3)',
                    padding: '6px 10px', borderRadius: 99,
                    background: gDone === group.tasks.length ? 'var(--brand-soft)' : 'var(--surface-2)',
                  }}>
                    {gDone} of {group.tasks.length} completed
                  </span>
                </div>

                <div style={{ display: 'grid', gap: 2 }}>
                  {group.tasks.map((task, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 4px',
                        borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
                      }}
                    >
                      {task.done
                        ? <CheckCircle2 size={20} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                        : <Circle size={20} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          ...taskLabel,
                          color: task.done ? 'var(--fg-3)' : 'var(--fg)',
                          textDecoration: task.done ? 'line-through' : 'none',
                        }}>
                          {task.label}
                        </p>
                        {!task.done && <p style={taskDesc}>{task.desc}</p>}
                      </div>
                      {!task.done && (
                        <Button as="a" href={task.to} variant="secondary" size="sm" iconRight={<ArrowRight size={14} />} style={{ flexShrink: 0 }}>
                          {task.cta}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
