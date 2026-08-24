import { useState } from 'react';
import { Search, Copy, Check, Loader2, X } from 'lucide-react';
import api from '../../utils/api';

/* ── Sourcing Strings (2026-08-24, growth-plan B3) ─────────────────────────
 * One click on a job → paste-ready boolean search strings for LinkedIn,
 * Naukri Resdex and Google X-ray, generated from the job's title, required
 * skills and JD. Cached server-side on the job doc (regenerates when the
 * job is edited), so repeat opens are instant and free. */

function CopyBlock({ label, text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {}
  };
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-dark-300">{label}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1 text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors">
          {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="text-xs text-dark-200 bg-dark-800 border border-dark-700 rounded-lg p-3 whitespace-pre-wrap break-words">{text}</pre>
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-600 text-xs font-semibold text-dark-300 hover:text-dark-100 hover:bg-dark-800 transition-colors"
        title="Generate boolean search strings for LinkedIn / Naukri / Google from this job's requirements"
      >
        <Search size={13} /> Sourcing strings
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="bg-dark-850 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Sourcing strings</h3>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-dark-400 hover:text-dark-200 hover:bg-dark-800"><X size={16} /></button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-dark-400 py-8 justify-center"><Loader2 size={16} className="animate-spin" /> Generating from the job's requirements…</div>
            ) : error ? (
              <p className="text-sm text-red-400 py-4">{error}</p>
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
                <p className="text-[11px] text-dark-500 mt-2">Generated from this job's title, required skills and JD. Edit the job and reopen to regenerate.</p>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
