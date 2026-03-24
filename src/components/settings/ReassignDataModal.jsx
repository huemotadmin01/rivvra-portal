/**
 * ReassignDataModal — Shown when admin removes a member who owns data.
 *
 * Fetches the member's data summary (leads, sequences, enrollments, lists)
 * and lets admin either reassign to another member or remove without reassigning.
 */
import { useState, useEffect } from 'react';
import {
  UserX, Loader2, AlertTriangle, Users, Mail, FileText,
  List, ChevronDown, ArrowRight, X,
} from 'lucide-react';
import api from '../../utils/api';

export default function ReassignDataModal({ member, members, orgSlug, onClose, onRemoved }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const [removing, setRemoving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const memberName = member.name || member.email;
  const selectedMember = members.find(m => m.userId?.toString() === reassignTo);

  // Fetch data summary on mount
  useEffect(() => {
    async function fetchSummary() {
      try {
        setLoading(true);
        const res = await api.getMemberDataSummary(orgSlug, member.userId);
        if (res.success) {
          setSummary(res.summary);
        } else {
          setError(res.error || 'Failed to load data summary');
        }
      } catch (err) {
        setError(err.message || 'Failed to load data summary');
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, [orgSlug, member.userId]);

  const hasData = summary && (
    summary.leads + summary.sequences + summary.enrollments + summary.lists + summary.suppressions > 0
  );

  async function handleRemove(withReassign) {
    setRemoving(true);
    setError('');
    try {
      const res = await api.removeOrgMember(
        orgSlug,
        member.userId,
        withReassign ? reassignTo : null
      );
      if (res.success) {
        onRemoved(member.userId);
      } else {
        setError(res.error || 'Failed to remove member');
        setRemoving(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to remove member');
      setRemoving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/10">
              <UserX className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Remove Member</h3>
              <p className="text-dark-400 text-sm truncate max-w-[250px]">{memberName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-6 h-6 text-rivvra-400 animate-spin" />
              <p className="text-dark-400 text-sm">Loading data summary...</p>
            </div>
          ) : error && !summary ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={onClose} className="px-4 py-2 text-sm text-dark-400 hover:text-white">Close</button>
            </div>
          ) : !hasData ? (
            /* No data — simple confirm */
            <div className="space-y-4">
              <p className="text-dark-300 text-sm">
                This user has no owned data (leads, sequences, or lists). They will be removed from the organization and lose access.
              </p>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => handleRemove(false)}
                  disabled={removing}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {removing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Remove
                </button>
              </div>
            </div>
          ) : (
            /* Has data — show summary + reassign option */
            <div className="space-y-4">
              {/* Data summary */}
              <div>
                <p className="text-dark-300 text-sm mb-3">This member owns the following data:</p>
                <div className="space-y-2">
                  {summary.leads > 0 && (
                    <div className="flex items-center gap-3 px-3 py-2 bg-dark-800/50 rounded-lg border border-dark-700/30">
                      <Users className="w-4 h-4 text-rivvra-400 shrink-0" />
                      <span className="text-dark-200 text-sm">{summary.leads} lead{summary.leads !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {summary.sequences > 0 && (
                    <div className="flex items-center gap-3 px-3 py-2 bg-dark-800/50 rounded-lg border border-dark-700/30">
                      <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="text-dark-200 text-sm">
                        {summary.sequences} sequence{summary.sequences !== 1 ? 's' : ''}
                        {summary.activeEnrollments > 0 && (
                          <span className="text-amber-400 ml-1">
                            ({summary.activeEnrollments} active enrollment{summary.activeEnrollments !== 1 ? 's' : ''})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {summary.enrollments > 0 && summary.sequences === 0 && (
                    <div className="flex items-center gap-3 px-3 py-2 bg-dark-800/50 rounded-lg border border-dark-700/30">
                      <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="text-dark-200 text-sm">{summary.enrollments} enrollment{summary.enrollments !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {summary.lists > 0 && (
                    <div className="flex items-center gap-3 px-3 py-2 bg-dark-800/50 rounded-lg border border-dark-700/30">
                      <List className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-dark-200 text-sm">{summary.lists} list{summary.lists !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Reassign dropdown */}
              <div>
                <label className="text-dark-400 text-xs font-medium uppercase tracking-wider mb-1.5 block">
                  Reassign data to
                </label>
                <div className="relative">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-sm hover:border-dark-600 transition-colors"
                  >
                    <span className={selectedMember ? 'text-white' : 'text-dark-500'}>
                      {selectedMember ? (selectedMember.name || selectedMember.email) : 'Select a team member...'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                      {members.length === 0 ? (
                        <div className="px-3 py-4 text-dark-500 text-sm text-center">No other active members</div>
                      ) : (
                        members.map(m => (
                          <button
                            key={m.userId}
                            onClick={() => {
                              setReassignTo(m.userId?.toString());
                              setDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-dark-700/50 transition-colors text-left ${
                              m.userId?.toString() === reassignTo ? 'bg-dark-700/30' : ''
                            }`}
                          >
                            <div className="w-7 h-7 rounded-lg bg-dark-700 flex items-center justify-center text-xs text-dark-300 font-medium shrink-0">
                              {(m.name || m.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-white truncate">{m.name || m.email}</div>
                              {m.name && <div className="text-dark-500 text-xs truncate">{m.email}</div>}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Warning note */}
              {summary.activeEnrollments > 0 && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-300/80 text-xs leading-relaxed">
                    Active sequence enrollments will be paused. The new owner can resume them.
                  </p>
                </div>
              )}

              {error && <p className="text-red-400 text-sm">{error}</p>}

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => handleRemove(true)}
                  disabled={removing || !reassignTo}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-rivvra-500 text-white hover:bg-rivvra-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Remove & Reassign Data
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    disabled={removing}
                    className="flex-1 px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRemove(false)}
                    disabled={removing}
                    className="px-4 py-2 rounded-xl text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    Remove Without Reassigning
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
