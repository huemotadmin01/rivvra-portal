import { useEffect, useState } from 'react';
import { LifeBuoy, Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useOrg } from '../context/OrgContext';
import api from '../utils/api';
import { Modal, Field, Input, Textarea, Button, Callout } from './ds';

/**
 * "Contact support" — a form that emails support@rivvra.com through the API.
 *
 * Replaces the mailto: link the app bar used to have, which did nothing on
 * any machine without a registered mail handler (most Macs that read Gmail
 * in the browser). The API attaches workspace, plan, user, page and browser,
 * and sets reply-to to the person, so the reply from the support inbox lands
 * with them. The Ask Rivvra panel opens the same dialog with the conversation
 * id so support has the context.
 *
 *   <SupportDialog open onClose={…} prefill={{ subject, message, threadId, lastQuestion }} />
 */
const SUPPORT_EMAIL = 'support@rivvra.com';

export default function SupportDialog({ open, onClose, prefill = {} }) {
  const { currentOrg } = useOrg();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null); // { reference, inbox }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubject(prefill.subject || '');
    setMessage(prefill.message || '');
    setError(''); setSent(null); setCopied(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = typeof window !== 'undefined' ? window.location.href : '';
  const gmailHref = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent(subject || 'Rivvra support')}&body=${encodeURIComponent(`${message}\n\n—\nWorkspace: ${currentOrg?.name || ''} (${currentOrg?.slug || ''})\nPage: ${page}`)}`;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!subject.trim() || !message.trim() || sending) return;
    setSending(true); setError('');
    try {
      const r = await api.sendSupportRequest(currentOrg?.slug, {
        subject: subject.trim(),
        message: message.trim(),
        page,
        threadId: prefill.threadId || undefined,
        lastQuestion: prefill.lastQuestion || undefined,
      });
      if (r?.success) setSent({ reference: r.reference, inbox: r.inbox || SUPPORT_EMAIL });
      else setError(r?.error || 'We could not send that.');
    } catch (err) {
      setError(err?.message || 'We could not send that.');
    } finally {
      setSending(false);
    }
  };

  const copy = () => {
    try { navigator.clipboard?.writeText(SUPPORT_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      icon={<LifeBuoy size={16} />}
      title={sent ? 'Message sent' : 'Contact support'}
      sub={sent ? undefined : 'A person replies by email, usually within one business day.'}
      footer={sent ? (
        <Button onClick={onClose}>Done</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={submit} disabled={sending || !subject.trim() || !message.trim()} iconLeft={sending ? <Loader2 size={14} className="animate-spin" /> : undefined}>
            Send
          </Button>
        </>
      )}
    >
      {sent ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <Callout tone="brand" icon={<Check size={15} />}>
            Sent to <strong>{sent.inbox}</strong>. Reference <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{sent.reference}</span>. We reply to the email on your account.
          </Callout>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label="Subject" required htmlFor="support-subject">
            <Input id="support-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What do you need help with?" maxLength={150} autoFocus />
          </Field>
          <Field label="Message" required htmlFor="support-message" hint="What you were trying to do, and what happened instead. Screenshots can follow by replying to our email.">
            <Textarea id="support-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} />
          </Field>
          <p style={{ font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
            We attach your workspace ({currentOrg?.name || 'this workspace'}), plan, email, the page you are on{prefill.threadId ? ', and this Ask Rivvra conversation' : ''}, so you do not have to.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingTop: 6, borderTop: '1px solid var(--line)', font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
            <span>Prefer your own mail app?</span>
            <button type="button" onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: 'var(--brand)', cursor: 'pointer', padding: 0, font: 'inherit' }}>
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : SUPPORT_EMAIL}
            </button>
            <a href={gmailHref} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand)' }}>
              <ExternalLink size={12} /> Open in Gmail
            </a>
          </div>
        </form>
      )}
    </Modal>
  );
}
