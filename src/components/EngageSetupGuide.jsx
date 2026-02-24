import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, User, CheckCircle2, ChevronRight, Sparkles,
  ArrowRight, Building2, Briefcase, Loader2, X
} from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import ComboSelect from './ComboSelect';

const STEPS = [
  {
    id: 'gmail',
    title: 'Connect your Gmail',
    description: 'Link your Gmail account to send emails from your own address',
    icon: Mail,
    completedText: 'Gmail connected'
  },
  {
    id: 'profile',
    title: 'Complete your profile',
    description: 'Add your title and company name for email personalization',
    icon: User,
    completedText: 'Profile complete'
  },
  {
    id: 'ready',
    title: 'Start sending',
    description: 'Create your first sequence and start engaging leads',
    icon: Sparkles,
    completedText: 'Ready to go'
  }
];

function EngageSetupGuide({ setupStatus, onConnectGmail, onSetupComplete, onRefresh }) {
  const navigate = useNavigate();
  const { updateUser, user } = useAuth();
  const [senderTitle, setSenderTitle] = useState(setupStatus?.senderTitle || '');
  const [companyName, setCompanyName] = useState(setupStatus?.companyName || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [expandedStep, setExpandedStep] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const gmailDone = setupStatus?.gmailConnected;
  const profileDone = setupStatus?.profileComplete;
  const allDone = setupStatus?.allComplete;

  // Auto-expand first incomplete step
  useEffect(() => {
    if (!gmailDone) {
      setExpandedStep('gmail');
    } else if (!profileDone) {
      setExpandedStep('profile');
    } else {
      setExpandedStep(null);
    }
  }, [gmailDone, profileDone]);

  // Notify parent when all steps complete
  useEffect(() => {
    if (allDone && onSetupComplete) {
      onSetupComplete();
    }
  }, [allDone]);

  // Sync input values when setupStatus prop changes (e.g., after a refresh)
  useEffect(() => {
    if (setupStatus?.senderTitle && !senderTitle) setSenderTitle(setupStatus.senderTitle);
    if (setupStatus?.companyName && !companyName) setCompanyName(setupStatus.companyName);
  }, [setupStatus?.senderTitle, setupStatus?.companyName]);

  const progress = allDone ? 100 : (gmailDone && profileDone) ? 66 : (gmailDone || profileDone) ? 33 : 0;

  const handleSaveProfile = async () => {
    if (!senderTitle.trim() || !companyName.trim()) return;
    setSavingProfile(true);
    setSaveError('');
    try {
      // Single call: updateProfile handles senderTitle + companyName (upserts company + sets onboarding.companyName)
      await api.updateProfile({ senderTitle: senderTitle.trim(), companyName: companyName.trim() });
      setProfileSaved(true);
      // Update global auth context so Settings page reflects changes immediately
      updateUser({
        senderTitle: senderTitle.trim(),
        onboarding: { ...user?.onboarding, companyName: companyName.trim() }
      });
      // Await refresh so setupStatus.allComplete updates before we dismiss
      if (onRefresh) await onRefresh();
      // Brief delay so user sees the "Saved" checkmark, then auto-dismiss — ONLY if save succeeded
      setTimeout(() => setDismissed(true), 600);
    } catch (err) {
      setSaveError(err.message || 'Failed to save. Please try again.');
      setProfileSaved(false); // Reset saved state so user can retry
    } finally {
      setSavingProfile(false);
    }
  };

  function isStepDone(stepId) {
    if (stepId === 'gmail') return gmailDone;
    if (stepId === 'profile') return profileDone;
    if (stepId === 'ready') return allDone;
    return false;
  }

  function isStepActive(stepId) {
    if (stepId === 'gmail') return !gmailDone;
    if (stepId === 'profile') return gmailDone && !profileDone;
    if (stepId === 'ready') return gmailDone && profileDone;
    return false;
  }

  if (dismissed && !allDone) {
    // Show collapsed reminder bar
    return (
      <button
        onClick={() => setDismissed(false)}
        className="w-full flex items-center gap-3 px-4 py-3 mb-6 bg-amber-500/5 border border-amber-500/20 rounded-xl hover:bg-amber-500/10 transition-colors group"
      >
        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 text-left">
          <span className="text-sm text-white font-medium">Setup incomplete</span>
          <span className="text-sm text-dark-400 ml-2">Complete {2 - (gmailDone ? 1 : 0) - (profileDone ? 1 : 0)} more step{(2 - (gmailDone ? 1 : 0) - (profileDone ? 1 : 0)) !== 1 ? 's' : ''} to start sending sequences</span>
        </div>
        <ChevronRight className="w-4 h-4 text-dark-500 group-hover:text-white transition-colors" />
      </button>
    );
  }

  if (allDone) return null;

  return (
    <div className="mb-6 relative">
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1.5 text-dark-500 hover:text-white hover:bg-dark-700 rounded-lg transition-colors z-10"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Main card */}
      <div className="bg-gradient-to-br from-dark-800/80 to-dark-900/80 border border-dark-700/60 rounded-2xl backdrop-blur-sm">
        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rivvra-500/20 to-blue-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-rivvra-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Get ready to send sequences</h3>
              <p className="text-xs text-dark-400 mt-0.5">Complete these steps to start reaching out to leads</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 mb-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-dark-500 uppercase tracking-wider font-medium">Setup progress</span>
              <span className="text-[11px] text-dark-400 font-medium">{progress}%</span>
            </div>
            <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rivvra-500 to-rivvra-400 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="px-4 pb-4 space-y-2">
          {STEPS.map((step, index) => {
            const done = isStepDone(step.id);
            const active = isStepActive(step.id);
            const expanded = expandedStep === step.id;
            const Icon = step.icon;

            return (
              <div
                key={step.id}
                className={`rounded-xl border transition-all duration-300 ${
                  done
                    ? 'bg-rivvra-500/5 border-rivvra-500/20'
                    : active
                    ? 'bg-dark-800 border-dark-600 shadow-lg shadow-dark-950/20'
                    : 'bg-dark-850/50 border-dark-700/50 opacity-60'
                }`}
              >
                {/* Step header */}
                <button
                  onClick={() => !done && setExpandedStep(expanded ? null : step.id)}
                  disabled={!active && !done}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  {/* Step number / check */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    done
                      ? 'bg-rivvra-500 text-dark-950'
                      : active
                      ? 'bg-dark-700 text-white border border-dark-500'
                      : 'bg-dark-800 text-dark-500 border border-dark-700'
                  }`}>
                    {done ? (
                      <CheckCircle2 className="w-4.5 h-4.5" />
                    ) : (
                      <span className="text-xs font-bold">{index + 1}</span>
                    )}
                  </div>

                  {/* Step info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${done ? 'text-rivvra-400' : active ? 'text-white' : 'text-dark-500'}`}>
                        {done ? step.completedText : step.title}
                      </span>
                      {done && step.id === 'gmail' && setupStatus?.gmailEmail && (
                        <span className="text-xs text-dark-400 truncate">{setupStatus.gmailEmail}</span>
                      )}
                    </div>
                    {!done && (
                      <p className="text-xs text-dark-500 mt-0.5">{step.description}</p>
                    )}
                  </div>

                  {/* Expand/action indicator */}
                  {active && !done && (
                    <ChevronRight className={`w-4 h-4 text-dark-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  )}
                  {done && <Icon className="w-4 h-4 text-rivvra-400/60" />}
                </button>

                {/* Expanded content */}
                {expanded && active && !done && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="ml-11">
                      {step.id === 'gmail' && (
                        <button
                          onClick={onConnectGmail}
                          className="flex items-center gap-2 px-4 py-2.5 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-rivvra-400 transition-colors"
                        >
                          <Mail className="w-4 h-4" />
                          Connect Gmail
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {step.id === 'profile' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-dark-400 mb-1.5">
                              <Briefcase className="w-3 h-3 inline mr-1" />
                              Your title / designation
                            </label>
                            <input
                              type="text"
                              value={senderTitle}
                              onChange={(e) => setSenderTitle(e.target.value)}
                              placeholder="e.g. Sales Manager"
                              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-dark-400 mb-1.5">
                              <Building2 className="w-3 h-3 inline mr-1" />
                              Company name
                            </label>
                            <ComboSelect
                              value=""
                              displayValue={companyName}
                              options={[]}
                              onChange={(id, name) => setCompanyName(name)}
                              placeholder="Type your company name"
                            />
                          </div>
                          <button
                            onClick={handleSaveProfile}
                            disabled={!senderTitle.trim() || !companyName.trim() || savingProfile}
                            className="flex items-center gap-2 px-4 py-2.5 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {savingProfile ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                              </>
                            ) : profileSaved ? (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                Saved
                              </>
                            ) : (
                              <>
                                Save profile
                                <ArrowRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                          {saveError && (
                            <p className="text-xs text-red-400 mt-1">{saveError}</p>
                          )}
                        </div>
                      )}

                      {step.id === 'ready' && (
                        <p className="text-sm text-dark-400">
                          All set! You can now create and activate email sequences.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default EngageSetupGuide;
