import { useState, useRef, useEffect } from 'react';
import { X, Send, Paperclip, FileText, Loader2 } from 'lucide-react';
import { PLACEHOLDERS } from '../wizardConstants';
import RichBodyEditor, { stripHtml } from '../RichBodyEditor';
import api from '../../../utils/api';
import { Button, Chip, Callout, Field, Input } from '../../ds';

const microStyle = { font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

/**
 * Single email editor inside the Compose step.
 *
 * `RichBodyEditor` is imported from the LEGACY folder unchanged, and that is
 * the point — it is the WYSIWYG surface (white, Arial 14px, Gmail link blue),
 * so it must keep looking like the email, not like the app. See ./README.md.
 *
 * ── Everything below the render is spliced verbatim ─────────────────────────
 *   • The attachment rules: max 5, `application/pdf` only, 5 MB cap. Note the
 *     limit check `break`s while the type and size checks `continue` — one
 *     rejected file does not abort the rest of a multi-select, but hitting the
 *     cap does.
 *   • The dual upload mode. With a `sequenceId` (edit) files upload
 *     immediately; without one (create) they are held as
 *     `{ file, local: true }` and uploaded by the page after the sequence
 *     exists. `handleSave` only forwards `a.local` ones, so an already-uploaded
 *     attachment is never re-sent.
 *   • `insertPlaceholder`'s two paths. Subject is a plain input, so it splices
 *     at `selectionStart/End` and restores the caret in a `setTimeout(…, 0)`
 *     after React re-renders. Body goes through the editor's imperative
 *     `insertAtCursor`, because reading a contentEditable selection from
 *     outside would lose it.
 *   • `lastFocusedRef` — which field a placeholder pill lands in. Without it,
 *     every pill would go to the body.
 *
 * ⚠️ `handleSendTest` sends a real email. Never triggered.
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function EmailStepEditorV2({ step, emailNumber, onSave, onCancel, sequenceId, stepIndex, onAttachmentsChange }) {
  const [subject, setSubject] = useState(step.subject || '');
  const [body, setBody] = useState(step.body || '');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Attachment state
  const [attachments, setAttachments] = useState([]); // [{ id, filename, size }] for uploaded, [{ file, filename, size, local: true }] for local
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState('');
  const fileInputRef = useRef(null);

  const subjectRef = useRef(null);
  const bodyEditorRef = useRef(null);
  const lastFocusedRef = useRef('body');

  // Load existing attachments if editing (sequenceId exists)
  useEffect(() => {
    if (sequenceId && stepIndex !== undefined) {
      api.getStepAttachments(sequenceId, stepIndex).then(res => {
        if (res.success) setAttachments(res.attachments);
      }).catch(() => {});
    }
    // Load local attachments from step if in creation mode
    if (!sequenceId && step._localAttachments) {
      setAttachments(step._localAttachments);
    }
  }, [sequenceId, stepIndex]);

  const plainText = stripHtml(body);
  const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
  const charCount = plainText.length;

  function insertPlaceholder(placeholder) {
    const field = lastFocusedRef.current;

    if (field === 'subject') {
      const ref = subjectRef;
      if (ref.current) {
        const start = ref.current.selectionStart || subject.length;
        const end = ref.current.selectionEnd || subject.length;
        const newValue = subject.substring(0, start) + placeholder + subject.substring(end);
        setSubject(newValue);
        setTimeout(() => {
          ref.current.focus();
          const newPos = start + placeholder.length;
          ref.current.setSelectionRange(newPos, newPos);
        }, 0);
      } else {
        setSubject(subject + placeholder);
      }
    } else {
      if (bodyEditorRef.current) {
        bodyEditorRef.current.insertAtCursor(placeholder);
      } else {
        setBody(body + placeholder);
      }
    }
  }

  async function handleSendTest() {
    if (!testEmail || !sequenceId) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      await api.sendTestEmail(sequenceId, emailNumber - 1, testEmail);
      setTestResult({ success: true });
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setSendingTest(false);
    }
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // Reset so same file can be selected again
    setAttachError('');

    for (const file of files) {
      if (attachments.length >= 5) {
        setAttachError('Maximum 5 attachments per email');
        break;
      }
      if (file.type !== 'application/pdf') {
        setAttachError('Only PDF files are allowed');
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setAttachError('File too large (max 5MB)');
        continue;
      }

      if (sequenceId && stepIndex !== undefined) {
        // Upload immediately
        setUploading(true);
        try {
          const res = await api.uploadAttachment(sequenceId, stepIndex, file);
          if (res.success) {
            setAttachments(prev => [...prev, res.attachment]);
          }
        } catch (err) {
          setAttachError(err.message || 'Upload failed');
        } finally {
          setUploading(false);
        }
      } else {
        // Store locally for creation mode (upload after sequence is created)
        const localAttachment = { file, filename: file.name, size: file.size, local: true };
        setAttachments(prev => {
          const updated = [...prev, localAttachment];
          if (onAttachmentsChange) onAttachmentsChange(updated);
          return updated;
        });
      }
    }
  }

  async function handleRemoveAttachment(index) {
    const att = attachments[index];
    if (att.id && sequenceId) {
      // Delete from server
      try {
        await api.deleteAttachment(sequenceId, att.id);
      } catch (err) {
        console.error('Failed to delete attachment:', err);
      }
    }
    setAttachments(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (onAttachmentsChange) onAttachmentsChange(updated);
      return updated;
    });
  }

  function handleSave() {
    // Pass local attachments with the save data for creation mode
    const saveData = { subject, body };
    if (!sequenceId) {
      saveData._localAttachments = attachments.filter(a => a.local);
    }
    onSave(saveData);
  }

  return (
    <div style={{
      padding: 18, borderRadius: 'var(--r-3, 16px)',
      background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--brand)',
      display: 'grid', gap: 16,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
          Email {emailNumber}
        </h4>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label={`Close editor for email ${emailNumber}`}
          iconLeft={<X size={16} />} />
      </div>

      <Field label="Subject" htmlFor={`ese-subject-${emailNumber}`}>
        <Input
          ref={subjectRef}
          id={`ese-subject-${emailNumber}`}
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onFocus={() => { lastFocusedRef.current = 'subject'; }}
          placeholder="Enter subject"
        />
      </Field>

      {/* Placeholder pills — insert into whichever field was last focused. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PLACEHOLDERS.map(p => (
          <Button
            key={p.label}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => insertPlaceholder(p.label)}
            title={p.label}
          >
            {p.desc}
          </Button>
        ))}
      </div>

      {/* Body. The editor keeps its own white/email typography — see README. */}
      <div>
        <span style={{ ...microStyle, display: 'block', marginBottom: 6 }}>Body</span>
        <RichBodyEditor
          ref={bodyEditorRef}
          value={body}
          onChange={setBody}
          onFocus={() => { lastFocusedRef.current = 'body'; }}
          placeholder="Start typing or paste content from Gmail..."
        />
      </div>

      {/* Attachments */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <span style={microStyle}>Attachments ({attachments.length}/5)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            aria-hidden
            tabIndex={-1}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= 5 || uploading}
            iconLeft={uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
          >
            {uploading ? 'Uploading...' : 'Attach PDF'}
          </Button>
        </div>

        {attachError && <div style={{ marginBottom: 8 }}><Callout tone="danger">{attachError}</Callout></div>}

        {attachments.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            {attachments.map((att, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                borderRadius: 'var(--r-2, 10px)', background: 'var(--surface-3)',
              }}>
                <FileText size={14} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, font: "450 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {att.filename}
                </span>
                <span style={microStyle}>{formatFileSize(att.size)}</span>
                {att.local && <Chip tone="warn">pending</Chip>}
                <Button variant="ghost" size="sm" onClick={() => handleRemoveAttachment(i)}
                  aria-label={`Remove ${att.filename}`} style={{ color: 'var(--danger)' }}
                  iconLeft={<X size={14} />} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--line)',
      }}>
        <span style={microStyle}>Words: {wordCount} &nbsp; Characters: {charCount}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Send test only exists once the sequence is saved — there is no
              sequenceId to send against during creation. */}
          {sequenceId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@email.com"
                aria-label="Send a test email to"
                style={{ width: 168, height: 32, fontSize: 12.5 }}
              />
              <Button variant="secondary" size="sm" onClick={handleSendTest}
                disabled={sendingTest || !testEmail}
                iconLeft={sendingTest ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}>
                {sendingTest ? 'Sending...' : 'Send test'}
              </Button>
            </div>
          )}
          {testResult && (
            <span style={{
              font: "450 11.5px/1.4 'Inter', system-ui, sans-serif",
              color: testResult.success ? 'var(--brand-ink)' : 'var(--danger)',
            }}>
              {testResult.success ? 'Test sent!' : testResult.error}
            </span>
          )}

          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}

export default EmailStepEditorV2;
