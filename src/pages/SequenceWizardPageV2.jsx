// ============================================================================
// SequenceWizardPageV2.jsx — outreach sequence wizard, on ds
// ============================================================================
//
// Routes: /org/:slug/outreach/engage/new-sequence
//         /org/:slug/outreach/engage/edit-sequence/:sequenceId
// Both behind PageSwitch.
//
// This page is a shell — it owns wizard state and mounts the step components.
// Migrating it alone would have changed one className, which is why it was
// deferred in phase 40 until the subsystem behind it was done. It now mounts
// the v2 components; the legacy page still mounts the legacy ones, so
// PageSwitch selects between two complete trees and reverting is one line.
//
// ── The activation path is the reason everything here is spliced ────────────
// `handleActivate` tracks `activated` and `activateErr` SEPARATELY rather than
// assuming success. Legacy's own comment records why: swallowing the
// `resumeSequence` error and always toasting "activated" told the user their
// sequence was live when it was still a draft — e.g. when Gmail was
// disconnected server-side. The failure toast deliberately says "Saved as
// draft — activation failed", because that is what actually happened.
//
// Also carried across unchanged:
//   • `uploadPendingAttachments`, which runs AFTER creation and walks
//     `steps[i]._localAttachments`. Attachments composed before the sequence
//     existed have no sequence to attach to, so they are held locally and
//     flushed here. Its per-file try/catch is deliberate: one failed upload
//     must not abort the rest or fail the whole create.
//   • `buildPayload`'s step normalisation — every step is rewritten to exactly
//     `{type, subject, body, days}`, which is what strips the transient
//     `_localAttachments` before it reaches the API.
//   • The edit-mode loader's per-field `|| DEFAULT_*` fallbacks, so a sequence
//     saved before a field existed still opens.
//   • `wizardStep` starting at 'compose' in edit mode and 'selection' when
//     creating — you do not re-pick a builder for a sequence that exists.
//
// ⚠️ Sequence activation is on the never-trigger list. Not exercised.
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import WizardStepperV2 from '../components/wizard/v2/WizardStepperV2';
import BuilderSelectionV2 from '../components/wizard/v2/BuilderSelectionV2';
import ComposeStepV2 from '../components/wizard/v2/ComposeStepV2';
import ScheduleStepV2 from '../components/wizard/v2/ScheduleStepV2';
import ReviewStepV2 from '../components/wizard/v2/ReviewStepV2';
import {
  DEFAULT_RULES,
  DEFAULT_ENTERING_CRITERIA,
  DEFAULT_SCHEDULE,
} from '../components/wizard/wizardConstants';
import { useToast } from '../context/ToastContext';
import { usePlatform } from '../context/PlatformContext';
import api from '../utils/api';
import { Spinner } from '../components/ds';

const INITIAL_SCRATCH_STEPS = [
  { type: 'email', subject: '', body: '', days: 0 },
];
function SequenceWizardPageV2() {
  const navigate = useNavigate();
  const { sequenceId } = useParams();
  const { showToast } = useToast();
  const { orgPath } = usePlatform();
  const isEditMode = !!sequenceId;

  // Wizard navigation
  const [wizardStep, setWizardStep] = useState(isEditMode ? 'compose' : 'selection');
  const [completedSteps, setCompletedSteps] = useState([]);

  // Wizard data
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState([]);
  const [automationRules, setAutomationRules] = useState({ ...DEFAULT_RULES });
  const [enteringCriteria, setEnteringCriteria] = useState({ ...DEFAULT_ENTERING_CRITERIA });
  const [schedule, setSchedule] = useState({ ...DEFAULT_SCHEDULE });

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingSequence, setLoadingSequence] = useState(isEditMode);

  // Load existing sequence for edit mode
  useEffect(() => {
    if (!sequenceId) return;
    (async () => {
      try {
        const res = await api.getSequence(sequenceId);
        if (res.success && res.sequence) {
          const seq = res.sequence;
          setName(seq.name || '');
          setDescription(seq.description || '');
          setSteps(seq.steps || []);
          setAutomationRules(seq.automationRules || { ...DEFAULT_RULES });
          setEnteringCriteria(seq.enteringCriteria || { ...DEFAULT_ENTERING_CRITERIA });
          setSchedule(seq.schedule || { ...DEFAULT_SCHEDULE });
        }
      } catch (err) {
        console.error('Failed to load sequence:', err);
        showToast('Failed to load sequence', 'error');
        navigate(orgPath('/outreach/engage'));
      } finally {
        setLoadingSequence(false);
      }
    })();
  }, [sequenceId]);

  // Handle builder selection
  function handleSelectTemplate(templateSteps) {
    setSteps(templateSteps.map(s => ({ ...s })));
    setName('');
    setWizardStep('compose');
  }

  function handleSelectScratch() {
    setSteps([...INITIAL_SCRATCH_STEPS]);
    setName('');
    setWizardStep('compose');
  }

  // Step navigation
  function goToStep(step) {
    setWizardStep(step);
  }

  function completeAndNext(from, to) {
    setCompletedSteps(prev => prev.includes(from) ? prev : [...prev, from]);
    setWizardStep(to);
  }

  // Build payload
  function buildPayload() {
    return {
      name: name.trim(),
      description: description.trim(),
      steps: steps.map(s => ({
        type: s.type,
        subject: s.subject || '',
        body: s.body || '',
        days: s.days || 0,
      })),
      automationRules,
      enteringCriteria,
      schedule,
    };
  }

  // Upload any pending local attachments after sequence creation
  async function uploadPendingAttachments(newSequenceId) {
    for (let i = 0; i < steps.length; i++) {
      const localAtts = steps[i]._localAttachments;
      if (localAtts && localAtts.length > 0) {
        for (const att of localAtts) {
          if (att.file) {
            try {
              await api.uploadAttachment(newSequenceId, i, att.file);
            } catch (err) {
              console.error('Failed to upload attachment:', err);
            }
          }
        }
      }
    }
  }

  // Save as draft (create without activating)
  async function handleSaveDraft() {
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      if (isEditMode) {
        await api.updateSequence(sequenceId, payload);
        showToast('Sequence updated');
      } else {
        const res = await api.createSequence(payload);
        if (res.success && res.sequence?._id) {
          await uploadPendingAttachments(res.sequence._id);
        }
        showToast('Sequence saved as draft');
      }
      navigate(orgPath('/outreach/engage'));
    } catch (err) {
      setError(err.message || 'Failed to save sequence');
    } finally {
      setSaving(false);
    }
  }

  // Activate (create + activate)
  async function handleActivate() {
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      // Track whether activation actually succeeded — swallowing the
      // resumeSequence error and always toasting "activated" told the user
      // the sequence was live when it was still a draft (e.g. Gmail
      // disconnected server-side).
      let activated = false;
      let activateErr = null;
      if (isEditMode) {
        await api.updateSequence(sequenceId, payload);
        try { await api.resumeSequence(sequenceId); activated = true; }
        catch (e) { activateErr = e; }
      } else {
        const res = await api.createSequence(payload);
        if (res.success && res.sequence?._id) {
          await uploadPendingAttachments(res.sequence._id);
          try { await api.resumeSequence(res.sequence._id); activated = true; }
          catch (e) { activateErr = e; }
        }
      }
      if (activated) {
        showToast(isEditMode ? 'Sequence updated and activated' : 'Sequence created and activated');
      } else {
        showToast(activateErr?.message || 'Saved as draft — activation failed. Activate it from the Engage page.', 'error');
      }
      navigate(orgPath('/outreach/engage'));
    } catch (err) {
      setError(err.message || 'Failed to save sequence');
    } finally {
      setSaving(false);
    }
  }

  if (loadingSequence) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 32px)', maxWidth: 1024, margin: '0 auto' }}>
      {/* The stepper is hidden on the builder-selection screen — there is no
          sequence yet to show progress against. */}
      {wizardStep !== 'selection' && (
        <WizardStepperV2
          currentStep={wizardStep}
          completedSteps={completedSteps}
          sequenceName={name}
          onStepClick={goToStep}
        />
      )}

      {wizardStep === 'selection' && (
        <BuilderSelectionV2
          onSelectTemplate={handleSelectTemplate}
          onSelectScratch={handleSelectScratch}
        />
      )}

      {wizardStep === 'compose' && (
        <ComposeStepV2
          steps={steps}
          name={name}
          description={description}
          onStepsChange={setSteps}
          onNameChange={setName}
          onDescChange={setDescription}
          onNext={() => completeAndNext('compose', 'schedule')}
          onBack={() => setWizardStep('selection')}
          onSaveDraft={handleSaveDraft}
          saving={saving}
          sequenceId={sequenceId}
        />
      )}

      {wizardStep === 'schedule' && (
        <ScheduleStepV2
          schedule={schedule}
          onScheduleChange={setSchedule}
          onNext={() => completeAndNext('schedule', 'review')}
          onBack={() => setWizardStep('compose')}
        />
      )}

      {wizardStep === 'review' && (
        <ReviewStepV2
          wizardData={{ steps, name, schedule, automationRules, enteringCriteria }}
          isEditMode={isEditMode}
          saving={saving}
          error={error}
          onActivate={handleActivate}
          onSaveDraft={handleSaveDraft}
          onBack={() => setWizardStep('schedule')}
          onGoToStep={goToStep}
        />
      )}
    </div>
  );
}

export default SequenceWizardPageV2;
