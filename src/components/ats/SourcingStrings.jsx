import { useState } from 'react';
import { Search, Copy, Check, Loader2, X } from 'lucide-react';
import api from '../../utils/api';

/* ── Sourcing Strings (2026-08-24, growth-plan B3) ─────────────────────────
 * One click on a job → paste-ready boolean search strings for LinkedIn,
 * Naukri Resdex and Google X-ray, generated from the job's title, required
 * skills and JD. Cached server-side on the job doc (regenerates when the
 * job is edited), so repeat opens are instant and free.
 *
 * Styling note (2026-08-24): the modal uses INLINE styles reading the
 * semantic theme vars (--surface-*/--fg-*/--line with dark fallbacks) —
 * the ds-* utility classes failed to resolve here on first ship and the
 * modal rendered transparent over the page. Inline var() reads cannot. */

const V = (name, fallback) => `var(${name}, ${fallback})`;
const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', padding: 16 },
  modal: { background: V('--surface-1', '#0f172a'), border: `1px solid ${V('--line', '#334155')}`, borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '85vh', overflowY: 'auto', padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.45)' },
  title: { color: V('--fg', '#f1f5f9'), fontSize: 15, fontWeight: 600 },
  label: { color: V('--fg-2', '#cbd5e1'), fontSize: 12, fontWeight: 600 },
  pre: { color: V('--fg-2', '#e2e8f0'), background: V('--surface-3', '#1e293b'), border: `1px solid ${V('--line', '#334155')}`, borderRadius: 8, padding: 12, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, lineHeight: 1.5 },
  note: { color: V('--fg-4', '#64748b'), fontSize: 11, marginTop: 10 },
  closeBtn: { color: V('--fg-3', '#94a3b8'), background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8 },
};

function CopyBlock({ label, text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {}
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={S.label}>{label}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1 text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors">
          {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={S.pre}>{text}</pre>
    </div>
  );
}

export default function SourcingStrings({ orgSlug, jobId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const generate = async () => {
    setOpen(true);
    if (data) return; // cached client-side for this visit
    setLoading(true);
    try {
      const resp = await api.request(`/api/org/${orgSlug}/ats/jobs/${jobId}/sourcing-strings`, { method: 'POST' });
      if (resp?.success) { setData(resp.sourcing); setError(null); }
      else setError(resp?.error || 'Generation failed');
    } catch (err) {
      setError(err.message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={generate}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${V('--line-strong', '#475569')}`, background: 'transparent', color: V('--fg-2', '#cbd5e1'), fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        title="Generate boolean search strings for LinkedIn / Naukri / Google from this job's requirements"
      >
        <Search size={13} /> Sourcing strings
      </button>
      {open && (
        <div style={S.overlay} onClick={() => setOpen(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={S.title}>Sourcing strings</h3>
              <button type="button" style={S.closeBtn} onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: V('--fg-3', '#94a3b8'), fontSize: 13, padding: '32px 0' }}>
                <Loader2 size={16} className="animate-spin" /> Generating from the job's requirements…
              </div>
            ) : error ? (
              <p style={{ color: '#f87171', fontSize: 13, padding: '16px 0' }}>{error}</p>
            ) : data ? (
              <>
                <CopyBlock label="LinkedIn boolean" text={data.linkedinBoolean} />
                <CopyBlock label="Naukri Resdex keywords" text={data.naukriKeywords} />
                <CopyBlock label="Google X-ray" text={data.googleXray} />
                {(data.alternateTitles || []).length > 0 && (
                  <CopyBlock label="Alternate titles to try" text={data.alternateTitles.join(' · ')} />
                )}
                {(data.excludeKeywords || []).length > 0 && (
                  <CopyBlock label="Exclude (NOT)" text={data.excludeKeywords.join(', ')} />
                )}
                <p style={S.note}>Generated from this job's title, required skills and JD. Edit the job and reopen to regenerate.</p>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
