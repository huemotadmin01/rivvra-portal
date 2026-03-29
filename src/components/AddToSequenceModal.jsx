import { useState, useEffect } from 'react';
import { X, Send, Mail, Clock, Check, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../utils/api';

const STATUS_COLORS = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  draft: 'bg-dark-700 text-dark-300 border-dark-600',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

function AddToSequenceModal({ isOpen, onClose, onEnrolled, leadIds = [], leadNames = [], preSelectedSequenceId = null }) {
  const [sequences, setSequences] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [result, setResult] = useState(null);
  // For inline "Add contacts" from detail page - show lead picker instead
  const [showLeadPicker, setShowLeadPicker] = useState(!!preSelectedSequenceId);
  const [leads, setLeads] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());
  const [leadsLoading, setLeadsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(preSelectedSequenceId || null);
      setResult(null);
      setLoading(true);

      if (preSelectedSequenceId) {
        // If pre-selected, load leads for picking
        setLoading(false);
        loadLeads();
      } else {
        api.getSequences()
          .then((response) => {
            if (response.success) {
              setSequences(
                (response.sequences || []).filter(
                  (s) => s.status === 'active' || s.status === 'draft'
                )
              );
            }
          })
          .catch((err) => console.error('Failed to load sequences:', err))
          .finally(() => setLoading(false));
      }
    }
  }, [isOpen]);

  async function loadLeads(search = '') {
    setLeadsLoading(true);
    try {
      const res = search
        ? await api.searchAllLeads({ search, limit: 50 })
        : await api.getLeads();
      if (res.success) {
        setLeads(res.leads || []);
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLeadsLoading(false);
    }
  }

  function toggleLeadSelection(leadId) {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  if (!isOpen) return null;

  const handleEnroll = async () => {
    const idsToEnroll = preSelectedSequenceId ? Array.from(selectedLeadIds) : leadIds;
    const seqId = preSelectedSequenceId || selectedId;

    if (!seqId || idsToEnroll.length === 0) return;

    setEnrolling(true);
    setResult(null);
    try {
      const response = await api.enrollInSequence(seqId, idsToEnroll);
      setResult({
        success: true,
        enrolled: response.enrolled,
        skipped: response.skipped,
        errors: response.errors,
      });
      // Notify parent immediately so it can refresh data
      if (response.enrolled > 0 && onEnrolled) {
        onEnrolled({ enrolled: response.enrolled, leadIds: idsToEnroll, sequenceId: seqId });
      }
      // Auto-close after a brief delay so user sees the result
      if (response.enrolled > 0) {
        setTimeout(() => onClose?.(), 1500);
      }
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setEnrolling(false);
    }
  };

  const selectedSequence = sequences.find((s) => s._id === selectedId);
  const emailStepCount = selectedSequence
    ? selectedSequence.steps.filter((s) => s.type === 'email').length
    : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="p-6 pb-4">
          <h2 className="text-xl font-bold text-white">{preSelectedSequenceId ? 'Add Contacts to Sequence' : 'Add to Sequence'}</h2>
          <p className="text-dark-400 text-sm mt-1">
            {preSelectedSequenceId
              ? 'Select contacts to enroll into this sequence'
              : `Enroll ${leadIds.length} contact${leadIds.length !== 1 ? 's' : ''} into an email sequence`
            }
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          {/* Result message */}
          {result && (
            <div
              className={`mb-4 px-4 py-3 rounded-xl text-sm ${
                result.success && result.enrolled > 0
                  ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                  : result.success && result.enrolled === 0
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {result.success ? (
                <div>
                  <p className="font-medium">
                    {result.enrolled > 0
                      ? `${result.enrolled} contact${result.enrolled !== 1 ? 's' : ''} enrolled!`
                      : 'No contacts enrolled'
                    }
                  </p>
                  {result.skipped > 0 && (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs opacity-80">{result.skipped} skipped:</p>
                      {result.errors?.some((e) => e.reason === 'no_email') && (
                        <p className="text-xs opacity-70 flex items-center gap-1 ml-2">
                          <AlertCircle className="w-3 h-3" />
                          {result.errors.filter(e => e.reason === 'no_email').length} without valid email
                        </p>
                      )}
                      {result.errors?.some((e) => e.reason === 'already_enrolled') && (
                        <p className="text-xs opacity-70 flex items-center gap-1 ml-2">
                          <AlertCircle className="w-3 h-3" />
                          {result.errors.filter(e => e.reason === 'already_enrolled').length} already enrolled
                        </p>
                      )}
                      {result.errors?.some((e) => e.reason === 'suppressed') && (
                        <p className="text-xs opacity-70 flex items-center gap-1 ml-2">
                          <AlertCircle className="w-3 h-3" />
                          {result.errors.filter(e => e.reason === 'suppressed').length} on suppression list
                        </p>
                      )}
                      {result.errors?.some((e) => e.reason?.startsWith('criteria_')) && (
                        <p className="text-xs opacity-70 flex items-center gap-1 ml-2">
                          <AlertCircle className="w-3 h-3" />
                          {result.errors.filter(e => e.reason?.startsWith('criteria_')).length} didn't meet entering criteria
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p>{result.error}</p>
              )}
            </div>
          )}

          {preSelectedSequenceId ? (
            /* Lead picker mode */
            <div>
              <div className="mb-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={leadSearch}
                    onChange={(e) => { setLeadSearch(e.target.value); loadLeads(e.target.value); }}
                    className="w-full pl-8 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-rivvra-500"
                  />
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-500" />
                </div>
              </div>
              {leadsLoading ? (
                <div className="py-8 text-center">
                  <div className="w-6 h-6 border-2 border-rivvra-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                </div>
              ) : leads.length === 0 ? (
                <div className="py-6 text-center text-dark-500 text-sm">
                  {leadSearch ? 'No contacts found' : 'Type to search contacts'}
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {leads.map(lead => {
                    const isSelected = selectedLeadIds.has(lead._id);
                    return (
                      <button
                        key={lead._id}
                        onClick={() => toggleLeadSelection(lead._id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          isSelected ? 'bg-rivvra-500/10 border border-rivvra-500/30' : 'hover:bg-dark-800 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="w-3.5 h-3.5 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white truncate block">{lead.firstName} {lead.lastName}</span>
                          <span className="text-xs text-dark-500 truncate block">{lead.email || 'No email'} {lead.company ? `· ${lead.company}` : ''}</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-rivvra-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedLeadIds.size > 0 && (
                <p className="text-xs text-rivvra-400 mt-2">{selectedLeadIds.size} contact{selectedLeadIds.size !== 1 ? 's' : ''} selected</p>
              )}
            </div>
          ) : loading ? (
            <div className="py-8 text-center">
              <div className="w-6 h-6 border-2 border-rivvra-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-dark-500 text-sm">Loading sequences...</p>
            </div>
          ) : sequences.length === 0 ? (
            <div className="py-8 text-center">
              <Send className="w-10 h-10 text-dark-600 mx-auto mb-3" />
              <p className="text-dark-400 text-sm font-medium">No sequences yet</p>
              <p className="text-dark-500 text-xs mt-1">
                Create a sequence first from the Engage page
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-dark-500 font-medium uppercase tracking-wider mb-2">
                Select a sequence
              </p>
              {sequences.map((seq) => {
                const isSelected = selectedId === seq._id;
                const emailCount = seq.steps.filter(
                  (s) => s.type === 'email'
                ).length;
                const waitCount = seq.steps.filter(
                  (s) => s.type === 'wait'
                ).length;

                return (
                  <button
                    key={seq._id}
                    onClick={() => setSelectedId(seq._id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                      isSelected
                        ? 'bg-rivvra-500/10 border border-rivvra-500/30'
                        : 'hover:bg-dark-800 border border-transparent'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rivvra-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Send className="w-4 h-4 text-rivvra-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium truncate ${
                            isSelected ? 'text-white' : 'text-dark-200'
                          }`}
                        >
                          {seq.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                            STATUS_COLORS[seq.status]
                          }`}
                        >
                          {seq.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-dark-500">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {emailCount} email{emailCount !== 1 ? 's' : ''}
                        </span>
                        {waitCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {waitCount} wait{waitCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span>{seq.stats?.enrolled || 0} enrolled</span>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-rivvra-400 flex-shrink-0 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 flex items-center justify-end gap-3 border-t border-dark-800 mt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-dark-300 hover:text-white text-sm font-medium transition-colors"
          >
            {result?.success ? 'Done' : 'Cancel'}
          </button>
          {!result?.success && (
            <button
              onClick={handleEnroll}
              disabled={preSelectedSequenceId ? (selectedLeadIds.size === 0 || enrolling) : (!selectedId || enrolling || leadIds.length === 0)}
              className="px-5 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {enrolling ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Enrolling...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enroll {preSelectedSequenceId ? selectedLeadIds.size : leadIds.length} Contact{(preSelectedSequenceId ? selectedLeadIds.size : leadIds.length) !== 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AddToSequenceModal;
