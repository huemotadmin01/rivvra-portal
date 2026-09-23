// Rate Confirmation status chip (2026-09-23).
//
// Reads the status the API denormalises onto the application
// (rateConfirmation.state / signedAt, written back on every Sign envelope
// transition) — no envelope lookup from the browser. One component so the
// job page, the Applications list and the pipeline card all say the same
// thing for the same record.
//
// Status precedence mirrors the API's CSV label and the stage gate:
//   signed  > bypassed (admin escape hatch, no signed envelope)
//           > sent (awaiting) > refused > cancelled / expired > not sent

import { FileSignature, Check, Clock, X, ShieldAlert, Minus } from 'lucide-react';

export function rateConfirmationStatus(app) {
  const st = app?.rateConfirmation?.state;
  if (st === 'signed') return 'signed';
  if (app?.rateConfirmationGate?.bypassedAt) return 'bypassed';
  if (st === 'sent') return 'awaiting';
  if (st === 'refused') return 'refused';
  if (st === 'cancelled' || st === 'expired') return 'cancelled';
  // Legacy pointer without a state (pre-backfill or write-back missed):
  // we know it was sent, not whether it was signed.
  if (app?.rateConfirmation?.envelopeId) return 'awaiting';
  return 'none';
}

const STYLES = {
  signed:    { label: 'Signed',    Icon: Check,       fg: 'var(--brand-ink)', bg: 'var(--brand-soft)' },
  bypassed:  { label: 'Bypassed',  Icon: ShieldAlert, fg: 'var(--warn-ink)',  bg: 'var(--warn-soft)' },
  awaiting:  { label: 'Awaiting',  Icon: Clock,       fg: 'var(--warn-ink)',  bg: 'var(--warn-soft)' },
  refused:   { label: 'Declined',  Icon: X,           fg: 'var(--danger)',    bg: 'var(--danger-soft)' },
  cancelled: { label: 'Cancelled', Icon: X,           fg: 'var(--fg-4)',      bg: 'var(--surface-2, transparent)' },
  none:      { label: 'Not sent',  Icon: Minus,       fg: 'var(--fg-4)',      bg: 'transparent' },
};

function titleFor(status, app) {
  const rc = app?.rateConfirmation || {};
  const d = (v) => (v ? new Date(v).toLocaleDateString() : '');
  switch (status) {
    case 'signed': return `Rate & terms confirmation signed by both parties${rc.signedAt ? ` on ${d(rc.signedAt)}` : ''}${rc.reusedFromJobName ? ` (reused from ${rc.reusedFromJobName})` : ''}`;
    case 'bypassed': return `Rate confirmation gate bypassed by ${app.rateConfirmationGate?.bypassedByName || 'an admin'}${app.rateConfirmationGate?.reason ? `: ${app.rateConfirmationGate.reason}` : ''}`;
    case 'awaiting': return `Rate confirmation sent${rc.sentAt ? ` on ${d(rc.sentAt)}` : ''}${rc.sentByName ? ` by ${rc.sentByName}` : ''} — awaiting signatures`;
    case 'refused': return 'Rate confirmation was declined — send a new one';
    case 'cancelled': return `Rate confirmation ${rc.state === 'expired' ? 'expired' : 'was cancelled'} — send a new one`;
    default: return 'No rate confirmation sent yet';
  }
}

/**
 * compact: icon-only (pipeline cards); otherwise icon + label.
 * hideNone: render nothing for "not sent" (pipeline cards, where an empty
 * marker on every card is noise).
 */
export default function RateConfirmationChip({ app, compact = false, hideNone = false }) {
  const status = rateConfirmationStatus(app);
  if (hideNone && status === 'none') return null;
  const s = STYLES[status];
  const Icon = status === 'signed' && compact ? FileSignature : s.Icon;
  return (
    <span
      title={titleFor(status, app)}
      aria-label={`Rate confirmation: ${s.label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: compact ? 2 : '2px 7px', borderRadius: 6,
        font: '500 11px/1.2 var(--font)', color: s.fg, background: s.bg,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      <Icon size={compact ? 11 : 12} strokeWidth={2.25} />
      {!compact && <span>{s.label}</span>}
    </span>
  );
}
