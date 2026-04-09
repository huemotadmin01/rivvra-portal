import { useState } from 'react';
import { Mail, Trash2, Edit3, Plus, Clock, ChevronLeft, ChevronRight, AlertCircle, ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import DOMPurify from 'dompurify';
import EmailStepEditor from './EmailStepEditor';
import { countPlaceholders, computeEmailDay } from './wizardConstants';
import { isBodyEmpty } from './RichBodyEditor';

function ComposeStep({ steps, name, description, onStepsChange, onNameChange, onDescChange, onNext, onBack, onSaveDraft, saving, sequenceId }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editBackup, setEditBackup] = useState(null);
  const [error, setError] = useState('');

  // Get only email steps with their original indices
  const emailSteps = steps.map((s, i) => ({ step: s, index: i })).filter(e => e.step.type === 'email');

  function addEmail() {
    const newSteps = [...steps];
    // Add a wait step before the new email (unless it's the first step)
    if (newSteps.length > 0) {
      newSteps.push({ type: 'wait', subject: '', body: '', days: 2 });
    }
    newSteps.push({ type: 'email', subject: '', body: '', days: 0 });
    onStepsChange(newSteps);
    // Auto-open editor for the new email
    setEditingIndex(newSteps.length - 1);
    setEditBackup(null);
  }

  function removeEmail(stepIndex) {
    if (emailSteps.length <= 1) return; // keep at least 1 email
    const newSteps = [...steps];
    // Also remove preceding wait step if it exists
    if (stepIndex > 0 && newSteps[stepIndex - 1]?.type === 'wait') {
      newSteps.splice(stepIndex - 1, 2);
    } else {
      newSteps.splice(stepIndex, 1);
      // If first email removed and next step is wait, remove that too
      if (stepIndex === 0 && newSteps[0]?.type === 'wait') {
        newSteps.splice(0, 1);
      }
    }
    onStepsChange(newSteps);
    if (editingIndex === stepIndex) {
      setEditingIndex(null);
      setEditBackup(null);
    }
  }

  function updateWaitDays(waitStepIndex, days) {
    const newSteps = [...steps];
    newSteps[waitStepIndex] = { ...newSteps[waitStepIndex], days: Math.max(1, parseInt(days) || 1) };
    onStepsChange(newSteps);
  }

  function startEditing(stepIndex) {
    setEditBackup({ ...steps[stepIndex] });
    setEditingIndex(stepIndex);
  }

  function saveEdit({ subject, body, _localAttachments }) {
    const newSteps = [...steps];
    newSteps[editingIndex] = { ...newSteps[editingIndex], subject, body };
    if (_localAttachments) {
      newSteps[editingIndex]._localAttachments = _localAttachments;
    }
    onStepsChange(newSteps);
    setEditingIndex(null);
    setEditBackup(null);
  }

  function cancelEdit() {
    if (editBackup) {
      const newSteps = [...steps];
      newSteps[editingIndex] = editBackup;
      onStepsChange(newSteps);
    }
    setEditingIndex(null);
    setEditBackup(null);
  }

  function validate() {
    if (!name?.trim()) {
      setError('Sequence name is required');
      return false;
    }
    if (emailSteps.length === 0) {
      setError('Add at least one email step');
      return false;
    }
    for (const { step, index } of emailSteps) {
      const num = emailSteps.findIndex(e => e.index === index) + 1;
      if (!step.subject?.trim()) {
        setError(`Email ${num}: Subject is required`);
        return false;
      }
      if (isBodyEmpty(step.body)) {
        setError(`Email ${num}: Content is required`);
        return false;
      }
    }
    setError('');
    return true;
  }

  function handleContinue() {
    if (validate()) onNext();
  }

  // Track email number for display
  let emailCounter = 0;

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 mr-4">
          <input
            type="text"
            value={name}
            onChange={(e) => { onNameChange(e.target.value); setError(''); }}
            placeholder="Sequence name"
            className="w-full text-xl font-bold bg-transparent text-white placeholder-dark-500 focus:outline-none border-b border-transparent focus:border-rivvra-500 transition-colors pb-1"
          />
        </div>
        <div className="flex items-center gap-3">
          {onSaveDraft && (
            <button
              onClick={() => { if (validate()) onSaveDraft(); }}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-dark-300 border border-dark-600 rounded-xl hover:border-dark-500 hover:text-white disabled:opacity-40 transition-colors"
            >
              Save as draft
            </button>
          )}
          <button
            onClick={handleContinue}
            className="flex items-center gap-2 px-5 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Email timeline */}
      <div className="space-y-0">
        {steps.map((step, i) => {
          // Wait step — inline divider
          if (step.type === 'wait') {
            return (
              <div key={`wait-${i}`} className="flex items-center justify-center gap-3 py-3">
                <div className="flex-1 h-px bg-dark-700" />
                <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-800/50 border border-dark-700 rounded-full">
                  <Clock className="w-3 h-3 text-dark-500" />
                  <span className="text-xs text-dark-400">Wait</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={step.days}
                    onChange={(e) => updateWaitDays(i, e.target.value)}
                    className="w-10 px-1.5 py-0.5 bg-dark-900 border border-dark-600 rounded text-center text-xs text-white focus:outline-none focus:border-rivvra-500"
                  />
                  <span className="text-xs text-dark-400">days - if no reply</span>
                </div>
                <div className="flex-1 h-px bg-dark-700" />
              </div>
            );
          }

          // Email step
          emailCounter++;
          const emailNum = emailCounter;
          const day = computeEmailDay(steps, i);
          const placeholderCount = countPlaceholders(step.subject) + countPlaceholders(step.body);
          const isEditing = editingIndex === i;

          if (isEditing) {
            return (
              <div key={`email-${i}`} className="py-2">
                <EmailStepEditor
                  step={step}
                  emailNumber={emailNum}
                  sequenceId={sequenceId}
                  stepIndex={i}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                />
              </div>
            );
          }

          return (
            <div key={`email-${i}`} className="py-2">
              <div className="bg-dark-800/40 border border-dark-700 rounded-2xl p-4 hover:border-dark-600 transition-colors group">
                {/* Card header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-dark-400">
                      <Mail className="w-3.5 h-3.5" />
                      <span className="font-semibold text-dark-300">Email {emailNum}</span>
                    </div>
                    <span className="text-xs text-dark-500">Day {day}</span>
                    {placeholderCount > 0 && (
                      <span className="text-xs text-rivvra-400">{placeholderCount} placeholders</span>
                    )}
                    {((step._localAttachments && step._localAttachments.length > 0) || step.attachmentCount > 0) && (
                      <span className="flex items-center gap-1 text-xs text-dark-400">
                        <Paperclip className="w-3 h-3" />{step._localAttachments?.length || step.attachmentCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEditing(i)}
                      className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {emailSteps.length > 1 && (
                      <button
                        onClick={() => removeEmail(i)}
                        className="p-1.5 text-dark-400 hover:text-red-400 hover:bg-dark-700 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Subject */}
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-xs text-dark-500 w-14 flex-shrink-0 pt-0.5">Subject</span>
                  <p className="text-sm text-white truncate">{step.subject || <span className="text-dark-500 italic">No subject</span>}</p>
                </div>

                {/* Body preview */}
                <div className="flex items-start gap-2">
                  <span className="text-xs text-dark-500 w-14 flex-shrink-0 pt-0.5">Content</span>
                  {step.body && !isBodyEmpty(step.body) ? (
                    <div
                      className="rich-body-preview text-xs text-dark-400 line-clamp-2 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(step.body) }}
                    />
                  ) : (
                    <span className="text-dark-500 italic text-xs">No content</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add email */}
      <div className="mt-4">
        <button
          onClick={addEmail}
          className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-dark-600 rounded-xl text-sm text-dark-400 hover:border-rivvra-500/40 hover:text-rivvra-400 transition-colors w-full justify-center"
        >
          <Plus className="w-4 h-4" />
          Add email
        </button>
      </div>
    </div>
  );
}

export default ComposeStep;
