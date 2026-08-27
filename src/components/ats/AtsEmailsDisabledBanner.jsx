import { useState, useEffect } from 'react';
import { MailX } from 'lucide-react';
import { Callout } from '../ds';
import api from '../../utils/api';

/* Candidate-facing ATS email can be globally disabled at the platform level
   (ATS_EMAILS_GLOBAL_ENABLED env kill-switch). Sends are then skipped and
   logged as blocked — previously with NO user-visible signal, so recruiters
   believed candidates were being emailed when nothing went out. This banner
   makes the suppression loud wherever it's mounted. Renders nothing while
   loading or when email is enabled (the normal case costs one tiny fetch). */
export default function AtsEmailsDisabledBanner({ orgSlug, style }) {
  const [disabled, setDisabled] = useState(false);
  useEffect(() => {
    if (!orgSlug) return;
    api.request(`/api/org/${orgSlug}/ats/email-status`)
      .then((res) => { if (res?.success && res.enabled === false) setDisabled(true); })
      .catch(() => {});
  }, [orgSlug]);
  if (!disabled) return null;
  return (
    <Callout tone="warn" icon={<MailX size={15} />} title="Candidate emails are currently disabled" style={{ marginBottom: 14, ...style }}>
      <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 }}>
        Stage-change, interview and offer emails are not being sent to candidates right now —
        actions still work, but no mail goes out. Contact support to enable candidate email.
      </p>
    </Callout>
  );
}
