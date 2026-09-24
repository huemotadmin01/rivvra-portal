// Outreach history on an opportunity (2026-09-25).
//
// Reps log nothing — of 1,382 activity rows on opportunities, 1,381 were
// system-generated and the single human note was empty. So this timeline is
// assembled by the API from the sequence enrollment that produced the lead
// (`opportunity.outreach`), not from anything anyone has to type.
//
// Read-only on purpose: it is a record of what happened, not a place to work.

import { Mail, MailOpen, MousePointerClick, CornerDownLeft, AlertTriangle } from 'lucide-react';

// The classifier's 8 intents. Colour carries the same meaning as everywhere
// else in the platform: green = go, amber = wait, red = stop, grey = noise.
const INTENT = {
  interested:    { label: 'Interested',    fg: 'var(--brand-ink)', bg: 'var(--brand-soft)' },
  later:         { label: 'Later',         fg: 'var(--warn-ink)',  bg: 'var(--warn-soft)' },
  referral:      { label: 'Referral',      fg: 'var(--brand-ink)', bg: 'var(--brand-soft)' },
  not_interested:{ label: 'Not interested',fg: 'var(--danger)',    bg: 'var(--danger-soft)' },
  wrong_person:  { label: 'Wrong person',  fg: 'var(--fg-3)',      bg: 'transparent' },
  ooo:           { label: 'Out of office', fg: 'var(--fg-3)',      bg: 'transparent' },
  unclear:       { label: 'Unclear',       fg: 'var(--fg-3)',      bg: 'transparent' },
};

const KIND = {
  sent:    { Icon: Mail,            fg: 'var(--fg-3)' },
  replied: { Icon: CornerDownLeft,  fg: 'var(--brand-ink)' },
  bounced: { Icon: AlertTriangle,   fg: 'var(--danger)' },
};

const fmt = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function Pill({ children, fg, bg, title }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px',
      borderRadius: 5, font: '500 10.5px/1.35 var(--font)', color: fg, background: bg,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{children}</span>
  );
}

export default function OutreachTimeline({ outreach }) {
  if (!outreach || !outreach.events?.length) return null;
  const { summary, events, truncated, enrollments } = outreach;

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <Pill fg="var(--fg-3)" bg="var(--surface-2, transparent)"><Mail size={10} /> {summary.sent} sent</Pill>
        {summary.opened > 0 && <Pill fg="var(--fg-3)" bg="var(--surface-2, transparent)"><MailOpen size={10} /> {summary.opened} opened</Pill>}
        {summary.clicked > 0 && <Pill fg="var(--fg-3)" bg="var(--surface-2, transparent)"><MousePointerClick size={10} /> {summary.clicked} clicked</Pill>}
        {summary.replied > 0 && <Pill fg="var(--brand-ink)" bg="var(--brand-soft)"><CornerDownLeft size={10} /> {summary.replied} replied</Pill>}
        {summary.bounced > 0 && <Pill fg="var(--danger)" bg="var(--danger-soft)"><AlertTriangle size={10} /> {summary.bounced} bounced</Pill>}
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((e, i) => {
          const k = KIND[e.kind] || KIND.sent;
          const { Icon } = k;
          const intent = e.intent ? INTENT[e.intent] : null;
          return (
            <li key={`${e.at}-${i}`} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <Icon size={13} style={{ color: k.fg, flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ font: '500 12px/1.4 var(--font)', color: 'var(--fg-2)' }}>
                    {e.kind === 'replied' ? 'Replied' : e.kind === 'bounced' ? 'Bounced' : `Email ${e.step ? `#${e.step} ` : ''}sent`}
                  </span>
                  <span style={{ font: '450 11px/1.4 var(--font)', color: 'var(--fg-4)' }}>{fmt(e.at)}</span>
                  {intent && (
                    <Pill fg={intent.fg} bg={intent.bg}
                      title={e.intentConfidence != null ? `AI-classified intent, ${Math.round(e.intentConfidence * 100)}% confidence` : 'AI-classified intent'}>
                      {intent.label}
                    </Pill>
                  )}
                  {e.openedAt && <Pill fg="var(--fg-4)" bg="transparent" title={`Opened ${fmt(e.openedAt)}`}><MailOpen size={10} /> opened</Pill>}
                  {e.clickedAt && <Pill fg="var(--fg-4)" bg="transparent" title={`Clicked ${fmt(e.clickedAt)}`}><MousePointerClick size={10} /> clicked</Pill>}
                </div>
                {e.subject && (
                  <p style={{
                    font: '450 11.5px/1.45 var(--font)', color: 'var(--fg-3)', margin: '2px 0 0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={e.subject}>{e.subject}</p>
                )}
                {e.snippet && (
                  <p style={{
                    font: '450 11.5px/1.5 var(--font)', color: 'var(--fg-2)', margin: '4px 0 0',
                    whiteSpace: 'pre-wrap', padding: '6px 8px', borderRadius: 6,
                    background: 'var(--surface-2, rgba(255,255,255,.03))',
                    borderLeft: '2px solid var(--brand-ink)',
                  }}>{e.snippet}</p>
                )}
                {e.byName && (
                  <p style={{ font: '450 10.5px/1.4 var(--font)', color: 'var(--fg-4)', margin: '3px 0 0' }}>
                    {e.kind === 'replied' ? `to ${e.byName}` : `by ${e.byName}`}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {truncated && (
        <p style={{ font: '450 11px/1.4 var(--font)', color: 'var(--fg-4)', marginTop: 10 }}>
          Showing the most recent {events.length} events.
        </p>
      )}
      {enrollments > 1 && (
        <p style={{ font: '450 11px/1.4 var(--font)', color: 'var(--fg-4)', marginTop: 6 }}>
          Merged from {enrollments} outreach sequences to this contact.
        </p>
      )}
    </div>
  );
}
