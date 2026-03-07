import { useState, useRef, useEffect } from 'react';
import { X, Send, Paperclip, FileText, Loader2 } from 'lucide-react';
import { PLACEHOLDERS } from './wizardConstants';
import RichBodyEditor, { stripHtml } from './RichBodyEditor';
import api from '../../utils/api';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function EmailStepEditor({ step, emailNumber, onSave, onCancel, sequenceId, stepIndex, onAttachmentsChange }) {
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
    <div className="bg-dark-800/60 border border-rivvra-500/30 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Email {emailNumber}</h4>
        <button onClick={onCancel} className="p-1 text-dark-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Subject */}
      <div>
        <label className="block text-xs text-dark-400 mb-1.5">Subject:</label>
        <input
          ref={subjectRef}
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onFocus={() => { lastFocusedRef.current = 'subject'; }}
          placeholder="Enter subject"
          className="w-full px-3 py-2.5 bg-dark-900 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
        />
      </div>

      {/* Placeholder pills */}
      <div className="flex flex-wrap gap-1.5">
        {PLACEHOLDERS.map(p => (
          <button
            key={p.label}
            onClick={() => insertPlaceholder(p.label)}
            className="px-2.5 py-1 bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20 rounded-lg text-xs font-medium hover:bg-rivvra-500/20 transition-colors"
          >
            {p.desc}
          </button>
        ))}
      </div>

      {/* Body — Rich text editor */}
      <div>
        <label className="block text-xs text-dark-400 mb-1.5">Content:</label>
        <RichBodyEditor
          ref={bodyEditorRef}
          value={body}
          onChange={setBody}
          onFocus={() => { lastFocusedRef.current = 'body'; }}
          placeholder="Start typing or paste content from Gmail..."
        />
      </div>

      {/* Attachments section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-dark-400 flex items-center gap-1.5">
            <Paperclip className="w-3 h-3" />
            Attachments ({attachments.length}/5)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= 5 || uploading}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-dark-300 bg-dark-700 border border-dark-600 rounded-lg hover:bg-dark-600 hover:text-white disabled:opacity-40 transition-colors"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
            {uploading ? 'Uploading...' : 'Attach PDF'}
          </button>
        </div>

        {attachError && (
          <p className="text-xs text-red-400 mb-2">{attachError}</p>
        )}

        {attachments.length > 0 && (
          <div className="space-y-1.5">
            {attachments.map((att, i) => (
              <div key={att.id || att.filename + i} className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg">
                <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                <span className="text-xs text-dark-300 truncate flex-1">{att.filename}</span>
                <span className="text-xs text-dark-500 flex-shrink-0">{formatFileSize(att.size)}</span>
                {att.local && <span className="text-xs text-amber-400 flex-shrink-0">pending</span>}
                <button
                  onClick={() => handleRemoveAttachment(i)}
                  className="p-0.5 text-dark-500 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between pt-2 border-t border-dark-700">
        <div className="text-xs text-dark-500">
          Words: {wordCount} &nbsp;&nbsp; Characters: {charCount}
        </div>

        <div className="flex items-center gap-3">
          {/* Send test */}
          {sequenceId && (
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@email.com"
                className="px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-xs text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 w-40"
              />
              <button
                onClick={handleSendTest}
                disabled={sendingTest || !testEmail}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 text-dark-300 rounded-lg text-xs font-medium hover:bg-dark-600 hover:text-white disabled:opacity-40 transition-colors"
              >
                <Send className="w-3 h-3" />
                {sendingTest ? 'Sending...' : 'Send test'}
              </button>
            </div>
          )}
          {testResult && (
            <span className={`text-xs ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.success ? 'Test sent!' : testResult.error}
            </span>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            className="px-5 py-1.5 bg-rivvra-500 text-dark-950 rounded-lg text-xs font-semibold hover:bg-rivvra-400 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default EmailStepEditor;
