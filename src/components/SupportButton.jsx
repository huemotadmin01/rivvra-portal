import { LifeBuoy } from 'lucide-react';
import { useOrg } from '../context/OrgContext';

/**
 * "Contact support" in the app bar. Until now the only route to a human was
 * the support@ address in the marketing footer and the legal pages; inside
 * the app there was the help-centre button and nothing else. The mailto
 * pre-fills the workspace slug and current page so support can reproduce
 * without a round trip.
 */
const SUPPORT_EMAIL = 'support@rivvra.com';

export default function SupportButton() {
  const { currentOrg } = useOrg();
  const subject = `Rivvra support${currentOrg?.slug ? ` — ${currentOrg.slug}` : ''}`;
  const body = [
    'Hi Rivvra team,',
    '',
    'What I was trying to do:',
    '',
    'What happened instead:',
    '',
    '—',
    `Workspace: ${currentOrg?.name || ''} (${currentOrg?.slug || ''})`,
    `Page: ${typeof window !== 'undefined' ? window.location.href : ''}`,
  ].join('\n');
  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <a
      href={href}
      title="Contact support"
      aria-label="Contact support"
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-dark-400 hover:text-sky-400 hover:bg-dark-800 transition-colors"
    >
      <LifeBuoy size={17} />
    </a>
  );
}
