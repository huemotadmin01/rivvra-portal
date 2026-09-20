// Reminders configuration — the dunning cadence and the wording we email a
// customer whose invoice is late.
//
// 2026-09-21: this editor already existed, but only as a collapsed accordion
// underneath the overdue table on the Follow-ups page. Nothing in the
// Configuration group pointed at it, so the screen that decides what we say to
// a late-paying customer was reachable only by scrolling past something else
// and clicking a row that did not look like a settings link.
//
// The editor itself is unchanged and still lives with the feature it belongs
// to; this page renders it open, under the nav entry people look for.
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { FollowUpConfig } from './FollowUpsV2';

export default function RemindersConfigV2() {
  const { orgSlug } = useOrg();
  const { showToast } = useToast();

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ font: '650 18px/1.2 var(--font)', color: 'var(--fg)', letterSpacing: '-0.012em' }}>
          Reminders
        </h1>
        <p style={{ font: '450 12.5px/1.4 var(--font)', color: 'var(--fg-4)', marginTop: 3 }}>
          How long we wait before chasing an overdue invoice, and what each reminder says
        </p>
      </div>
      <FollowUpConfig orgSlug={orgSlug} showToast={showToast} alwaysOpen />
    </div>
  );
}
