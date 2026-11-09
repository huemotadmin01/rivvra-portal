import { Link } from 'react-router-dom';
import { Send, UserPlus, MessageSquare, AlertTriangle, ArrowRight, BarChart3, List as ListIcon, Mail } from 'lucide-react';
import { Panel, Chip, Button, Avatar, Meter, Callout } from '../../ds';

/* 2026-11-09 — rebuilt Outreach Home (per the mock-up approved 9 Nov).
   A rep's start-of-day view: today's numbers, what needs a reply or a fix,
   their sequences, their lists. Data: GET /api/dashboard/home (own
   enrollments only). The "Coming soon" recommendation cards, AI-usage
   counters and duplicate extension/checklist cards it replaces are gone. */

const t = {
  h2: { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px', font: "650 15px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' },
  k: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, font: "500 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' },
  v: { font: "700 26px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginTop: 4 },
  vSmall: { font: "500 14px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' },
  hint: { font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', marginTop: 6 },
  muted: { font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' },
  body: { font: "400 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' },
  link: { font: "600 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)', textDecoration: 'none', whiteSpace: 'nowrap' },
  th: { textAlign: 'left', padding: '0 8px 8px 0', font: "600 11px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-4)' },
  td: { padding: '10px 8px 10px 0', borderTop: '1px solid var(--line)', font: "400 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', verticalAlign: 'top' },
};

const INTENT = {
  interested: { label: 'Interested', tone: 'brand' },
  referral: { label: 'Referral', tone: 'brand' },
  later: { label: 'Follow up later', tone: 'warn' },
  not_interested: { label: 'Not interested', tone: 'danger' },
  wrong_person: { label: 'Wrong person', tone: 'neutral' },
  left_company: { label: 'Left company', tone: 'neutral' },
  ooo: { label: 'Auto-reply', tone: 'neutral' },
  unclear: { label: 'Unclear', tone: 'neutral' },
};

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—');
const fmt = (n) => Number(n || 0).toLocaleString();
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

function TodayCard({ label, to, toLabel, value, suffix, children, danger }) {
  return (
    <Panel>
      <div style={{ padding: 2 }}>
        <div style={t.k}>
          <span>{label}</span>
          {to && <Link to={to} style={t.link}>{toLabel} →</Link>}
        </div>
        <div style={{ ...t.v, ...(danger ? { color: 'var(--danger)' } : {}) }}>
          {fmt(value)}{suffix && <span style={t.vSmall}> {suffix}</span>}
        </div>
        {children}
      </div>
    </Panel>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.home    GET /api/dashboard/home payload (null while loading)
 * @param {Array} props.lists         GET /api/lists lists
 * @param {(p:string)=>string} props.orgPath
 */
export default function OutreachHome({ home, lists = [], orgPath, loading, listsLoading }) {
  // Placeholder blocks the same shape as the real sections, so nothing below
  // (Hiring Signals) jumps when the numbers land.
  if (loading && !home) {
    const block = (h) => <div style={{ height: h, borderRadius: 14, background: 'var(--surface-2, var(--surface-1))', border: '1px solid var(--line)' }} />;
    return (
      <div style={{ display: 'grid', gap: 16 }} aria-busy="true" aria-label="Loading your day">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {block(120)}{block(120)}{block(120)}{block(120)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>{block(220)}{block(220)}</div>
        {block(96)}
      </div>
    );
  }
  if (!home) {
    return <p style={{ ...t.muted, textAlign: 'center', padding: 24 }}>Couldn't load today's numbers — refresh the page to try again.</p>;
  }
  const { today, totals, replies = [], sequences = [] } = home;
  const remaining = Math.max(0, (today.limit || 0) - (today.sent || 0));
  const bounceRate = totals.contacted > 0 ? totals.bounced / totals.contacted : 0;
  // 2026-11-09: the five default lists (Hot Leads, Converted, …) are TEAM
  // lists — for an admin their counts span the whole team, and My Lists hides
  // them — so they link to Team Lists and sit apart from the rep's own lists.
  const byCount = (a, b) => (b.count || 0) - (a.count || 0);
  const listRows = [
    ...lists.filter((l) => !l.isDefault).sort(byCount).slice(0, 6).map((l) => ({ ...l, path: `/outreach/lists?list=${encodeURIComponent(l.name)}` })),
    ...lists.filter((l) => l.isDefault).sort(byCount).map((l) => ({ ...l, path: `/outreach/team-lists?list=${encodeURIComponent(l.name)}`, team: true })),
  ];
  const bouncedNow = totals.bouncedContacts ?? totals.bounced;
  // Workspace plan cap (null limit = no cap). The engine stops at whichever
  // of the rep's limit and the plan cap runs out first.
  const orgCap = today.org && today.org.limit != null ? today.org : null;
  const orgCapHit = !!orgCap && orgCap.sent >= orgCap.limit;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* 1. Today */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <TodayCard label="Emails sent today" to={orgPath('/outreach/engage')} toLabel="Engage" value={today.sent} suffix={`/ ${fmt(today.limit)} daily limit`}>
          <div style={{ marginTop: 8 }}><Meter value={today.limit ? Math.min(100, (today.sent / today.limit) * 100) : 0} /></div>
          <div style={t.hint}>
            {orgCapHit ? 'Workspace daily cap reached' : `${fmt(remaining)} left`} · limit resets 5:30 am IST{home.gmailConnected ? '' : ' · Gmail not connected'}
          </div>
          {orgCap && (
            <div style={{ ...t.hint, color: orgCapHit ? 'var(--danger)' : t.hint.color }}>
              Workspace plan: {fmt(orgCap.sent)} / {fmt(orgCap.limit)} sent today
            </div>
          )}
        </TodayCard>
        <TodayCard label="Enrolled today" to={orgPath('/outreach/leads?status=in_sequence')} toLabel="View" value={today.enrolled}>
          <div style={t.hint}>{fmt(totals.active)} contacts in a sequence right now</div>
        </TodayCard>
        <TodayCard label="Replies today" to={orgPath('/outreach/my-dashboard')} toLabel="Details" value={today.replies}>
          <div style={t.hint}>
            {totals.lastReplyAt ? `Last reply: ${when(totals.lastReplyAt)}` : 'No replies yet'} · {fmt(totals.repliesWeek)} this week
          </div>
        </TodayCard>
        <TodayCard label="Bounced today" to={orgPath('/outreach/leads?status=bounced')} toLabel="Fix" value={today.bounced} danger={today.bounced > 0}>
          <div style={t.hint}>{fmt(totals.bounced)} bounced in total ({pct(totals.bounced, totals.contacted)} of contacted)</div>
        </TodayCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 12, alignItems: 'start' }}>
        {/* 2. Needs your attention */}
        <Panel>
          <div style={{ padding: 2 }}>
            <h2 style={t.h2}><MessageSquare size={16} style={{ color: 'var(--brand-ink)' }} /> Needs your attention</h2>
            {replies.length === 0 && bouncedNow === 0 && (
              <p style={t.muted}>Nothing waiting — no new replies in the last 14 days and no bounced contacts.</p>
            )}
            {replies.map((r, i) => {
              const tag = INTENT[r.intent] || (r.status === 'replied_not_interested' ? INTENT.not_interested : { label: 'Replied', tone: 'neutral' });
              return (
                <div key={r.enrollmentId} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
                  <Avatar name={r.name} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, ...t.body }}>
                      <b style={{ color: 'var(--fg)' }}>{r.name}</b>
                      {r.company && <span style={t.muted}>· {r.company}</span>}
                      <Chip tone={tag.tone}>{tag.label}</Chip>
                      <span style={t.muted}>· {when(r.at)}</span>
                    </div>
                    {r.snippet && <div style={{ ...t.body, marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>&ldquo;{r.snippet}&rdquo;</div>}
                  </div>
                  {r.leadId && (
                    <Button as={Link} to={orgPath(`/outreach/leads/${r.leadId}`)} size="sm" variant={tag.tone === 'brand' ? 'primary' : 'secondary'} style={{ flexShrink: 0 }}>
                      Open
                    </Button>
                  )}
                </div>
              );
            })}
            {bouncedNow > 0 && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: replies.length ? '1px solid var(--line)' : 0 }}>
                <span style={{ width: 32, height: 32, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'var(--warn-soft)', color: 'var(--warn-ink)', flexShrink: 0 }}>
                  <AlertTriangle size={15} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, ...t.body }}>
                    <b style={{ color: 'var(--fg)' }}>{fmt(bouncedNow)} contact{bouncedNow === 1 ? '' : 's'} bounced</b>
                    {today.bounced > 0 && <Chip tone="warn">{fmt(today.bounced)} today</Chip>}
                  </div>
                  <div style={{ ...t.body, marginTop: 2 }}>Correct their email and they can be added back to a sequence.</div>
                </div>
                <Button as={Link} to={orgPath('/outreach/leads?status=bounced')} size="sm" variant="secondary" style={{ flexShrink: 0 }}>
                  Review bounced
                </Button>
              </div>
            )}
          </div>
        </Panel>

        {/* 3. Your sequences */}
        <Panel>
          <div style={{ padding: 2 }}>
            <h2 style={t.h2}><Send size={16} style={{ color: 'var(--brand-ink)' }} /> Your sequences</h2>
            {sequences.length === 0 ? (
              <p style={t.muted}>You haven&rsquo;t added contacts to a sequence yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={t.th}>Sequence</th>
                    <th style={{ ...t.th, textAlign: 'right' }}>Active</th>
                    <th style={{ ...t.th, textAlign: 'right' }}>Replies</th>
                    <th style={{ ...t.th, textAlign: 'right' }}>Bounced</th>
                  </tr></thead>
                  <tbody>
                    {sequences.map((q) => {
                      const hot = q.enrolled > 20 && q.bounced / q.enrolled > 0.1;
                      return (
                        <tr key={q._id}>
                          <td style={t.td}>
                            <Link to={orgPath(`/outreach/engage?sequence=${q._id}`)} style={{ color: 'var(--fg)', fontWeight: 600, textDecoration: 'none' }}>{q.name}</Link>
                            <div style={t.muted}>
                              {q.ownerName ? `Shared by ${q.ownerName} · ` : ''}{fmt(q.enrolled)} enrolled{q.status && q.status !== 'active' ? ` · ${q.status}` : ''}
                            </div>
                          </td>
                          <td style={{ ...t.td, textAlign: 'right' }}>{fmt(q.active)}</td>
                          <td style={{ ...t.td, textAlign: 'right' }}>{fmt(q.replied)} <span style={t.muted}>{pct(q.replied, q.enrolled)}</span></td>
                          <td style={{ ...t.td, textAlign: 'right', ...(hot ? { color: 'var(--danger)', fontWeight: 600 } : {}) }}>
                            {fmt(q.bounced)} <span style={{ fontWeight: 400 }}>{pct(q.bounced, q.enrolled)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {totals.contacted >= 50 && bounceRate > 0.1 && (
              <Callout tone="danger" style={{ marginTop: 12 }}>
                High bounce rate — {pct(totals.bounced, totals.contacted)} of the emails you found are invalid. Verify emails before enrolling to protect your Gmail sending reputation.
              </Callout>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <Button as={Link} to={orgPath('/outreach/leads')} size="sm" iconLeft={<UserPlus size={14} />}>Add contacts to a sequence</Button>
              <Button as={Link} to={orgPath('/outreach/my-dashboard')} size="sm" variant="secondary" iconLeft={<BarChart3 size={14} />}>My Dashboard</Button>
            </div>
          </div>
        </Panel>
      </div>

      {/* 5. My lists */}
      <Panel>
        <div style={{ padding: 2 }}>
          <h2 style={t.h2}>
            <ListIcon size={16} style={{ color: 'var(--brand-ink)' }} /> Lists
            <Link to={orgPath('/outreach/team-lists')} style={{ ...t.link, marginLeft: 'auto', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}>All lists <ArrowRight size={12} /></Link>
          </h2>
          {listsLoading && listRows.length === 0 ? (
            <p style={t.muted}>Loading lists…</p>
          ) : listRows.length === 0 ? (
            <p style={t.muted}>No lists yet.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {listRows.map((l) => (
                <Link
                  key={l._id || l.name}
                  to={orgPath(l.path)}
                  title={l.team ? 'Team list — fills automatically from outreach status' : 'Your list'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface-1)', color: 'var(--fg)', textDecoration: 'none', font: "500 13px/1.3 'Inter', system-ui, sans-serif" }}
                >
                  <Mail size={13} style={{ color: 'var(--fg-4)' }} /> {l.name}
                  <b>{fmt(l.count)}</b>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
