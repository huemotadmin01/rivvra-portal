import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import SupportDialog from './SupportDialog';

/**
 * "Contact support" in the app bar. Opens SupportDialog, which sends through
 * the API — the previous mailto: link did nothing on machines with no mail
 * handler, which is most of them.
 */
export default function SupportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Contact support"
        aria-label="Contact support"
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-dark-400 hover:text-sky-400 hover:bg-dark-800 transition-colors"
      >
        <LifeBuoy size={17} />
      </button>
      <SupportDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
