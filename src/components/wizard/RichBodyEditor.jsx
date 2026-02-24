import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import DOMPurify from 'dompurify';

// Use DOMPurify defaults (very permissive for safe HTML)
// but block scripts, iframes, forms, and event handlers
function sanitize(html) {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'iframe', 'form', 'input', 'select', 'textarea', 'button', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
    ALLOW_DATA_ATTR: false,
  });
}

const RichBodyEditor = forwardRef(function RichBodyEditor(
  { value, onChange, onFocus, placeholder = 'Start typing...', className = '' },
  ref
) {
  const editorRef = useRef(null);
  const isInternalChange = useRef(false);

  // Set initial content on mount
  useEffect(() => {
    if (editorRef.current && value) {
      editorRef.current.innerHTML = sanitize(value);
    }
  }, []); // Only on mount

  // Sync external value changes (e.g. loading saved content)
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (editorRef.current && value !== undefined) {
      const current = editorRef.current.innerHTML;
      // Only update if meaningfully different (avoid cursor reset)
      if (current !== value && sanitize(value) !== current) {
        editorRef.current.innerHTML = sanitize(value || '');
      }
    }
  }, [value]);

  // Expose insertAtCursor method for placeholder pills
  useImperativeHandle(ref, () => ({
    insertAtCursor(text) {
      if (editorRef.current) {
        editorRef.current.focus();
        document.execCommand('insertText', false, text);
        handleInput();
      }
    },
    focus() {
      editorRef.current?.focus();
    },
  }));

  function handleInput() {
    if (editorRef.current && onChange) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    if (html) {
      const clean = sanitize(html);
      document.execCommand('insertHTML', false, clean);
    } else if (text) {
      document.execCommand('insertText', false, text);
    }

    handleInput();
  }

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onPaste={handlePaste}
      onFocus={onFocus}
      data-placeholder={placeholder}
      className={`rich-body-editor w-full px-4 py-3 bg-white text-gray-900 border border-dark-600 rounded-xl text-sm focus:outline-none focus:border-rivvra-500 transition-colors leading-relaxed min-h-[240px] overflow-y-auto ${className}`}
    />
  );
});

// Helper: strip HTML to get plain text (for word/char counts)
export function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// Helper: check if HTML body is effectively empty
export function isBodyEmpty(body) {
  if (!body) return true;
  const text = stripHtml(body);
  return text.length === 0;
}

export { sanitize };
export default RichBodyEditor;
