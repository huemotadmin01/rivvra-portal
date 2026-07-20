import { useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

/**
 * KbHelpButton — contextual "?" that jumps into the Knowledge Base for the
 * current app (or straight to a specific article).
 *
 * Drop it into any app screen's header:
 *   <KbHelpButton appId="expenses" />                      // opens Expenses docs
 *   <KbHelpButton appId="crm" articleSlug="crm-managing-opportunities" />
 *   <KbHelpButton appId="ats" label="How this works" />    // text variant
 *
 * Read access is gated server-side by app access, so if the user can't see the
 * app's docs the KB simply shows what they're allowed to. The button is safe to
 * render for everyone.
 */
export default function KbHelpButton({ appId, articleSlug, label, className = '' }) {
  const { orgPath } = usePlatform();
  const navigate = useNavigate();

  const go = () => {
    if (articleSlug) {
      navigate(orgPath(`/knowledge-base/${articleSlug}`));
    } else {
      navigate(orgPath(`/knowledge-base${appId ? `?app=${encodeURIComponent(appId)}` : ''}`));
    }
  };

  if (label) {
    return (
      <button
        type="button"
        onClick={go}
        className={`inline-flex items-center gap-1.5 text-xs text-dark-400 hover:text-sky-400 transition-colors ${className}`}
        title="Open help"
      >
        <HelpCircle size={14} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-dark-400 hover:text-sky-400 hover:bg-dark-800 transition-colors ${className}`}
      title="Help & guides"
      aria-label="Help & guides"
    >
      <HelpCircle size={17} />
    </button>
  );
}
