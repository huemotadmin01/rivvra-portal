// ============================================================================
// CrmFollowUpsV2.jsx — the rep's working screen (2026-11-23)
// ============================================================================
//
// Owner: "after converting a lead to opportunity, my team is not properly
// using CRM to track the deal till won". Measured 25 Sep–23 Nov: 67 real
// leads, 0 notes, 0 logged activities, 0 stage moves, and 11 of 13 wins were
// created on the day they were won — the CRM recorded outcomes, not the
// journey.
//
// One list, grouped by urgency, instead of a board with one working column:
//   • New replies   — Outreach contacts marked Interested, not in the CRM yet
//   • Overdue / Today / This week / Later / No date — open opportunities
// 2026-11-24: interested replies are tracked automatically (rows carry an
// "Auto" chip); the few that are held say why. "Contact me later" replies
// show up as their own group when their date comes. "New requirement" raises
// an ATS job for an existing client in one step.
// One click says what happened (Called / Emailed / Met / No answer); the only
// thing a rep types is the next step, and a date is always set with it.
//
// Data: GET /crm/follow-ups · POST /crm/opportunities/:id/follow-up.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Phone, Mail, Users, PhoneOff, ArrowRight, RefreshCw, AlertCircle, Inbox, Sparkles, CheckCircle2, Clock, Plus } from 'lucide-react';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import ExportToCRMModal from '../../components/ExportToCRMModal';
import NewRequirementModal from '../../components/crm/NewRequirementModal';
import { Panel, Button, Chip, Callout, Input, Select, Spinner, EmptyState } from '../../components/ds';
import { PageHeaderV2 } from '../../components/platform/v2/listkit';
import { dueLabel, dueState } from '../../components/crm/nextStep';

const micro = { font: "450 12px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
const OUTCOMES = [
  { value: 'called', label: 'Called', Icon: Phone },
  { value: 'emailed', label: 'Emailed', Icon: Mail },
  { value: 'met', label: 'Met', Icon: Users },
  { value: 'no_answer', label: 'No answer', Icon: PhoneOff },
];
const GROUPS = [
  { key: 'overdue', label: 'Overdue', tone: 'danger' },
  { key: 'today', label: 'Today', tone: 'warn' },
  { key: 'week', label: 'This week', tone: 'neutral' },
  { key: 'later', label: 'Later', tone: 'neutral' },
  { key: 'noDate', label: 'No next step set', tone: 'neutral' },
];
const URGENT = ['overdue', 'today', 'week'];
// 2026-11-24: long groups (the team view had 50+ rows) show a few at a time.
const FIRST_ROWS = 5;
const MORE_ROWS = 10;
const timeOf = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const DUE_TONE = { overdue: 'var(--danger)', today: 'var(--warn-ink, #b45309)', upcoming: 'var(--fg-3)', none: 'var(--fg-4)' };

// A due date is a calendar day. Send YYYY-MM-DD of the viewer's local day; the
// API stores it at UTC midnight, same as the opportunity page.
function ymdInDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  // Skip the weekend: a follow-up "tomorrow" on a Friday means Monday.
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const SNOOZE_CHOICES = [
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: '1 month' },
  { value: '60', label: '2 months' },
  { value: '90', label: '3 months' },
];
const dayMonth = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const DUE_CHOICES = [
  { value: '1', label: 'Tomorrow' },
  { value: '3', label: 'In 3 days' },
  { value: '7', label: 'Next week' },
  { value: '14', label: 'In 2 weeks' },
];

function Counter({ label, value, tone }) {
  const danger = tone === 'danger' && value > 0;
  return (
    <div style={{
      background: danger ? 'var(--danger-soft)' : 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-3, 12px)', padding: '12px 14px', minWidth: 0,
    }}>
      <div style={{ ...micro, color: danger ? 'var(--danger)' : 'var(--fg-3)' }}>{label}</div>
      <div style={{ font: "650 24px/1.2 'Inter', system-ui, sans-serif", color: danger ? 'var(--danger)' : 'var(--fg)' }}>{value}</div>
    </div>
  );
}

function CrmFollowUpsV2() {
  const { currentOrg } = useOrg();
  // orgPath lives on the platform context, not the org context.
  const { orgPath } = usePlatform();
  const slug = currentOrg?.slug;
  const navigate = useNavigate();
  const { showToast } = useToast();
  usePageTitle('Follow-ups');

  const [searchParams] = useSearchParams();
  // The dashboard's tiles open this page on the same scope they showed.
  const [scope, setScope] = useState(() => (searchParams.get('scope') === 'team' ? 'team' : 'mine'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // 2026-11-24: "Refresh is not working" — it was, but nothing on screen moved
  // while it loaded or after. Now the button spins and the time is shown.
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  // How many rows each group shows: { [groupKey]: n }. Reset on scope change.
  const [shown, setShown] = useState({});
  const [error, setError] = useState('');
  // The row being logged: { id, outcome }. One at a time.
  const [logging, setLogging] = useState(null);
  const [nextStep, setNextStep] = useState('');
  const [dueIn, setDueIn] = useState('3');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [exportLead, setExportLead] = useState(null);
  const [showRequirement, setShowRequirement] = useState(false);
  const [snoozing, setSnoozing] = useState(null); // lead id being pushed back
  const seq = useRef(0);

  const load = useCallback(async ({ quiet = false, manual = false } = {}) => {
    if (!slug) return;
    const mine = ++seq.current;
    if (!quiet) setLoading(true);
    setRefreshing(true);
    try {
      const res = await crmApi.getFollowUps(slug, { scope, tzOffset: new Date().getTimezoneOffset() });
      if (mine !== seq.current) return;
      setData(res); setError(''); setUpdatedAt(new Date());
      if (manual) showToast('Follow-ups are up to date');
    } catch (err) {
      if (mine !== seq.current) return;
      setError(err?.message || 'Could not load follow-ups');
    } finally {
      if (mine === seq.current) { setLoading(false); setRefreshing(false); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, scope]);

  const limitOf = (key) => shown[key] || FIRST_ROWS;
  const moreRows = (groupKey, total) => {
    const n = limitOf(groupKey);
    if (total <= n) return null;
    const left = total - n;
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 16px' }}>
        <Button size="sm" variant="secondary" onClick={() => setShown((s) => ({ ...s, [groupKey]: n + MORE_ROWS }))}>
          Show {Math.min(MORE_ROWS, left)} more
        </Button>
        {left > MORE_ROWS && (
          <Button size="sm" variant="ghost" onClick={() => setShown((s) => ({ ...s, [groupKey]: total }))}>Show all {total}</Button>
        )}
        <span style={micro}>{n} of {total} shown</span>
      </div>
    );
  };

  useEffect(() => { load(); }, [load]);

  const startLog = (opp, outcome) => {
    setLogging({ id: opp._id, outcome });
    setNextStep(''); setNote(''); setFormError('');
    setDueIn(outcome === 'no_answer' ? '1' : '3');
  };

  const saveLog = async (opp) => {
    if (!nextStep.trim()) { setFormError('Enter the next step first'); return; }
    setSaving(true); setFormError('');
    try {
      await crmApi.logFollowUp(slug, opp._id, {
        outcome: logging.outcome, note: note.trim(), nextStep: nextStep.trim(), nextStepDueAt: ymdInDays(Number(dueIn)),
      });
      showToast(`Saved · next: ${nextStep.trim()}`);
      setLogging(null);
      load({ quiet: true });
    } catch (err) {
      setFormError(err?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const snooze = async (lead, days) => {
    if (!days) return;
    setSnoozing(lead._id);
    try {
      const res = await crmApi.snoozeLeadFollowUp(slug, lead._id, Number(days));
      showToast(`${lead.name || 'Contact'} · follow up ${res?.dueAt ? `on ${dayMonth(res.dueAt)}` : 'later'}`);
      load({ quiet: true });
    } catch (err) {
      showToast(err?.message || 'Could not change the date', 'error');
    } finally {
      setSnoozing(null);
    }
  };

  const openOpp = (opp) => navigate(orgPath(`/crm/opportunities/${opp._id}`));
  const counts = data?.counts || {};
  const nothing = data && counts.open === 0 && counts.newReplies === 0 && !counts.followUpLater;
  const laterRows = data?.later || [];
  const laterWaiting = Math.max(0, (counts.followUpLater || 0) - laterRows.length);

  const renderGroup = (g) => {
            const rows = data?.groups?.[g.key] || [];
            if (!rows.length) return null;
            return (
              <Panel key={g.key} title={g.label} icon={<Inbox size={16} />} actions={<Chip tone={g.tone === 'neutral' ? undefined : g.tone}>{rows.length}</Chip>} flush>
                {rows.slice(0, limitOf(g.key)).map((opp) => {
                  const state = dueState(opp.nextStepDueAt);
                  const open = logging?.id === opp._id;
                  return (
                    <div key={opp._id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => openOpp(opp)}
                          title="Open the opportunity"
                          style={{ flex: '1 1 220px', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          <div style={{ font: "550 14px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opp.companyName || opp.name}
                          </div>
                          <div style={{ ...micro, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opp.contactName || 'No contact'}{opp.contactTitle ? ` · ${opp.contactTitle}` : ''}
                            {scope === 'team' && opp.salespersonName ? ` · ${opp.salespersonName}` : ''}
                          </div>
                        </button>
                        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                          <div style={{ font: "450 13.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opp.nextStep || 'No next step'}
                          </div>
                          <div style={{ ...micro, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ color: DUE_TONE[state] }}>{opp.nextStep ? dueLabel(opp.nextStepDueAt) : 'Set one below'}</span>
                            <Chip>{opp.stageName}</Chip>
                            {opp.autoCreated && <Chip tone="brand" title="Created automatically when the contact replied interested">Auto</Chip>}
                            {opp.existingClient && <Chip tone="info" title="This company is already a client">Existing client</Chip>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {OUTCOMES.map((o) => {
                            const OutcomeIcon = o.Icon;
                            return (
                              <Button
                                key={o.value}
                                size="sm"
                                variant={open && logging.outcome === o.value ? 'primary' : 'secondary'}
                                iconLeft={<OutcomeIcon size={13} />}
                                onClick={() => startLog(opp, o.value)}
                              >
                                {o.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                      {open && (
                        <div style={{ display: 'grid', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-2, 10px)', padding: 12 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <Input
                              value={nextStep}
                              onChange={(e) => { setNextStep(e.target.value); if (formError) setFormError(''); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveLog(opp); }}
                              placeholder="What is the next step? e.g. Send two Java profiles"
                              aria-label="Next step"
                              maxLength={200}
                              autoFocus
                              style={{ flex: '1 1 260px', minWidth: 0 }}
                            />
                            <Select value={dueIn} onChange={(e) => setDueIn(e.target.value)} aria-label="Next step due" style={{ width: 140 }}>
                              {DUE_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </Select>
                            <Button size="sm" onClick={() => saveLog(opp)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                            <Button size="sm" variant="ghost" onClick={() => setLogging(null)} disabled={saving}>Cancel</Button>
                          </div>
                          <Input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Anything worth remembering? (optional)"
                            aria-label="Note"
                            maxLength={2000}
                          />
                          {formError && <div style={{ ...micro, color: 'var(--danger)' }}>{formError}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
                {moreRows(g.key, rows.length)}
              </Panel>
            );
          };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <PageHeaderV2
        title="Follow-ups"
        sub={`${scope === 'mine' ? 'What you owe your prospects today' : 'What your team owes its prospects today'}${updatedAt ? ` · updated ${timeOf(updatedAt)}` : ''}`}
        actions={(
          <>
            <Select value={scope} onChange={(e) => { setScope(e.target.value); setLogging(null); setShown({}); }} aria-label="Whose follow-ups" style={{ width: 130 }}>
              <option value="mine">Mine</option>
              <option value="team">My team</option>
            </Select>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={refreshing ? <Spinner size={13} /> : <RefreshCw size={14} />}
              onClick={() => load({ quiet: true, manual: true })}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setShowRequirement(true)}>New requirement</Button>
          </>
        )}
      />

      {error && <Callout tone="danger" icon={<AlertCircle size={16} />}>{error}</Callout>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <Counter label="New replies to pick up" value={counts.newReplies ?? '–'} />
        <Counter label="Overdue" value={counts.overdue ?? '–'} tone="danger" />
        <Counter label="Due today" value={counts.today ?? '–'} />
        <Counter label="This week" value={counts.week ?? '–'} />
      </div>

      {laterWaiting > 0 && (
        <Callout tone="neutral" icon={<Inbox size={16} />}>
          {laterWaiting} more {laterWaiting === 1 ? 'contact' : 'contacts'} asked to be contacted later. {laterWaiting === 1 ? 'It appears' : 'They appear'} here when {laterWaiting === 1 ? 'its' : 'their'} date comes.{' '}
          <a
            href={orgPath('/outreach/team-lists?list=Follow+Up+Later')}
            onClick={(e) => { e.preventDefault(); navigate(orgPath('/outreach/team-lists?list=Follow+Up+Later')); }}
            style={{ color: 'var(--brand)' }}
          >
            Open the Follow Up Later list
          </a>
        </Callout>
      )}

      {loading && !data ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...micro, padding: 24 }}><Spinner size={16} /> Loading follow-ups…</div>
      ) : nothing ? (
        <Panel>
          <EmptyState icon={<CheckCircle2 size={24} />} title="Nothing to follow up">
            No open prospects and no new replies. When an Outreach contact is marked Interested, they appear here.
          </EmptyState>
        </Panel>
      ) : (
        <>
          {(data?.newReplies || []).length > 0 && (
            <Panel
              title="New replies to pick up"
              icon={<Sparkles size={16} />}
              actions={<Chip tone="brand">{data.newReplies.length}</Chip>}
              flush
            >
              <div style={{ ...micro, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
Interested replies are tracked automatically. These few need you: check the reason, then start tracking.
              </div>
              {data.newReplies.slice(0, limitOf('newReplies')).map((lead) => (
                <div key={lead._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ font: "550 14px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.companyName || lead.company || 'Company not set'}
                    </div>
                    <div style={{ ...micro, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.name}{lead.title || lead.headline ? ` · ${lead.title || lead.headline}` : ''}
                    </div>
                  </div>
                  <div style={{ ...micro, flex: '0 1 auto' }}>
                    {lead.lastReplyAt ? `Replied ${new Date(lead.lastReplyAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Marked interested'}
                    {scope === 'team' && lead.ownerName ? ` · ${lead.ownerName}` : ''}
                  </div>
                  <Button size="sm" iconRight={<ArrowRight size={13} />} onClick={() => setExportLead(lead)}>Start tracking</Button>
                  {lead.crmAutoTrack?.status === 'held' && lead.crmAutoTrack.reason && (
                    <div style={{ ...micro, flex: '1 1 100%', color: 'var(--warn-ink, #b45309)' }}>
                      Not tracked automatically: {lead.crmAutoTrack.reason}
                    </div>
                  )}
                </div>
              ))}
              {moreRows('newReplies', data.newReplies.length)}
            </Panel>
          )}

          {GROUPS.filter((g) => URGENT.includes(g.key)).map(renderGroup)}

          {/* 2026-11-24: below the dated work — in the team view this group can be
              50+ rows and used to push Overdue / Today off the screen. */}
          {laterRows.length > 0 && (
            <Panel
              title="Asked to be contacted later"
              icon={<Clock size={16} />}
              actions={<Chip tone={counts.laterDue > 0 ? 'warn' : undefined}>{laterRows.length}</Chip>}
              flush
            >
              <div style={{ ...micro, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                They said "not now". Their date has come or is this week: reach out again, then start tracking if there is a need, or push the date back.
              </div>
              {laterRows.slice(0, limitOf('laterLeads')).map((lead) => {
                const due = lead.followUp?.dueAt;
                const state = dueState(due);
                return (
                  <div key={lead._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <div style={{ font: "550 14px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.companyName || lead.company || 'Company not set'}
                      </div>
                      <div style={{ ...micro, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.name}{lead.title || lead.headline ? ` · ${lead.title || lead.headline}` : ''}
                        {scope === 'team' && lead.ownerName ? ` · ${lead.ownerName}` : ''}
                      </div>
                    </div>
                    <div style={{ ...micro, flex: '0 1 auto' }}>
                      <span style={{ color: DUE_TONE[state] }}>{due ? dueLabel(due) : 'No date'}</span>
                      {lead.lastReplyAt ? ` · replied ${dayMonth(lead.lastReplyAt)}` : ''}
                    </div>
                    <Select
                      value=""
                      onChange={(e) => snooze(lead, e.target.value)}
                      disabled={snoozing === lead._id}
                      aria-label={`Push back the follow-up for ${lead.name || 'this contact'}`}
                      style={{ width: 130 }}
                    >
                      <option value="">{snoozing === lead._id ? 'Saving…' : 'Push back…'}</option>
                      {SNOOZE_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </Select>
                    <Button size="sm" variant="secondary" iconRight={<ArrowRight size={13} />} onClick={() => setExportLead(lead)}>Start tracking</Button>
                  </div>
                );
              })}
              {moreRows('laterLeads', laterRows.length)}
            </Panel>
          )}

          {GROUPS.filter((g) => !URGENT.includes(g.key)).map(renderGroup)}
        </>
      )}

      <ExportToCRMModal
        isOpen={!!exportLead}
        onClose={() => setExportLead(null)}
        lead={exportLead}
        onSuccess={() => { setExportLead(null); load({ quiet: true }); }}
      />
      <NewRequirementModal open={showRequirement} onClose={() => setShowRequirement(false)} />
    </div>
  );
}

export default CrmFollowUpsV2;
