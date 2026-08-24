import { useState } from 'react';
import { FileText, Copy, Check, Loader2, X, RefreshCw, EyeOff } from 'lucide-react';
import api from '../../utils/api';

/* ── Submittal Summary (2026-08-24, growth-plan B4) ────────────────────────
 * One click on an application → the client-ready blurb a recruiter pastes
 * into the submission email, built from the candidate's AI profile + the
 * job context. Anonymized variant hides name + employer names for
 * pre-shortlist submissions. Cached server-side per variant; Regenerate
 * forces a fresh pass after profile/notes changes.
 * Inline styles read the semantic theme vars directly (see SourcingStrings
 * — utility classes failed to resolve on the v2 page and went transparent). */

const V = (name, fallback) => `var(${name}, ${fallback})`;
const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', padding: 16 },
  modal: { background: V('--surface-1', '#0f172a'), border: `1px solid ${V('--line', '#334155')}`, borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.45)' },
  title: { color: V('--fg', '#f1f5f9'), fontSize: 15, fontWeight: 600 },
  pre: { color: V('--fg-2', '#e2e8f0'), background: V('--surface-3', '#1e293b'), border: `1px solid ${V('--line', '#334155')}`, borderRadius: 8, padding: 14, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, lineHeight: 1.6 },
  ghostBtn: { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: `1px solid ${V('--line-strong', '#475569')}`, background: 'transparent', color: V('--fg-2', '#cbd5e1'), fontSize: 12, fontWeight: 600, cursor: 'pointer' },
};

export default function SubmittalSummary({ orgSlug, applicationId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [anonymize, setAnonymize] = useState(false);
  const [cache, setCache] = useState({}); // variant → summary
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const variant = anonymize ? 'anonymized' : 'standard';
  const summary = cache[variant];

  const fetchSummary = async (anon, force = false) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.request(
        `/api/org/${orgSlug}/ats/applications/${applicationId}/submittal-summary${force ? '?force=1' : ''}`,
        { method: 'POST', body: JSON.stringify({ anonymize: anon }) },
      );
      if (resp?.success) setCache((prev) => ({ ...prev, [anon ? 'anonymized' : 'standard']: resp.summary }));
      else setError(resp?.error || 'Generation failed');
    } catch (err) {
      setError(err.message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setOpen(true);
    if (!cache[variant]) fetchSummary(anonymize);
  };
  const toggleAnon = () => {
    const next = !anonymize;
    setAnonymize(next);
    if (!cache[next ? 'anonymized' : 'standard']) fetchSummary(next);
  };
  const copyText = async () => {
    if (!summary?.text) return;
    try { await navigator.clipboard.writeText(summary.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {}
  };

  return (
    <>
      <button type="button" onClick={openModal} style={S.ghostBtn} title="Generate a client-ready submittal blurb from the candidate's profile">
        <FileText size={13} /> Submittal summary
      </button>
      {open && (
        <div style={S.overlay} onClick={() => setOpen(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={S.title}>Submittal summary</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={toggleAnon} style={{ ...S.ghostBtn, ...(anonymize ? { borderColor: V('--brand', '#22c55e'), color: V('--brand', '#22c55e') } : {}) }} title="Hide the candidate's name and employer names (pre-shortlist submissions)">
                  <EyeOff size={12} /> {anonymize ? 'Anonymized' : 'Anonymize'}
                </button>
                <button type="button" onClick={() => fetchSummary(anonymize, true)} style={S.ghostBtn} title="Force a fresh rewrite — use after the resume was re-scored or your notes changed">
                  <RefreshCw size={12} /> Regenerate
                </button>
                <button type="button" onClick={copyText} style={S.ghostBtn} disabled={!summary}>
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" onClick={() => setOpen(false)} style={{ ...S.ghostBtn, border: 'none' }}><X size={15} /></button>
              </div>
            </div>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: V('--fg-3', '#94a3b8'), fontSize: 13, padding: '32px 0' }}>
                <Loader2 size={16} className="animate-spin" /> Writing the summary from the candidate's profile…
              </div>
            ) : error ? (
              <p style={{ color: '#f87171', fontSize: 13, padding: '12px 0' }}>{error}</p>
            ) : summary ? (
              <>
                <pre style={S.pre}>{summary.text}</pre>
                <p style={{ color: V('--fg-4', '#64748b'), fontSize: 11, marginTop: 10 }}>
                  Built from the candidate's AI profile, work history and your evaluation notes, tailored to this job. Review before sending — you own what the client reads.
                </p>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
