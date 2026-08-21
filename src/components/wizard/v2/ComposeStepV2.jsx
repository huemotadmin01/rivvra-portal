import { useState } from 'react';
import { Mail, Trash2, Edit3, Plus, Clock, ChevronLeft, ChevronRight, Paperclip } from 'lucide-react';
import DOMPurify from 'dompurify';
import EmailStepEditorV2 from './EmailStepEditorV2';
import { countPlaceholders, computeEmailDay } from '../wizardConstants';
import { isBodyEmpty } from '../RichBodyEditor';
import { Panel, Button, Chip, Callout, Input } from '../../ds';

const microStyle = { font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

/**
 * The sequence timeline: alternating email and wait steps.
 *
 * All of the step-array surgery is spliced verbatim, and it is fiddlier than it
 * looks because emails and waits are interleaved in ONE array:
 *
 *   • `addEmail` pushes a 2-day wait BEFORE the new email unless the sequence
 *     is empty — so steps never end up back-to-back with no gap.
 *   • `removeEmail` removes the PRECEDING wait too, and has a separate branch
 *     for deleting the first email (where the wait follows instead of
 *     precedes). Get this wrong and you strand an orphan wait, which shifts
 *     every later email's computed day.
 *   • It refuses to remove the last remaining email.
 *   • `updateWaitDays` clamps with `Math.max(1, parseInt(days) || 1)` — a
 *     cleared field becomes 1 day, never 0 or NaN.
 *   • `cancelEdit` restores from `editBackup`, so abandoning an edit puts the
 *     original subject/body back rather than leaving half-typed content.
 *
 * `validate` is spliced too: it numbers errors by the email's position among
 * EMAIL steps, not its index in the mixed array, so "Email 2" means the second
 * email the user sees.
 *
 * The body preview keeps `DOMPurify.sanitize` and the `rich-body-preview`
 * class — it renders composed email HTML, so it is a WYSIWYG surface like the
 * editor itself.
 */
function ComposeStepV2({ steps, name, description, onStepsChange, onNameChange, onDescChange, onNext, onBack, onSaveDraft, saving, sequenceId }) {
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Input
            type="text"
            value={name}
            onChange={(e) => { onNameChange(e.target.value); setError(''); }}
            placeholder="Sequence name"
            aria-label="Sequence name"
            style={{ font: "700 19px/1.3 'Inter', system-ui, sans-serif", height: 42 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onSaveDraft && (
            <Button variant="secondary" onClick={() => { if (validate()) onSaveDraft(); }} disabled={saving}>
              Save as draft
            </Button>
          )}
          <Button onClick={handleContinue} iconRight={<ChevronRight size={16} />}>Continue</Button>
        </div>
      </div>

      {error && <div style={{ marginBottom: 16 }}><Callout tone="danger">{error}</Callout></div>}

      {/* Timeline */}
      <div style={{ display: 'grid', gap: 10 }}>
        {steps.map((step, i) => {
          if (step.type === 'wait') {
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8 }}>
                <Clock size={14} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                <span style={microStyle}>Wait</span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={step.days}
                  onChange={(e) => updateWaitDays(i, e.target.value)}
                  aria-label={`Wait days before the next email`}
                  style={{ width: 68, height: 30, fontSize: 12.5 }}
                />
                <span style={microStyle}>day{step.days === 1 ? '' : 's'}</span>
              </div>
            );
          }

          emailCounter++;
          const emailNum = emailCounter;
          const day = computeEmailDay(steps, i);
          const placeholderCount = countPlaceholders(step.subject) + countPlaceholders(step.body);
          const isEditing = editingIndex === i;

          if (isEditing) {
            return (
              <div key={i}>
                <EmailStepEditorV2
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
            <Panel key={i}>
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: 'var(--r-1, 8px)', flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--brand-soft)', color: 'var(--brand-ink)',
                  }}>
                    <Mail size={13} />
                  </span>
                  <span style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                    Email {emailNum}
                  </span>
                  <Chip>Day {day}</Chip>
                  {/* "placeholders", legacy's word — not "variables". */}
                  {placeholderCount > 0 && <Chip tone="info">{placeholderCount} placeholders</Chip>}
                  {((step._localAttachments && step._localAttachments.length > 0) || step.attachmentCount > 0) && (
                    <Chip>
                      <Paperclip size={10} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                      {step._localAttachments?.length || step.attachmentCount}
                    </Chip>
                  )}
                </div>
                {/* Legacy hid these behind `opacity-0 group-hover:opacity-100`.
                    Kept VISIBLE deliberately: a hover-only control is dead on
                    touch, which is the platform-wide finding from the mobile
                    pass. This is the one intentional behaviour change here. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <Button variant="ghost" size="sm" onClick={() => startEditing(i)}
                    title="Edit" aria-label={`Edit email ${emailNum}`} iconLeft={<Edit3 size={14} />} />
                  {/* The last remaining email cannot be removed. */}
                  {emailSteps.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeEmail(i)}
                      title="Delete" aria-label={`Delete email ${emailNum}`}
                      style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
                  )}
                </div>
              </div>

              {/* Subject */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                <span style={{ ...microStyle, width: 56, flexShrink: 0, paddingTop: 2 }}>Subject</span>
                <p style={{ font: "450 13px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {step.subject || <span style={{ ...microStyle, fontStyle: 'italic' }}>No subject</span>}
                </p>
              </div>

              {/* Body preview — composed email HTML, so it keeps the sanitize
                  and the rich-body-preview typography. */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ ...microStyle, width: 56, flexShrink: 0, paddingTop: 2 }}>Content</span>
                {step.body && !isBodyEmpty(step.body) ? (
                  <div
                    className="rich-body-preview line-clamp-2"
                    style={{ ...microStyle, color: 'var(--fg-3)', lineHeight: 1.55 }}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(step.body) }}
                  />
                ) : (
                  <span style={{ ...microStyle, fontStyle: 'italic' }}>No content</span>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      {/* Add email */}
      <div style={{ marginTop: 16 }}>
        <Button variant="secondary" block onClick={addEmail} iconLeft={<Plus size={16} />}>
          Add email
        </Button>
      </div>
    </div>
  );
}

export default ComposeStepV2;
