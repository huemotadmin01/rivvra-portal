// AI reply-intent badge (2026-08-21) — shows WHY a lead landed in its list:
// referral, future window, etc. Renders next to the outreach-status badge on
// the legacy list pages; data comes from lead.lastReplyIntent (stamped by the
// sequence cron when gpt-4o-mini classifies a reply). Hover shows the hint
// (timing phrase or referred person).
const INTENT_CFG = {
  referral: { label: 'Referral', cls: 'bg-sky-500/10 text-sky-400' },
  later: { label: 'Later', cls: 'bg-amber-500/10 text-amber-400' },
  interested: { label: 'AI: Interested', cls: 'bg-emerald-500/10 text-emerald-400' },
  wrong_person: { label: 'Wrong person', cls: 'bg-slate-500/10 text-slate-400' },
  left_company: { label: 'Left company', cls: 'bg-slate-500/10 text-slate-400' },
};

export default function ReplyIntentBadge({ lead }) {
  const cfg = INTENT_CFG[lead?.lastReplyIntent];
  if (!cfg) return null;
  return (
    <span
      title={lead.lastReplyIntentHint || ''}
      className={`ml-1.5 px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}{lead.lastReplyIntentHint ? ' ·' : ''}
    </span>
  );
}
