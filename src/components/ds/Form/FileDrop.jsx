import { useRef, useState } from 'react';

const FONT = "'Inter', system-ui, sans-serif";

/**
 * Drag-and-drop file target with a click-to-browse fallback.
 *
 * Presentational only: it owns the drag highlight and the hidden input, and
 * hands every chosen file straight to `onSelect`. It does NOT validate — type
 * and size rules are the caller's, because the message they produce is
 * domain copy ("Word docs aren't supported yet"), not a control concern.
 *
 * `accept` is passed to the input as a browse-dialog filter; a drop bypasses
 * it entirely, which is exactly why the caller must still check.
 */
export function FileDrop({
  onSelect,
  accept,
  multiple = false,
  disabled = false,
  filled = false,
  children,
  style,
  ...rest
}) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  const handleDrag = (e) => {
    stop(e);
    if (disabled) return;
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    stop(e);
    if (disabled) return;
    setDragActive(false);
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;
    if (multiple) onSelect?.(Array.from(files));
    else onSelect?.(files[0]);
  };

  const open = () => { if (!disabled) inputRef.current?.click(); };

  const ring = dragActive
    ? 'var(--brand, #22c55e)'
    : filled
      ? 'var(--brand-line, rgba(34,197,94,.28))'
      : 'var(--line-2, rgba(255,255,255,.11))';

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      style={{
        display: 'grid', placeItems: 'center', textAlign: 'center',
        padding: 28, borderRadius: 'var(--r-3, 14px)',
        border: `2px dashed ${ring}`,
        background: dragActive
          ? 'var(--brand-soft, rgba(34,197,94,.13))'
          : filled
            ? 'var(--brand-soft, rgba(34,197,94,.13))'
            : 'var(--surface-2, #141b24)',
        color: 'var(--fg-3, #98a4b2)',
        font: `450 13px/1.5 ${FONT}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 180ms cubic-bezier(.2,.9,.28,1), background 180ms cubic-bezier(.2,.9,.28,1)',
        ...style,
      }}
      {...rest}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length) {
            if (multiple) onSelect?.(Array.from(files));
            else onSelect?.(files[0]);
          }
          // Reset so re-picking the same file after removing it (or after a
          // caller-side reject) still fires onChange.
          e.target.value = '';
        }}
      />
      {children}
    </div>
  );
}
