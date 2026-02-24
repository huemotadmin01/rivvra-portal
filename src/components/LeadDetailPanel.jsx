import { useState, useEffect } from 'react';
import {
  X, Linkedin, Mail, Phone, Building2, MapPin, Briefcase,
  Calendar, Globe, StickyNote, Plus, Trash2, ExternalLink,
  User, Clock, Tag, RefreshCw, Reply, ChevronDown, ChevronUp, MessageSquareText
} from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';

const STATUS_LIST_LABELS = {
  'replied': 'Hot Leads',
  'replied_not_interested': 'Not Interested',
  'no_response': 'No Response'
};

function LeadDetailPanel({ lead, onClose, onUpdate, teamMode = false, teamMembers = [], onAssign }) {
  const { showToast } = useToast();
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notes, setNotes] = useState(lead?.notes || []);
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

  // Fetch reply when lead changes (only for replied leads)
  useEffect(() => {
    const status = lead?.outreachStatus;
    if (status === 'replied' || status === 'replied_not_interested') {
      setLoadingReply(true);
      setReplyData(null);
      setReplyExpanded(false);
      api.getLeadReply(lead._id)
        .then(res => { if (res.reply) setReplyData(res.reply); })
        .catch(() => {})
        .finally(() => setLoadingReply(false));
    } else {
      setReplyData(null);
    }
  }, [lead?._id, lead?.outreachStatus]);

  // Sync notes when lead changes
  useEffect(() => {
    setNotes(lead?.notes || []);
  }, [lead?._id, lead?.notes]);

  // Sync profileType when lead changes
  useEffect(() => {
    setProfileType(lead?.profileType || '');
  }, [lead?._id, lead?.profileType]);

  // Sync tags when lead changes
  useEffect(() => {
    setTags(lead?.tags || []);
  }, [lead?._id, lead?.tags]);

  // Sync outreachStatus when lead changes
  useEffect(() => {
    setOutreachStatus(lead?.outreachStatus || 'not_contacted');
  }, [lead?._id, lead?.outreachStatus]);

  if (!lead) return null;

  // Save notes to API
  const saveNotesToApi = async (updatedNotes) => {
    try {
      setSavingNotes(true);
      // Try the dedicated notes endpoint first, fall back to updateLead
      try {
        await api.updateLeadNotes(lead._id, updatedNotes);
      } catch (err) {
        // If notes endpoint doesn't exist, try updating the full lead
        await api.updateLead(lead._id, { notes: updatedNotes });
      }
      console.log('Notes saved to API successfully');
    } catch (err) {
      console.error('Failed to save notes to API:', err);
      // Don't throw - we still want local update to work
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);

    const noteObj = {
      text: newNote.trim(),
      date: new Date().toLocaleDateString()
    };

    try {
      const updatedNotes = [...notes, noteObj];
      setNotes(updatedNotes);
      setNewNote('');

      // Save to API
      await saveNotesToApi(updatedNotes);

      // Notify parent component
      if (onUpdate) {
        onUpdate({ ...lead, notes: updatedNotes });
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (index) => {
    const updatedNotes = notes.filter((_, i) => i !== index);
    setNotes(updatedNotes);

    // Save to API
    await saveNotesToApi(updatedNotes);

    if (onUpdate) {
      onUpdate({ ...lead, notes: updatedNotes });
    }
  };

  const handleProfileTypeChange = async (newType) => {
    setProfileType(newType);
    try {
      setSavingProfileType(true);
      await api.updateLead(lead._id, { profileType: newType });
      console.log('Profile type saved to API successfully');
      if (onUpdate) {
        onUpdate({ ...lead, profileType: newType });
      }
    } catch (err) {
      console.error('Failed to save profile type:', err);
      // Revert on failure
      setProfileType(lead?.profileType || '');
    } finally {
      setSavingProfileType(false);
    }
  };

  const handleOutreachStatusChange = async (newStatus) => {
    const oldStatus = outreachStatus;
    setOutreachStatus(newStatus);
    try {
      setSavingOutreachStatus(true);
      const res = await api.updateLead(lead._id, { outreachStatus: newStatus });
      console.log('Outreach status saved to API successfully');

      // Show toast if contact was auto-added to a list
      const listName = STATUS_LIST_LABELS[newStatus];
      if (listName && res.autoAddedToList) {
        showToast(`Contact added to "${res.autoAddedToList}" list`);
      }

      // Show toast if active sequences were stopped
      if (res.stoppedSequenceCount > 0) {
        showToast(`${res.stoppedSequenceCount} active sequence${res.stoppedSequenceCount > 1 ? 's' : ''} stopped`, 'info');
      }

      // Update lead with new status and updated lists
      const updatedLead = { ...lead, outreachStatus: newStatus };
      if (res.autoAddedToList) {
        const currentLists = lead.lists || [];
        if (!currentLists.includes(res.autoAddedToList)) {
          updatedLead.lists = [...currentLists, res.autoAddedToList];
        }
      }

      if (onUpdate) {
        onUpdate(updatedLead);
      }
    } catch (err) {
      console.error('Failed to save outreach status:', err);
      setOutreachStatus(oldStatus);
    } finally {
      setSavingOutreachStatus(false);
    }
  };

  const handleAddTag = async () => {
    const tagValue = newTag.trim().toLowerCase();
    if (!tagValue || tags.includes(tagValue)) { setNewTag(''); return; }
    const updatedTags = [...tags, tagValue];
    setTags(updatedTags);
    setNewTag('');
    try {
      setSavingTags(true);
      await api.updateLeadTags(lead._id, updatedTags);
      if (onUpdate) onUpdate({ ...lead, tags: updatedTags });
    } catch (err) {
      console.error('Failed to save tags:', err);
      setTags(tags); // revert
    } finally {
      setSavingTags(false);
    }
  };

  const handleRemoveTag = async (tagToRemove) => {
    const updatedTags = tags.filter((t) => t !== tagToRemove);
    setTags(updatedTags);
    try {
      setSavingTags(true);
      await api.updateLeadTags(lead._id, updatedTags);
      if (onUpdate) onUpdate({ ...lead, tags: updatedTags });
    } catch (err) {
      console.error('Failed to save tags:', err);
      setTags(tags); // revert
    } finally {
      setSavingTags(false);
    }
  };

  const InfoRow = ({ icon: Icon, label, value, isLink = false, href = '' }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-3 py-2">
        <Icon className="w-4 h-4 text-dark-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-dark-500 mb-0.5">{label}</p>
          {isLink ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-rivvra-400 hover:underline flex items-center gap-1"
            >
              {value}
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <p className="text-sm text-white break-words">{value}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-dark-900 border-l border-dark-700 shadow-2xl z-50 flex flex-col animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-700">
        <div className="flex items-center gap-3">
          {lead.profilePicture ? (
            <img
              src={lead.profilePicture}
              alt={lead.name}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center">
              <User className="w-6 h-6 text-dark-400" />
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-white">{lead.name || 'Unknown'}</h2>
            <p className="text-sm text-dark-400">{lead.title || lead.headline || '-'}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-dark-400" />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 p-4 border-b border-dark-700">
        {lead.linkedinUrl && (
          <a
            href={lead.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-[#0A66C2] hover:bg-[#004182] text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Linkedin className="w-4 h-4" />
            LinkedIn Profile
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="flex items-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Mail className="w-4 h-4" />
            Send Email
          </a>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Latest Reply — shown for replied leads */}
        {(replyData || loadingReply) && (
          <div className="p-4 border-b border-dark-700">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquareText className="w-3.5 h-3.5" />
              Latest Reply
            </h3>
            {loadingReply ? (
              <div className="flex items-center gap-2 text-xs text-dark-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Loading reply...
              </div>
            ) : replyData && (
              <div className={`rounded-xl p-3 border ${
                replyData.status === 'replied'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-orange-500/30 bg-orange-500/5'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Reply className="w-3.5 h-3.5 text-dark-400" />
                    <span className="text-xs text-dark-400 truncate max-w-[180px]">
                      {replyData.replyFrom || lead.email || 'Contact'}
                    </span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${
                      replyData.status === 'replied'
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                    }`}>
                      {replyData.status === 'replied' ? 'Interested' : 'Not Interested'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-3 h-3 text-dark-600" />
                  <span className="text-[10px] text-dark-500">
                    {replyData.replyDate
                      ? new Date(replyData.replyDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
                      : '-'}
                  </span>
                  {replyData.sequenceName && (
                    <>
                      <span className="text-dark-600">·</span>
                      <span className="text-[10px] text-dark-500 truncate max-w-[150px]">{replyData.sequenceName}</span>
                    </>
                  )}
                </div>

                {(() => {
                  const text = replyData.replyBody || replyData.replySnippet || '';
                  if (!text) return null;
                  const isLong = text.length > 200;
                  return (
                    <div>
                      <p className={`text-sm text-dark-200 whitespace-pre-wrap leading-relaxed ${!replyExpanded && isLong ? 'line-clamp-4' : ''}`}>
                        {text}
                      </p>
                      {isLong && (
                        <button
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
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3">
            Contact Information
          </h3>
          <div className="space-y-1">
            <InfoRow
              icon={Mail}
              label="Email"
              value={lead.email}
              isLink={!!lead.email}
              href={`mailto:${lead.email}`}
            />
            <InfoRow icon={Phone} label="Phone" value={lead.phone} />
            <InfoRow
              icon={Linkedin}
              label="LinkedIn"
              value={lead.linkedinUrl ? 'View Profile' : null}
              isLink={!!lead.linkedinUrl}
              href={lead.linkedinUrl}
            />
          </div>
        </div>

        {/* Professional Information */}
        <div className="p-4 border-b border-dark-700">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3">
            Professional Details
          </h3>
          <div className="space-y-1">
            <InfoRow icon={Briefcase} label="Job Title" value={lead.title || lead.headline} />
            <InfoRow icon={Building2} label="Company" value={lead.company} />
            <InfoRow icon={MapPin} label="Location" value={lead.location} />
            {lead.industry && <InfoRow icon={Tag} label="Industry" value={lead.industry} />}
          </div>
        </div>

        {/* Contact Owner (Team Mode only) */}
        {teamMode && lead.ownerName && (
          <div className="p-4 border-b border-dark-700">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3">
              Contact Owner
            </h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
                  <span className="text-xs font-bold text-dark-300">
                    {lead.ownerName?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
                <span className="text-sm text-white">{lead.ownerName}</span>
              </div>
              {onAssign && (
                <button
                  onClick={() => onAssign(lead)}
                  className="text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors"
                >
                  Reassign
                </button>
              )}
            </div>
          </div>
        )}

        {/* Profile Type */}
        <div className="p-4 border-b border-dark-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
              Profile Type
            </h3>
            {savingProfileType && (
              <div className="flex items-center gap-1 text-xs text-dark-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Saving...
              </div>
            )}
          </div>
          <select
            value={profileType}
            onChange={(e) => handleProfileTypeChange(e.target.value)}
            className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white focus:outline-none focus:border-rivvra-500 appearance-none cursor-pointer"
          >
            <option value="">Select type...</option>
            <option value="candidate">Candidate</option>
            <option value="client">Client</option>
          </select>
        </div>

        {/* Outreach Status */}
        <div className="p-4 border-b border-dark-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
              Outreach Status
            </h3>
            {savingOutreachStatus && (
              <div className="flex items-center gap-1 text-xs text-dark-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Saving...
              </div>
            )}
          </div>
          <select
            value={outreachStatus}
            onChange={(e) => handleOutreachStatusChange(e.target.value)}
            className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white focus:outline-none focus:border-rivvra-500 appearance-none cursor-pointer"
          >
            <option value="not_contacted">Not Contacted</option>
            <option value="in_sequence">In Sequence</option>
            <option value="replied">Interested</option>
            <option value="replied_not_interested">Not Interested</option>
            <option value="no_response">No Response</option>
          </select>
          <p className="text-[10px] text-dark-500 mt-1.5">
            Override status when leads reply via LinkedIn DM or other channels
          </p>
        </div>

        {/* Tags */}
        <div className="p-4 border-b border-dark-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
              Tags
            </h3>
            {savingTags && (
              <div className="flex items-center gap-1 text-xs text-dark-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Saving...
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.length === 0 && (
              <span className="text-xs text-dark-500">No tags yet</span>
            )}
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20 rounded-full"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder="Add a tag..."
              className="flex-1 px-3 py-1.5 bg-dark-800 border border-dark-700 rounded-lg text-white text-xs placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
            />
            <button
              onClick={handleAddTag}
              disabled={!newTag.trim()}
              className="px-2 py-1.5 bg-dark-800 hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed text-dark-300 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Contact Metadata */}
        <div className="p-4 border-b border-dark-700">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-3">
            Contact Details
          </h3>
          <div className="space-y-1">
            <InfoRow icon={Globe} label="Source" value={lead.leadSource || 'Extension'} />
            <InfoRow
              icon={Calendar}
              label="Added On"
              value={lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '-'}
            />
            {lead.lists && lead.lists.length > 0 && (
              <div className="flex items-start gap-3 py-2">
                <Tag className="w-4 h-4 text-dark-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-dark-500 mb-1">Lists</p>
                  <div className="flex flex-wrap gap-1">
                    {lead.lists.map((list, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs bg-dark-800 text-dark-300 rounded-full"
                      >
                        {list}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes Section */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
              Notes ({notes.length})
            </h3>
            {savingNotes && (
              <div className="flex items-center gap-1 text-xs text-dark-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Saving...
              </div>
            )}
          </div>

          {/* Add Note Input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddNote()}
              placeholder="Add a note..."
              className="flex-1 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
            />
            <button
              onClick={handleAddNote}
              disabled={!newNote.trim() || addingNote}
              className="px-3 py-2 bg-rivvra-500 hover:bg-rivvra-400 disabled:opacity-50 disabled:cursor-not-allowed text-dark-950 font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Notes List */}
          {notes.length === 0 ? (
            <div className="text-center py-6">
              <StickyNote className="w-8 h-8 text-dark-600 mx-auto mb-2" />
              <p className="text-sm text-dark-500">No notes yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note, index) => (
                <div
                  key={index}
                  className="group p-3 bg-dark-800 rounded-lg border border-dark-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-white flex-1">{note.text}</p>
                    <button
                      onClick={() => handleDeleteNote(index)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-dark-700 rounded transition-all"
                    >
                      <Trash2 className="w-3 h-3 text-dark-500 hover:text-red-400" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <Clock className="w-3 h-3 text-dark-600" />
                    <span className="text-xs text-dark-500">{note.date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LeadDetailPanel;
