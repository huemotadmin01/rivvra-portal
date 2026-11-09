import { useState, useEffect, useRef } from 'react';
import {
  X, Linkedin, Mail, Phone, Building2, MapPin, Briefcase,
  Calendar, Globe, StickyNote, Plus, Trash2, ExternalLink,
  Clock, Tag, RefreshCw, Reply, ChevronDown, ChevronUp, MessageSquareText,
  Copy, Check, Archive, UserRound, Eye
} from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { Avatar } from './ds';

/* 2026-11-04 panel pass. Fixed here (see also portal-leads.js):
   - Bounced (11k contacts) and other system statuses showed as "Not
     Contacted" — the select had no such option. Now shown as they are.
   - Company / job title were blank for ~20k contacts that only carry
     companyName / currentTitle.
   - Notes: ISO dates printed raw, line breaks collapsed, a failed save still
     showed the note, and the whole array was re-sent — overwriting a note the
     extension added meanwhile. Now one add/remove op, newest first, with author.
   - Status change kept showing the default lists the server had removed.
   - Every failed save was silent (console only); clearing profile type never
     saved; archived contacts looked editable.
   - A slow reply fetch for the previous contact could land on the next one.
   - "Added on 12/08/2026" was ambiguous; source was always "Extension". */

const STATUS_LABELS = {
  not_contacted: 'Not Contacted',
  in_sequence: 'In Sequence',
  replied: 'Interested',
  replied_not_interested: 'Not Interested',
  no_response: 'No Response',
  // 2026-11-09: system status (set by the sequence engine) — raw key showed.
  // Same wording as leadskit's STATUS_TONE.
  lost_no_response: 'Lost - No Response',
  bounced: 'Bounced',
  converted: 'Converted',
};

// Statuses a rep may set by hand (same as the bulk "Change status" dialog).
// In Sequence and Bounced are set by the system.
const MANUAL_STATUSES = ['not_contacted', 'replied', 'replied_not_interested', 'no_response', 'converted'];
// Same list as the API's AUTO_STOP_STATUSES.
const STOPS_SEQUENCES = new Set(['replied', 'replied_not_interested', 'no_response', 'converted']);

const REPLY_INTENT_LABELS = {
  interested: 'Interested', referral: 'Referral', later: 'Follow up later',
  not_interested: 'Not interested', wrong_person: 'Wrong person',
  left_company: 'Left company', ooo: 'Auto-reply', unclear: 'Unclear',
};

const SOURCE_LABELS = {
  extension: 'Chrome extension',
  manual: 'Added manually',
  linkedin: 'LinkedIn',
  'portal-signup': 'Portal sign-up',
  portal_search: 'Rivvra search',
};

// "4 Nov 2026" — the old toLocaleDateString() printed 12/08/2026, which
// reads as 12 Aug or Dec 8 depending on who is looking.
function fmtDate(d, withTime = false) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString('en-GB', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

// Note dates are ISO for new notes, a locale string ("06/02/2026") for old
// ones — show old ones as stored rather than guess the day/month order.
function fmtNoteDate(s) {
  if (!s) return '';
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? fmtDate(s, true) : s;
}

// Contacts imported before createdAt existed still carry it in the _id.
function addedOn(lead) {
  const raw = lead.createdAt || lead.savedAt;
  if (raw) return fmtDate(raw);
  if (/^[a-f0-9]{24}$/i.test(String(lead._id || ''))) {
    return fmtDate(new Date(parseInt(String(lead._id).slice(0, 8), 16) * 1000));
  }
  return null;
}

function errMsg(err, fallback) {
  return err?.message && err.message !== 'Request failed' ? err.message : fallback;
}

function InfoRow({ icon: Icon, label, value, href, external = false, copy, extra }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(copy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — nothing to do */ }
  };
  return (
    <div className="flex items-start gap-3 py-1.5">
      <Icon className="w-4 h-4 text-dark-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-dark-500 mb-0.5">{label}</p>
        <div className="flex items-center gap-1.5 min-w-0">
          {href ? (
            <a
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="text-sm text-rivvra-400 hover:underline inline-flex items-center gap-1 min-w-0 break-all"
            >
              {value}
              {external && <ExternalLink className="w-3 h-3 flex-shrink-0" />}
            </a>
          ) : (
            <p className="text-sm text-white break-words min-w-0">{value}</p>
          )}
          {extra}
          {copy && (
            <button
              type="button"
              onClick={doCopy}
              title={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}
              aria-label={`Copy ${label.toLowerCase()}`}
              className="p-1 rounded hover:bg-dark-800 text-dark-500 hover:text-dark-300 flex-shrink-0"
            >
              {copied ? <Check className="w-3 h-3 text-rivvra-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children, saving, right }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">{children}</h3>
      {saving ? (
        <span className="flex items-center gap-1 text-[11px] text-dark-500">
          <RefreshCw className="w-3 h-3 animate-spin" /> Saving…
        </span>
      ) : right}
    </div>
  );
}

// 2026-11-09: `readOnly` — the page passes it when the viewer cannot edit
// this contact (the API's PUT /leads/:id only matches the owner, an outreach
// admin, or a team lead of the owner's team; everyone else got "Lead not
// found" after editing a teammate's contact). Hides every edit control.
function LeadDetailPanel({ lead, onClose, onUpdate, teamMode = false, onAssign, readOnly = false }) {
  const { showToast } = useToast();
  const [newNote, setNewNote] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notes, setNotes] = useState(lead?.notes || []);
  const [confirmDeleteAt, setConfirmDeleteAt] = useState(null);
  const [profileType, setProfileType] = useState(lead?.profileType || '');
  const [savingProfileType, setSavingProfileType] = useState(false);
  const [tags, setTags] = useState(lead?.tags || []);
  const [newTag, setNewTag] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const [outreachStatus, setOutreachStatus] = useState(lead?.outreachStatus || 'not_contacted');
  const [savingOutreachStatus, setSavingOutreachStatus] = useState(false);
  const [replyData, setReplyData] = useState(null);
  const [loadingReply, setLoadingReply] = useState(false);
  const [replyExpanded, setReplyExpanded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  // Latest lead, for async handlers that finish after the user switched contact.
  const leadIdRef = useRef(lead?._id);
  leadIdRef.current = lead?._id;

  // Fetch reply when lead changes. `stale` drops a slow answer for the
  // contact the user already moved away from.
  useEffect(() => {
    if (!lead?._id) { setReplyData(null); return undefined; }
    let stale = false;
    setLoadingReply(true);
    setReplyData(null);
    setReplyExpanded(false);
    api.getLeadReply(lead._id)
      .then(res => { if (!stale && res.reply) setReplyData(res.reply); })
      .catch(() => {})
      .finally(() => { if (!stale) setLoadingReply(false); });
    return () => { stale = true; };
  }, [lead?._id]);

  useEffect(() => { setNotes(lead?.notes || []); setConfirmDeleteAt(null); }, [lead?._id, lead?.notes]);
  useEffect(() => { setProfileType(lead?.profileType || ''); }, [lead?._id, lead?.profileType]);
  useEffect(() => { setTags(lead?.tags || []); }, [lead?._id, lead?.tags]);
  useEffect(() => { setOutreachStatus(lead?.outreachStatus || 'not_contacted'); }, [lead?._id, lead?.outreachStatus]);
  useEffect(() => { setImgFailed(false); setNewNote(''); setNewTag(''); }, [lead?._id]);

  // Esc closes the panel (unless a field is being typed in).
  useEffect(() => {
    if (!lead) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) { t.blur(); return; }
      if (document.querySelector('[role="dialog"]')) return; // a modal on top owns Esc
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lead, onClose]);

  if (!lead) return null;

  const archived = !!lead.archived;
  // Every edit control below keys off `locked`: archived OR view-only.
  const locked = archived || readOnly;
  const company = lead.companyName || lead.company || '';
  const jobTitle = lead.title || lead.currentTitle || '';
  const subtitle = jobTitle || lead.headline || '';
  const sameLead = (id) => leadIdRef.current === id;

  // ---- Notes ---------------------------------------------------------------
  const handleAddNote = async () => {
    const text = newNote.trim();
    if (!text || savingNotes || locked) return;
    const id = lead._id;
    setSavingNotes(true);
    try {
      const res = await api.addLeadNote(id, text);
      const saved = Array.isArray(res?.notes) ? res.notes : [...notes, { text, date: new Date().toISOString() }];
      if (sameLead(id)) { setNotes(saved); setNewNote(''); }
      onUpdate?.({ ...lead, notes: saved });
    } catch (err) {
      showToast(errMsg(err, 'Could not save the note'), 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDeleteNote = async (index) => {
    if (savingNotes || locked) return;
    const note = notes[index];
    const id = lead._id;
    setConfirmDeleteAt(null);
    setSavingNotes(true);
    try {
      const res = await api.removeLeadNote(id, note, index);
      const saved = Array.isArray(res?.notes) ? res.notes : notes.filter((_, i) => i !== index);
      if (sameLead(id)) setNotes(saved);
      onUpdate?.({ ...lead, notes: saved });
    } catch (err) {
      showToast(errMsg(err, 'Could not delete the note'), 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  // ---- Profile type ----------------------------------------------------------
  const handleProfileTypeChange = async (newType) => {
    const prev = profileType;
    const id = lead._id;
    setProfileType(newType);
    setSavingProfileType(true);
    try {
      await api.updateLead(id, { profileType: newType || null });
      onUpdate?.({ ...lead, profileType: newType || undefined });
    } catch (err) {
      if (sameLead(id)) setProfileType(prev);
      showToast(errMsg(err, 'Could not change the profile type'), 'error');
    } finally {
      setSavingProfileType(false);
    }
  };

  // ---- Outreach status -------------------------------------------------------
  const handleOutreachStatusChange = async (newStatus) => {
    const oldStatus = outreachStatus;
    if (newStatus === oldStatus) return;
    const id = lead._id;
    setOutreachStatus(newStatus);
    setSavingOutreachStatus(true);
    try {
      const res = await api.updateLead(id, { outreachStatus: newStatus });
      const parts = [`Status set to ${STATUS_LABELS[newStatus] || newStatus}`];
      if (res?.autoAddedToList) parts.push(`moved to "${res.autoAddedToList}"`);
      if (res?.stoppedSequenceCount > 0) {
        parts.push(`${res.stoppedSequenceCount} active sequence${res.stoppedSequenceCount > 1 ? 's' : ''} stopped`);
      }
      showToast(parts.join(' · '));

      const updatedLead = { ...lead, outreachStatus: newStatus };
      // The server also removes the OTHER default lists; use what it stored.
      if (Array.isArray(res?.lists)) updatedLead.lists = res.lists;
      else if (res?.autoAddedToList && !(lead.lists || []).includes(res.autoAddedToList)) {
        updatedLead.lists = [...(lead.lists || []), res.autoAddedToList];
      }
      onUpdate?.(updatedLead);
    } catch (err) {
      if (sameLead(id)) setOutreachStatus(oldStatus);
      showToast(errMsg(err, 'Could not change the status'), 'error');
    } finally {
      setSavingOutreachStatus(false);
    }
  };

  // ---- Tags ------------------------------------------------------------------
  const saveTags = async (updatedTags, prevTags) => {
    const id = lead._id;
    setTags(updatedTags);
    setSavingTags(true);
    try {
      const res = await api.updateLeadTags(id, updatedTags);
      const saved = Array.isArray(res?.tags) ? res.tags : updatedTags;
      if (sameLead(id)) setTags(saved);
      onUpdate?.({ ...lead, tags: saved });
    } catch (err) {
      if (sameLead(id)) setTags(prevTags);
      showToast(errMsg(err, 'Could not save tags'), 'error');
    } finally {
      setSavingTags(false);
    }
  };

  // "java, react" adds two tags.
  const handleAddTag = () => {
    if (locked || savingTags) return;
    const incoming = newTag.split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean);
    setNewTag('');
    const fresh = incoming.filter((t, i) => !tags.includes(t) && incoming.indexOf(t) === i);
    if (!fresh.length) return;
    saveTags([...tags, ...fresh], tags);
  };

  const handleRemoveTag = (tagToRemove) => {
    if (locked || savingTags) return;
    saveTags(tags.filter((t) => t !== tagToRemove), tags);
  };

  // Current status may be one the rep cannot pick (In Sequence, Bounced, or
  // a legacy value) — show it, disabled, instead of falling back to the first
  // option ("Not Contacted"), which is what the old select displayed.
  const statusIsManual = MANUAL_STATUSES.includes(outreachStatus);
  const selectCls = 'w-full px-2.5 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

  // Newest first; keep the stored index for delete.
  const noteRows = notes.map((note, index) => ({ note, index })).reverse();

  return (
    <aside
      aria-label={`Contact: ${lead.name || 'Unknown'}`}
      className="fixed inset-y-0 right-0 w-full max-w-[420px] bg-dark-900 border-l border-dark-700 shadow-2xl z-50 flex flex-col animate-slide-in"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-dark-700">
        <div className="flex items-start gap-3 min-w-0">
          {lead.profilePicture && !imgFailed ? (
            <img
              src={lead.profilePicture}
              alt=""
              onError={() => setImgFailed(true)}
              className="w-12 h-12 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <Avatar name={lead.name || '?'} size="lg" />
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white leading-snug break-words">{lead.name || 'Unknown'}</h2>
            {subtitle && <p className="text-sm text-dark-400 leading-snug line-clamp-2" title={subtitle}>{subtitle}</p>}
            {company && (
              <p className="text-xs text-dark-500 mt-0.5 flex items-center gap-1 min-w-0">
                <Building2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate" title={company}>{company}</span>
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          title="Close (Esc)"
          className="p-2 -mr-1 hover:bg-dark-800 rounded-lg transition-colors flex-shrink-0"
        >
          <X className="w-5 h-5 text-dark-400" />
        </button>
      </div>

      {/* Quick Actions */}
      {(lead.linkedinUrl || lead.email || lead.phone) && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-dark-700">
          {lead.linkedinUrl && (
            <a
              href={lead.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A66C2] hover:bg-[#004182] text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Linkedin className="w-3.5 h-3.5" /> LinkedIn
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
          )}
          {lead.phone && (
            <a
              href={`tel:${String(lead.phone).replace(/[^\d+]/g, '')}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Phone className="w-3.5 h-3.5" /> Call
            </a>
          )}
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {readOnly && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-xs text-dark-300">
            <Eye className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            View only{lead.ownerName ? ` — owned by ${lead.ownerName}` : ''}. Only the owner, their team lead or an admin can change it.
          </div>
        )}
        {archived && !readOnly && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <Archive className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            This contact is archived. Unarchive it to change its status, tags or notes.
          </div>
        )}

        {/* Status + Profile type, side by side */}
        <div className="p-4 border-b border-dark-700">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionTitle saving={savingOutreachStatus}>Status</SectionTitle>
              <select
                aria-label="Outreach status"
                value={outreachStatus}
                disabled={locked || savingOutreachStatus}
                onChange={(e) => handleOutreachStatusChange(e.target.value)}
                className={selectCls}
              >
                {!statusIsManual && (
                  <option value={outreachStatus} disabled>
                    {STATUS_LABELS[outreachStatus] || outreachStatus}
                  </option>
                )}
                {MANUAL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <SectionTitle saving={savingProfileType}>Profile type</SectionTitle>
              <select
                aria-label="Profile type"
                value={profileType}
                disabled={locked || savingProfileType}
                onChange={(e) => handleProfileTypeChange(e.target.value)}
                className={selectCls}
              >
                <option value="">Not set</option>
                <option value="candidate">Candidate</option>
                <option value="client">Client</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-dark-500 mt-2 leading-relaxed">
            {outreachStatus === 'bounced'
              ? 'Their email bounced. Correct the email (Edit contact) and they can be added to a sequence again.'
              : outreachStatus === 'in_sequence'
                ? 'In a sequence now. Setting Interested, Not Interested, No Response or Converted stops it.'
                : 'Use this when they reply on LinkedIn or by phone. Interested, Not Interested, No Response and Converted also stop any active sequence.'}
          </p>
        </div>

        {/* Latest Reply — shown for replied leads */}
        {(replyData || loadingReply) && (
          <div className="p-4 border-b border-dark-700">
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5"><MessageSquareText className="w-3.5 h-3.5" /> Latest reply</span>
            </SectionTitle>
            {loadingReply ? (
              <div className="flex items-center gap-2 text-xs text-dark-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Loading reply…
              </div>
            ) : replyData && (
              <div className={`rounded-xl p-3 border ${
                replyData.status === 'replied'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-orange-500/30 bg-orange-500/5'
              }`}>
                <div className="flex items-center gap-2 mb-2 min-w-0">
                  <Reply className="w-3.5 h-3.5 text-dark-400 flex-shrink-0" />
                  <span className="text-xs text-dark-400 truncate min-w-0">
                    {replyData.replyFrom || lead.email || 'Contact'}
                  </span>
                  {/* 2026-09-21: show the AI's verdict. This used to print
                      "Interested" for ANY reply that was not a hard no, so a
                      bounce notice or "not right now" read as a hot lead. */}
                  {(() => {
                    const hot = replyData.intent ? ['interested', 'referral'].includes(replyData.intent) : false;
                    const label = replyData.intent
                      ? (REPLY_INTENT_LABELS[replyData.intent] || replyData.intent)
                      : (replyData.status === 'replied' ? 'Replied' : 'Not Interested');
                    const tone = hot
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : (replyData.intent === 'later' || (!replyData.intent && replyData.status === 'replied'))
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        : 'text-orange-400 bg-orange-500/10 border-orange-500/20';
                    return (
                      <span title={replyData.intentHint || undefined} className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border flex-shrink-0 ${tone}`}>
                        {label}
                      </span>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-2 mb-2 min-w-0">
                  <Clock className="w-3 h-3 text-dark-600 flex-shrink-0" />
                  <span className="text-[11px] text-dark-500 flex-shrink-0">
                    {fmtDate(replyData.replyDate, true) || '—'}
                  </span>
                  {replyData.sequenceName && (
                    <>
                      <span className="text-dark-600">·</span>
                      <span className="text-[11px] text-dark-500 truncate min-w-0" title={replyData.sequenceName}>{replyData.sequenceName}</span>
                    </>
                  )}
                </div>

                {(() => {
                  const text = replyData.replyBody || replyData.replySnippet || '';
                  if (!text) return null;
                  const isLong = text.length > 200;
                  return (
                    <div>
                      <p className={`text-sm text-dark-200 whitespace-pre-wrap break-words leading-relaxed ${!replyExpanded && isLong ? 'line-clamp-4' : ''}`}>
                        {text}
                      </p>
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => setReplyExpanded(!replyExpanded)}
                          className="flex items-center gap-1 text-[11px] text-rivvra-400 hover:text-rivvra-300 mt-1.5 font-medium"
                        >
                          {replyExpanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Read full reply</>}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Contact Information */}
        <div className="p-4 border-b border-dark-700">
          <SectionTitle>Contact</SectionTitle>
          {!lead.email && !lead.phone && !lead.linkedinUrl ? (
            <p className="text-xs text-dark-500">No email, phone or LinkedIn on this contact.</p>
          ) : (
            <div>
              <InfoRow
                icon={Mail}
                label="Email"
                value={lead.email}
                href={lead.email ? `mailto:${lead.email}` : undefined}
                copy={lead.email}
                extra={outreachStatus === 'bounced'
                  ? <span className="px-1.5 py-0.5 text-[10px] font-medium rounded border text-red-400 bg-red-500/10 border-red-500/20 flex-shrink-0">Bounced</span>
                  : lead.emailVerified === true
                    ? <span className="px-1.5 py-0.5 text-[10px] font-medium rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 flex-shrink-0">Verified</span>
                    : null}
              />
              <InfoRow
                icon={Phone}
                label="Phone"
                value={lead.phone}
                href={lead.phone ? `tel:${String(lead.phone).replace(/[^\d+]/g, '')}` : undefined}
                copy={lead.phone}
              />
              <InfoRow
                icon={Linkedin}
                label="LinkedIn"
                value={lead.linkedinUrl ? 'View profile' : null}
                href={lead.linkedinUrl}
                external
              />
            </div>
          )}
        </div>

        {/* Professional Information */}
        {(jobTitle || lead.headline || company || lead.location || lead.industry) && (
          <div className="p-4 border-b border-dark-700">
            <SectionTitle>Professional</SectionTitle>
            <InfoRow icon={Briefcase} label="Job title" value={jobTitle || lead.headline} />
            <InfoRow icon={Building2} label="Company" value={company} />
            <InfoRow icon={MapPin} label="Location" value={lead.location} />
            <InfoRow icon={Tag} label="Industry" value={lead.industry} />
          </div>
        )}

        {/* Contact Owner (Team Mode only) */}
        {teamMode && lead.ownerName && (
          <div className="p-4 border-b border-dark-700">
            <SectionTitle>Contact owner</SectionTitle>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Avatar name={lead.ownerName} size="md" />
                <span className="text-sm text-white">{lead.ownerName}</span>
              </div>
              {onAssign && !readOnly && (
                <button
                  type="button"
                  onClick={() => onAssign(lead)}
                  className="text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors"
                >
                  Reassign
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="p-4 border-b border-dark-700">
          <SectionTitle saving={savingTags}>Tags</SectionTitle>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20 rounded-full"
                >
                  {tag}
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      disabled={savingTags}
                      aria-label={`Remove tag ${tag}`}
                      className="p-0.5 rounded-full hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {!locked && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                maxLength={120}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                placeholder={tags.length ? 'Add a tag…' : 'Add a tag (comma for several)…'}
                aria-label="New tag"
                className="flex-1 min-w-0 px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-white text-xs placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
              />
              <button
                type="button"
                onClick={handleAddTag}
                disabled={!newTag.trim() || savingTags}
                aria-label="Add tag"
                className="px-2.5 py-1.5 bg-dark-800 hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed text-dark-300 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {locked && tags.length === 0 && <p className="text-xs text-dark-500">No tags</p>}
        </div>

        {/* Notes Section */}
        <div className="p-4 border-b border-dark-700">
          <SectionTitle saving={savingNotes}>Notes{notes.length ? ` (${notes.length})` : ''}</SectionTitle>

          {!locked && (
            <div className="mb-3">
              <div className="flex gap-2 items-end">
                <textarea
                  value={newNote}
                  rows={newNote.includes('\n') || newNote.length > 48 ? 3 : 1}
                  maxLength={2000}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleAddNote(); }
                  }}
                  placeholder="Add a note…"
                  aria-label="New note"
                  className="flex-1 min-w-0 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 resize-none leading-snug"
                />
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || savingNotes}
                  aria-label="Add note"
                  className="px-3 py-2 bg-rivvra-500 hover:bg-rivvra-400 disabled:opacity-50 disabled:cursor-not-allowed text-dark-950 font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-dark-600 mt-1">Enter to save · Shift+Enter for a new line</p>
            </div>
          )}

          {notes.length === 0 ? (
            <div className="text-center py-4">
              <StickyNote className="w-7 h-7 text-dark-600 mx-auto mb-1.5" />
              <p className="text-xs text-dark-500">No notes yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {noteRows.map(({ note, index }) => (
                <div
                  key={`${index}-${note.date}`}
                  className="group p-3 bg-dark-800 rounded-lg border border-dark-700"
                >
                  <p className="text-sm text-white whitespace-pre-wrap break-words leading-relaxed">{note.text}</p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="flex items-center gap-1 text-[11px] text-dark-500 min-w-0">
                      <Clock className="w-3 h-3 text-dark-600 flex-shrink-0" />
                      <span className="truncate">
                        {fmtNoteDate(note.date)}
                        {note.by && <> · <UserRound className="w-3 h-3 inline -mt-0.5" /> {note.by}</>}
                      </span>
                    </span>
                    {!locked && (confirmDeleteAt === index ? (
                      <span className="flex items-center gap-1.5 text-[11px] flex-shrink-0">
                        <button type="button" onClick={() => handleDeleteNote(index)} className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 font-medium">Delete</button>
                        <button type="button" onClick={() => setConfirmDeleteAt(null)} className="px-1.5 py-0.5 rounded text-dark-400 hover:bg-dark-700">Keep</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAt(index)}
                        disabled={savingNotes}
                        aria-label="Delete note"
                        title="Delete note"
                        className="opacity-40 group-hover:opacity-100 focus:opacity-100 p-1 hover:bg-dark-700 rounded transition-all flex-shrink-0"
                      >
                        <Trash2 className="w-3 h-3 text-dark-400 hover:text-red-400" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact Metadata */}
        <div className="p-4">
          <SectionTitle>Details</SectionTitle>
          <InfoRow icon={Globe} label="Source" value={SOURCE_LABELS[lead.leadSource] || lead.leadSource || 'Chrome extension'} />
          <InfoRow icon={UserRound} label="Sourced by" value={lead.sourcedBy} />
          <InfoRow icon={Calendar} label="Added on" value={addedOn(lead)} />
          {lead.lists && lead.lists.length > 0 && (
            <div className="flex items-start gap-3 py-1.5">
              <Tag className="w-4 h-4 text-dark-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[11px] text-dark-500 mb-1">Lists</p>
                <div className="flex flex-wrap gap-1">
                  {lead.lists.map((list) => (
                    <span key={list} className="px-2 py-0.5 text-xs bg-dark-800 text-dark-300 rounded-full">
                      {list}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default LeadDetailPanel;
