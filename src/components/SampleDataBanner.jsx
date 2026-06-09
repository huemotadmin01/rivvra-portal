import { useState } from 'react';
import { useOrg } from '../context/OrgContext';
import { useToast } from '../context/ToastContext';
import api from '../utils/api';
import { Sparkles, X, Loader2 } from 'lucide-react';

/**
 * Shown while the org still has seeded sample data (currentOrg.sampleDataSeeded).
 * Admins/owners can remove it in one click; anyone can dismiss the banner for
 * the session. Mount once in the workspace shell.
 */
export default function SampleDataBanner() {
  const { currentOrg, orgSlug, isOrgOwner, isOrgAdmin, refetchOrg } = useOrg();
  const { showToast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!currentOrg?.sampleDataSeeded || dismissed) return null;

  const canRemove = isOrgOwner || isOrgAdmin;

  const handleRemove = async () => {
    if (!canRemove) return;
    setRemoving(true);
    try {
      await api.removeSampleData(orgSlug);
      showToast('Sample data removed.', 'success');
      setDismissed(true);
      refetchOrg?.();
    } catch (err) {
      showToast(err?.message || 'Failed to remove sample data', 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-rivvra-500/10 border-b border-rivvra-500/20 text-sm">
      <Sparkles className="w-4 h-4 text-rivvra-400 shrink-0" />
      <span className="text-dark-200 flex-1">
        You're exploring with <span className="font-medium text-white">sample data</span>. It's safe to remove when you're ready for your own.
      </span>
      {canRemove && (
        <button
          onClick={handleRemove}
          disabled={removing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 disabled:opacity-50 text-dark-950 font-medium transition-colors"
        >
          {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Remove sample data
        </button>
      )}
      <button onClick={() => setDismissed(true)} className="text-dark-400 hover:text-white p-1" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
