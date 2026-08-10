import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import contactsApi from '../../utils/contactsApi';
import { X, UserPlus, UserCheck, FileText } from 'lucide-react';

// ── VendorChoiceModal ──────────────────────────────────────────────────────
// Shown after an AI extraction finds no confident vendor match. Lets the user
// Create the extracted vendor, Match an existing contact, or Leave blank.
// onDone(contactId | null) is called with the chosen contact id (or null for
// "leave blank"). Used by both the vendor-bill list (drop-to-create) and the
// bill detail page (Extract-from-PDF on an existing draft) so the create-vendor
// step is offered on BOTH entry points, not just the list drop zone.
export default function VendorChoiceModal({ extracted, orgSlug, onCancel, onDone, createLabel = 'Create vendor & link', blankLabel = 'Create bill' }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState('create'); // create | match | blank
  const [creating, setCreating] = useState(false);
  const [matchQuery, setMatchQuery] = useState('');
  const [matchResults, setMatchResults] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);

  const extractedName = extracted?.vendor?.name || '';
  const extractedGstin = extracted?.vendor?.gstin || '';
  // Address is now a structured object (PR 2, 2026-05-24). Old extract
  // responses still returned a plain string; the backend accepts either,
  // so we just forward whichever shape we got.
  const extractedAddress = extracted?.vendor?.address ?? null;
  const extractedTaxId = extracted?.vendor?.taxId || '';

  useEffect(() => {
    if (mode !== 'match') return;
    let cancelled = false;
    const q = matchQuery.trim() || extractedName.trim();
    if (!q) { setMatchResults([]); return; }
    setMatchLoading(true);
    const t = setTimeout(() => {
      contactsApi.list(orgSlug, { search: q, limit: 10 })
        .then((res) => { if (!cancelled) setMatchResults(res?.contacts || res?.data || []); })
        .catch(() => { if (!cancelled) setMatchResults([]); })
        .finally(() => { if (!cancelled) setMatchLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mode, matchQuery, extractedName, orgSlug]);

  async function handleCreate() {
    if (!extractedName.trim()) return showToast('No vendor name extracted', 'error');
    setCreating(true);
    try {
      // Heuristic mirrors the server-side regex in contacts.js — keeping the
      // UI default in sync means the new contact opens in the right form
      // layout (company vs individual) immediately, before the API echoes back.
      const COMPANY_SUFFIX_RE = /\b(pvt|private|ltd|limited|inc|incorporated|llp|llc|pllc|plc|corp|corporation|co|company|gmbh|sa|sarl|bv|pte|ag|ab|kk|cpas?)\b\.?/i;
      const inferredType = COMPANY_SUFFIX_RE.test(extractedName) ? 'company' : 'individual';
      const res = await contactsApi.create(orgSlug, {
        name: extractedName,
        companyName: extractedName,
        type: inferredType,
        gstin: extractedGstin || undefined,
        taxId: extractedTaxId || undefined,
        address: extractedAddress || undefined,
        contactType: 'vendor',
      });
      const newId = res?.contact?._id || res?._id;
      if (!newId) throw new Error('Contact creation returned no id');
      onDone(newId);
    } catch (err) {
      showToast(err.message || 'Failed to create vendor', 'error');
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <div>
            <h3 className="text-base font-semibold text-white">No matching vendor found</h3>
            <p className="text-xs text-dark-400 mt-0.5">
              AI extracted "<span className="text-white">{extractedName || '(no name)'}</span>"
              {extractedGstin && <> — GSTIN <span className="text-white">{extractedGstin}</span></>}
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => setMode('create')}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors ${
                mode === 'create' ? 'border-rivvra-500 bg-rivvra-500/10 text-white' : 'border-dark-700 text-dark-300 hover:border-dark-600'
              }`}
            >
              <UserPlus size={16} />
              <span className="font-medium">Create vendor</span>
            </button>
            <button
              onClick={() => setMode('match')}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors ${
                mode === 'match' ? 'border-rivvra-500 bg-rivvra-500/10 text-white' : 'border-dark-700 text-dark-300 hover:border-dark-600'
              }`}
            >
              <UserCheck size={16} />
              <span className="font-medium">Match existing</span>
            </button>
            <button
              onClick={() => setMode('blank')}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors ${
                mode === 'blank' ? 'border-rivvra-500 bg-rivvra-500/10 text-white' : 'border-dark-700 text-dark-300 hover:border-dark-600'
              }`}
            >
              <FileText size={16} />
              <span className="font-medium">Leave blank</span>
            </button>
          </div>

          {mode === 'create' && (
            <div className="text-xs text-dark-400 bg-dark-900/50 rounded-lg p-3 space-y-0.5">
              <div><span className="text-dark-500">Name:</span> <span className="text-white">{extractedName || '—'}</span></div>
              {extractedGstin && <div><span className="text-dark-500">GSTIN:</span> <span className="text-white">{extractedGstin}</span></div>}
              {extractedTaxId && <div><span className="text-dark-500">Tax ID:</span> <span className="text-white">{extractedTaxId}</span></div>}
              {(() => {
                if (!extractedAddress) return null;
                const a = extractedAddress;
                const display = typeof a === 'string'
                  ? a
                  : [a.street, a.street2, a.city, a.state, a.zip, a.country].filter(Boolean).join(', ');
                return display ? <div><span className="text-dark-500">Address:</span> <span className="text-white">{display}</span></div> : null;
              })()}
            </div>
          )}

          {mode === 'match' && (
            <div className="space-y-2">
              <input
                value={matchQuery}
                onChange={(e) => setMatchQuery(e.target.value)}
                placeholder={extractedName || 'Search vendors…'}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
              />
              <div className="max-h-52 overflow-y-auto space-y-1">
                {matchLoading ? (
                  <div className="text-xs text-dark-500 p-3">Searching…</div>
                ) : matchResults.length === 0 ? (
                  <div className="text-xs text-dark-500 p-3">No matches</div>
                ) : (
                  matchResults.map((c) => (
                    <button
                      key={c._id}
                      onClick={() => onDone(c._id)}
                      className="w-full text-left rounded-lg px-3 py-2 hover:bg-dark-800 transition-colors"
                    >
                      <div className="text-sm text-white">{c.name || c.companyName || '(no name)'}</div>
                      <div className="text-xs text-dark-500">
                        {c.gstin ? `GSTIN ${c.gstin}` : c.email || '—'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {mode === 'blank' && (
            <div className="text-xs text-dark-400 bg-dark-900/50 rounded-lg p-3">
              Leave the bill without a vendor. You can assign one later on the bill detail page.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-dark-700">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-dark-300 hover:bg-dark-800">
            Cancel
          </button>
          {mode === 'create' && (
            <button
              onClick={handleCreate}
              disabled={creating || !extractedName.trim()}
              className="px-3 py-1.5 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 disabled:opacity-50 text-sm font-medium text-white"
            >
              {creating ? 'Creating…' : createLabel}
            </button>
          )}
          {mode === 'blank' && (
            <button
              onClick={() => onDone(null)}
              className="px-3 py-1.5 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-sm font-medium text-white"
            >
              {blankLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
