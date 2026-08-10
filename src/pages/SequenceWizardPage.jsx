import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import WizardStepper from '../components/wizard/WizardStepper';
import BuilderSelection from '../components/wizard/BuilderSelection';
import ComposeStep from '../components/wizard/ComposeStep';
import ScheduleStep from '../components/wizard/ScheduleStep';
import ReviewStep from '../components/wizard/ReviewStep';
import {
  DEFAULT_RULES,
  DEFAULT_ENTERING_CRITERIA,
  DEFAULT_SCHEDULE,
} from '../components/wizard/wizardConstants';
import { useToast } from '../context/ToastContext';
import { usePlatform } from '../context/PlatformContext';
import api from '../utils/api';
import { Loader2 } from 'lucide-react';

const INITIAL_SCRATCH_STEPS = [
  { type: 'email', subject: '', body: '', days: 0 },
];

function SequenceWizardPage() {
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

  // Loading state for edit mode
  if (loadingSequence) {
    return (
      <>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 text-rivvra-500 animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        {/* Stepper — shown for all steps except selection */}
        {wizardStep !== 'selection' && (
          <WizardStepper
            currentStep={wizardStep}
            completedSteps={completedSteps}
            sequenceName={name}
            onStepClick={goToStep}
          />
        )}

        {/* Step content */}
        {wizardStep === 'selection' && (
          <BuilderSelection
            onSelectTemplate={handleSelectTemplate}
            onSelectScratch={handleSelectScratch}
          />
        )}

        {wizardStep === 'compose' && (
          <ComposeStep
            steps={steps}
            name={name}
            description={description}
            onStepsChange={setSteps}
            onNameChange={setName}
            onDescChange={setDescription}
            onNext={() => completeAndNext('compose', 'schedule')}
            onBack={() => isEditMode ? navigate(orgPath('/outreach/engage')) : setWizardStep('selection')}
            onSaveDraft={handleSaveDraft}
            saving={saving}
            sequenceId={sequenceId}
          />
        )}

        {wizardStep === 'schedule' && (
          <ScheduleStep
            schedule={schedule}
            onScheduleChange={setSchedule}
            onNext={() => completeAndNext('schedule', 'review')}
            onBack={() => setWizardStep('compose')}
          />
        )}

        {wizardStep === 'review' && (
          <ReviewStep
            wizardData={{ name, description, steps, automationRules, enteringCriteria, schedule }}
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
    </>
  );
}

export default SequenceWizardPage;
