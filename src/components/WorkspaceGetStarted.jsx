import { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { Panel, Button } from './ds';
import api from '../utils/api';

/* Platform-wide first-run checklist for NEW workspaces (owner/admin, org <30
   days old, until skipped — the server decides via /getting-started). Two
   jobs: guide the first session, and make a fresh workspace unmistakably
   fresh — a new org with a familiar company name is otherwise
   indistinguishable from an old one. Mounted on the home launcher and the
   outreach dashboard (where it supersedes the outreach-only checklist). */

const h3Style = { font: "600 16px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' };
const bodyStyle = { font: "400 14px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg)' };
const metaStyle = { font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' };

export function useGettingStarted(orgSlug) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!orgSlug) return;
    api.request(`/api/org/${orgSlug}/getting-started`)
      .then((res) => { if (res?.show) setData(res); })
      .catch(() => {});
  }, [orgSlug]);
  const dismiss = () => {
    setData(null);
    api.request(`/api/org/${orgSlug}/getting-started/dismiss`, { method: 'POST' }).catch(() => {});
  };
  return { data, dismiss };
}

export default function WorkspaceGetStarted({ data, orgPath, enabledApps, orgName, onDismiss, style }) {
  if (!data) return null;
  const apps = new Set(enabledApps || []);
  const steps = [
    {
      label: 'Invite your team',
      desc: 'Teammates get their own login and app access',
      done: data.counts.members > 1,
      to: orgPath('/settings/users'),
      cta: 'Invite',
    },
    ...(apps.has('ats') ? [{
      label: 'Post your first job',
      desc: 'Jobs drive candidates, pipelines and placements',
      done: data.counts.jobs > 0,
      to: orgPath('/ats/jobs/new'),
      cta: 'Post job',
    }] : []),
    ...(apps.has('contacts') || apps.has('crm') ? [{
      label: 'Add your first client',
      desc: 'Clients connect deals, jobs and invoices',
      done: data.counts.contacts > 0,
      to: orgPath('/contacts'),
      cta: 'Add client',
    }] : []),
    ...(apps.has('outreach') ? [{
      label: 'Import outreach leads',
      desc: 'Use the Chrome extension on LinkedIn, or add leads manually',
      done: data.counts.leads > 0,
      to: orgPath('/outreach/leads'),
      cta: 'Import',
    }] : []),
    ...(apps.has('invoicing') ? [{
      label: 'Create your first invoice',
      desc: 'Journals, taxes and payment terms are already set up',
      done: data.counts.invoices > 0,
      to: orgPath('/invoicing/invoices/new'),
      cta: 'Create',
    }] : []),
    ...(data.sampleDataPresent ? [{
      label: 'Remove the example data when done exploring',
      desc: 'One click in Settings clears every sample record',
      done: false,
      to: orgPath('/settings/general'),
      cta: 'Manage',
    }] : []),
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Panel style={{ marginBottom: 32, ...style }}>
      <div style={{ padding: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 'var(--r-2, 12px)', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--brand-soft)', color: 'var(--brand-ink)',
          }}>
            <Sparkles size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={h3Style}>Welcome to your new workspace</h3>
            <p style={{ ...metaStyle, marginTop: 2 }}>
              {orgName} is set up and ready — {doneCount} of {steps.length} steps done. You can skip this and explore.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onDismiss} style={{ flexShrink: 0 }}>
            Skip for now
          </Button>
        </div>
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 'var(--r-2, 12px)',
                background: step.done ? 'var(--brand-soft)' : 'var(--surface-2)',
                boxShadow: `inset 0 0 0 1px ${step.done ? 'var(--brand-line)' : 'var(--line-2)'}`,
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 99, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: step.done ? 'var(--brand)' : 'var(--surface-3)',
                color: step.done ? 'var(--brand-on)' : 'var(--fg)',
                boxShadow: step.done ? 'none' : 'inset 0 0 0 1px var(--line-strong)',
                font: "700 11px/1 'Inter', system-ui, sans-serif",
              }}>
                {step.done ? <CheckCircle2 size={16} /> : i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...bodyStyle, fontWeight: 550, color: step.done ? 'var(--brand-ink)' : 'var(--fg)' }}>{step.label}</p>
                {!step.done && <p style={{ ...metaStyle, marginTop: 2 }}>{step.desc}</p>}
              </div>
              {!step.done && (
                <Button as="a" href={step.to} variant="secondary" size="sm" iconRight={<ArrowRight size={14} />} style={{ flexShrink: 0 }}>
                  {step.cta}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
