import { useState, useEffect } from 'react';
import { Linkedin, StickyNote, Users } from 'lucide-react';
import api from '../../../utils/api';
import ManageDropdown from '../../ManageDropdown';
import { DataTable, EmptyState, Chip, Avatar, InlineSelect } from '../../ds';

/* DESIGN-SYSTEM BOUNDARY (settled in phase 1): LeadsTableV2 and ListsRailV2
   deliberately stay here rather than moving into ds/. Both encode Outreach
   domain knowledge — the lead row shape (profile picture, outreach status,
   contact owner, LinkedIn), the ManageDropdown action contract, and the
   list-rail semantics of saved lead lists. A ds component that knows what a
   "lead" is would be the same drift phase 1 exists to repair, just pointed
   the other way. The generic parts they build on (DataTable, Chip, Avatar,
   InlineSelect, EmptyState) all live in ds/. Don't re-litigate.

   Shared v2 composition for the four Outreach lead lists (Slice 3 Wave C):
   MyLists / TeamLists / Leads / TeamContacts. Pages own data loading,
   modals and bulk verbs (they differ semantically); this file owns the
   table, filter strip and the lead-detail-panel URL sync. Search/filters
   stay LOCAL state — parity with the legacy pages, which never wrote
   them to the URL. */

export const PROFILE_TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'candidate', label: 'Candidate' },
  { value: 'client', label: 'Client' },
];

export const OUTREACH_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'not_contacted', label: 'Not Contacted' },
  { value: 'in_sequence', label: 'In Sequence' },
  { value: 'replied', label: 'Interested' },
  { value: 'replied_not_interested', label: 'Not Interested' },
  { value: 'no_response', label: 'No Response' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'converted', label: 'Converted' },
];

// Same status → tone/label map every legacy page inlines.
const STATUS_CHIP = {
  in_sequence: { tone: 'info', label: 'In Sequence' },
  replied: { tone: 'brand', label: 'Interested' },
  replied_not_interested: { tone: 'warn', label: 'Not Interested' },
  no_response: { tone: 'neutral', label: 'No Response' },
  lost_no_response: { tone: 'neutral', label: 'Lost - No Response' },
  bounced: { tone: 'danger', label: 'Bounced' },
  converted: { tone: 'brand', label: 'Converted' },
};

export function OutreachStatusChip({ status }) {
  const s = STATUS_CHIP[status];
  if (!s) return <Chip>Not Contacted</Chip>;
  return <Chip tone={s.tone} dot>{s.label}</Chip>;
}

// AI reply-intent badge (2026-08-21). Shows WHY a lead is in Hot Leads:
// a referral, a future window, etc. Only renders for intents that add
// information beyond the status chip; hint (timing phrase / referred
// person) goes in the tooltip.
const INTENT_CHIP = {
  referral: { tone: 'info', label: 'Referral' },
  later: { tone: 'warn', label: 'Later' },
  interested: { tone: 'brand', label: 'AI: Interested' },
  wrong_person: { tone: 'neutral', label: 'Wrong person' },
  left_company: { tone: 'neutral', label: 'Left company' },
};
export function ReplyIntentChip({ lead }) {
  const s = INTENT_CHIP[lead?.lastReplyIntent];
  if (!s) return null;
  return (
    <span title={lead.lastReplyIntentHint || ''} style={{ marginLeft: 6, display: 'inline-block' }}>
      <Chip tone={s.tone}>{s.label}{lead.lastReplyIntentHint ? ' ·' : ''}</Chip>
    </span>
  );
}

export function ProfileTypeChip({ type }) {
  if (type === 'client') return <Chip tone="info">Client</Chip>;
  if (type === 'candidate') return <Chip tone="info" style={{ color: 'var(--a-ats, #8b5cf6)', background: 'color-mix(in srgb, var(--a-ats, #8b5cf6) 14%, transparent)' }}>Candidate</Chip>;
  return <span style={{ color: 'var(--fg-4)' }}>—</span>;
}

const missingEmail = (email) => !email || email === 'noemail@domain.com';

/** Setup status for the add-to-sequence guard — shared fetch. */
export function useSetupStatus() {
  const [setupComplete, setSetupComplete] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.getSetupStatus()
      .then((res) => { if (!cancelled) setSetupComplete(res?.success ? res.allComplete : false); })
      .catch(() => { if (!cancelled) setSetupComplete(false); });
    return () => { cancelled = true; };
  }, []);
  return setupComplete;
}

/** Same email guard every legacy page applies before Add-to-Sequence. */
export function sequenceEmailGuardOk(lead) {
  const email = (lead?.email || '').trim();
  if (missingEmail(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** leadId route-param ↔ selected lead sync (identical effect in all four
 *  legacy pages, extracted). `seg` is the outreach route segment. */
export function useLeadPanelSync({ leadId, leads, selectedLead, setSelectedLead, navigate, orgPath, seg, keepQs = true, searchParams }) {
  useEffect(() => {
    let cancelled = false;
    if (!leadId) {
      if (selectedLead) setSelectedLead(null);
      return;
    }
    if (selectedLead && String(selectedLead._id) === String(leadId)) return;
    const inPage = leads.find((l) => String(l._id) === String(leadId));
    if (inPage) { setSelectedLead(inPage); return; }
    api.getLead(leadId)
      .then((res) => {
        if (cancelled) return;
        const lead = res?.lead || res?.data || (res?._id ? res : null);
        if (lead) setSelectedLead(lead);
        else navigate(orgPath(`/outreach/${seg}`), { replace: true });
      })
      .catch(() => { if (!cancelled) navigate(orgPath(`/outreach/${seg}`), { replace: true }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, leads]);

  const qs = keepQs && searchParams?.toString() ? `?${searchParams.toString()}` : '';
  const openLead = (lead) => {
    setSelectedLead(lead);
    navigate(orgPath(`/outreach/${seg}/${lead._id}${qs}`));
  };
  const closePanel = () => {
    setSelectedLead(null);
    navigate(orgPath(`/outreach/${seg}${qs}`));
  };
  return { openLead, closePanel };
}

/** The filter strip: search input (page-owned debounce), profile-type and
 *  status selects, optional owner select, right-aligned actions slot. */
export function LeadsFilterStrip({
  searchQuery, onSearchChange, searchPlaceholder = 'Search contacts…',
  profileTypeFilter, onProfileTypeChange,
  outreachStatusFilter, onStatusChange,
  ownerFilter, onOwnerChange, ownerOptions,
  resultCount, noun = 'contact',
  children,
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 12px', borderRadius: 'var(--r-3, 14px)', marginBottom: 14,
      background: 'var(--surface-1)', boxShadow: 'inset 0 0 0 1px var(--line)',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 9px',
        borderRadius: 'var(--r-1, 7px)', background: 'var(--surface-2)',
        boxShadow: 'inset 0 0 0 1px var(--line)', width: 230,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-4)" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--fg)', font: "450 12.5px/1 'Inter', system-ui, sans-serif" }}
        />
      </span>
      <InlineSelect value={profileTypeFilter} onChange={(e) => onProfileTypeChange(e.target.value)}>
        {PROFILE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </InlineSelect>
      <InlineSelect value={outreachStatusFilter} onChange={(e) => onStatusChange(e.target.value)}>
        {OUTREACH_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </InlineSelect>
      {onOwnerChange && (
        <InlineSelect value={ownerFilter} onChange={(e) => onOwnerChange(e.target.value)}>
          <option value="all">All owners</option>
          {(ownerOptions || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </InlineSelect>
      )}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {resultCount != null && (
          <span style={{ font: "450 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {resultCount.toLocaleString()} {resultCount === 1 ? noun : `${noun}s`}
          </span>
        )}
        {children}
      </span>
    </div>
  );
}

// Row checkbox (token-styled; mirrors DataTable's internal Check).
function Check({ checked, indeterminate, onChange, label }) {
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onChange(!checked); } }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 15, height: 15, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
        background: checked || indeterminate ? 'var(--brand)' : 'transparent',
        boxShadow: `inset 0 0 0 ${checked || indeterminate ? 0 : 1.5}px var(--line-strong, rgba(255,255,255,.18))`,
        transition: 'background 120ms var(--e-out), box-shadow 120ms var(--e-out)',
      }}
    >
      {indeterminate ? (
        <span style={{ width: 7, height: 2, borderRadius: 1, background: 'var(--brand-fg)' }} />
      ) : checked ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--brand-fg, #041209)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : null}
    </span>
  );
}

/** The lead table. Custom rows via DataTable children (selection + the
 *  ManageDropdown cell can't be expressed through the column API).
 *  `manageProps(lead)` returns the ManageDropdown props for that row, or
 *  null to hide the dropdown (TeamLists' canEditLead gating). */
export function LeadsTableV2({
  leads = [],
  loading = false,
  selectedLeads = [],
  onSelectionChange,
  showOwnerCol = false,
  onOpenLead,
  manageProps,
  empty,
}) {
  const selSet = new Set(selectedLeads);
  const allOn = leads.length > 0 && leads.every((l) => selSet.has(l._id));
  const someOn = !allOn && leads.some((l) => selSet.has(l._id));
  const toggleAll = () => {
    if (allOn) onSelectionChange(selectedLeads.filter((id) => !leads.some((l) => l._id === id)));
    else onSelectionChange([...new Set([...selectedLeads, ...leads.map((l) => l._id)])]);
  };
  const toggleOne = (id) => {
    if (selSet.has(id)) onSelectionChange(selectedLeads.filter((x) => x !== id));
    else onSelectionChange([...selectedLeads, id]);
  };

  const columns = [
    { key: '__sel', width: 40, header: <Check checked={allOn} indeterminate={someOn} onChange={toggleAll} label="Select all" /> },
    { key: 'contact', header: 'Contact', width: 240 },
    { key: '__manage', header: '', width: 110 },
    ...(showOwnerCol ? [{ key: 'owner', header: 'Contact Owner', width: 150 }] : []),
    { key: 'profileType', header: 'Profile Type', width: 110 },
    { key: 'status', header: 'Status', width: 150 },
    { key: 'company', header: 'Company', width: 170 },
    { key: 'location', header: 'Location', width: 150 },
    { key: 'email', header: 'Email', width: 200 },
    { key: 'notes', header: 'Notes', width: 70 },
  ];

  const td = (extra = {}) => ({
    padding: '11px 14px', font: '450 13px/1.45 var(--font)', color: 'var(--fg-2)',
    borderBottom: '1px solid var(--line)', verticalAlign: 'middle',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...extra,
  });

  return (
    <DataTable columns={columns} rows={[]} loading={loading} resizable={false} empty={empty}>
      {!loading && leads.length ? leads.map((lead) => {
        const on = selSet.has(lead._id);
        const mp = manageProps ? manageProps(lead) : null;
        return (
          <tr
            key={lead._id}
            onClick={() => onOpenLead(lead)}
            style={{ cursor: 'pointer', background: on ? 'var(--brand-soft)' : 'transparent', transition: 'background 110ms var(--e-out)' }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
          >
            <td style={td()} onClick={(e) => e.stopPropagation()}>
              <Check checked={on} onChange={() => toggleOne(lead._id)} label={`Select ${lead.name || 'lead'}`} />
            </td>
            <td style={td()}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {lead.profilePicture
                  ? <img src={lead.profilePicture} alt="" style={{ width: 28, height: 28, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
                  : lead.name
                    ? <Avatar name={lead.name} size="sm" />
                    : (
                      <span style={{ width: 28, height: 28, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: 'var(--fg-4)' }}>
                        <Users size={13} />
                      </span>
                    )}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', color: 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name || 'Unknown'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ font: '450 11.5px/1.3 var(--font)', color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.title || lead.headline || '-'}
                    </span>
                    {lead.linkedinUrl && (
                      <a
                        href={lead.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '500 11px/1 var(--font)', color: 'var(--info, #3b82f6)', flexShrink: 0 }}
                      >
                        <Linkedin size={10} /> Profile
                      </a>
                    )}
                  </span>
                </span>
              </span>
            </td>
            <td style={td()} onClick={(e) => e.stopPropagation()}>
              {mp ? <ManageDropdown lead={lead} {...mp} /> : null}
            </td>
            {showOwnerCol && (
              <td style={td()}>
                {lead.ownerName ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <Avatar name={lead.ownerName} size="sm" style={{ width: 22, height: 22, fontSize: 9 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.ownerName}</span>
                  </span>
                ) : 'Unknown'}
              </td>
            )}
            <td style={td()}><ProfileTypeChip type={lead.profileType} /></td>
            <td style={td()}><OutreachStatusChip status={lead.outreachStatus} /><ReplyIntentChip lead={lead} /></td>
            <td style={td({ color: 'var(--fg-3)' })}>{lead.companyName || lead.company || <span style={{ color: 'var(--fg-4)' }}>—</span>}</td>
            <td style={td({ color: 'var(--fg-3)' })}>{lead.location || <span style={{ color: 'var(--fg-4)' }}>—</span>}</td>
            <td style={td({ color: 'var(--fg-3)' })}>
              {missingEmail(lead.email) ? <span style={{ color: 'var(--fg-4)' }}>Not found</span> : lead.email}
            </td>
            <td style={td()}>
              {lead.notes?.length ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-3)' }}>
                  <StickyNote size={12} style={{ color: 'var(--fg-4)' }} /> {lead.notes.length}
                </span>
              ) : <span style={{ color: 'var(--fg-4)' }}>—</span>}
            </td>
          </tr>
        );
      }) : null}
    </DataTable>
  );
}

/** Lists rail for MyLists / TeamLists — token-styled vertical list with
 *  counts; per-list trailing action (delete / rename) via `itemAction`. */
export function ListsRailV2({ title, lists = [], selected, onSelect, headerAction, itemAction }) {
  return (
    <aside style={{
      width: 230, flexShrink: 0, alignSelf: 'flex-start',
      background: 'var(--surface-1)', borderRadius: 'var(--r-3)',
      boxShadow: 'inset 0 0 0 1px var(--line)', padding: 8,
      position: 'sticky', top: 70,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 8px' }}>
        <span style={{ font: "600 10.5px/1 'Inter', system-ui, sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>{title}</span>
        {headerAction}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {lists.map((list, idx) => {
          const on = selected === list.name;
          return (
            <div
              key={list._id || list.name}
              onClick={() => onSelect(list)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 8px',
                borderRadius: 'var(--r-2)', cursor: 'pointer',
                background: on ? 'var(--surface-3)' : 'transparent',
                transition: 'background 110ms var(--e-out)',
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ flex: 1, minWidth: 0, font: `${on ? 600 : 500} 12.5px/1.3 var(--font)`, color: on ? 'var(--fg)' : 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {list.name}
              </span>
              <span style={{ font: '450 11px/1 var(--font)', color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums' }}>{list.count ?? ''}</span>
              {itemAction && itemAction(list, idx)}
            </div>
          );
        })}
        {lists.length === 0 && (
          <p style={{ padding: '10px 8px', font: '450 12px/1.5 var(--font)', color: 'var(--fg-4)' }}>No lists yet.</p>
        )}
      </div>
    </aside>
  );
}

export function LeadsEmptyState({ icon, title, children, actions }) {
  return (
    <EmptyState icon={icon || <Users size={22} />} title={title} actions={actions}>
      {children}
    </EmptyState>
  );
}
