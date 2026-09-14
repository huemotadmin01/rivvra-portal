import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import api from '../../../utils/api';
import TurnstileWidget from '../../TurnstileWidget';
import { Button } from './ui';
import { SUPPORT_EMAIL } from '../../../content/marketing/site';

/**
 * "Talk to us" — the secondary CTA on every marketing page. Posts to the same
 * public support endpoint as /support (rate-limited, Turnstile-gated when the
 * workspace has keys), tagged as a sales enquiry so it is easy to triage in
 * the support inbox. No calendar tool: a person replies by email.
 */
export default function TalkToUs({ open, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', website: '' });
  const [turnstile, setTurnstile] = useState({ enabled: false, siteKey: null });
  const [token, setToken] = useState(null);
  const [state, setState] = useState({ sending: false, sent: false, error: '' });

  useEffect(() => {
    if (!open) return undefined;
    setState({ sending: false, sent: false, error: '' });
    api.getRegistrationStatus()
      .then((r) => setTurnstile(r?.turnstile?.enabled && r?.turnstile?.siteKey ? r.turnstile : { enabled: false, siteKey: null }))
      .catch(() => {});
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.message.trim() && (!turnstile.enabled || token);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || state.sending) return;
    setState({ sending: true, sent: false, error: '' });
    try {
      const r = await api.sendPublicSupportRequest({
        ...form,
        message: `[Sales enquiry] ${form.company ? `${form.company} — ` : ''}${form.message.trim()}`,
        turnstileToken: turnstile.enabled ? token : undefined,
      });
      if (r?.success) setState({ sending: false, sent: true, error: '' });
      else setState({ sending: false, sent: false, error: r?.error || 'We could not send that. Email us instead.' });
    } catch (err) {
      setState({ sending: false, sent: false, error: err?.message || 'We could not send that. Email us instead.' });
    }
  };

  return (
    <div className="mk-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-labelledby="mk-talk-title">
      <div className="mk-modal">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="mk-talk-title" className="mk-h3">{state.sent ? 'Thanks, we will reply by email' : 'Talk to us'}</h2>
            {!state.sent && <p className="mk-small mt-1">Tell us about your agency. A person replies within one business day.</p>}
          </div>
          <button type="button" onClick={onClose} className="mk-btn mk-btn--ghost mk-btn--sm" aria-label="Close"><X style={{ width: 18, height: 18 }} /></button>
        </div>

        {state.sent ? (
          <div className="mk-brand-tint p-4 mt-5 flex gap-3 items-start">
            <Check style={{ width: 18, height: 18, color: 'var(--mk-brand-hi)', flexShrink: 0, marginTop: 2 }} />
            <p className="mk-p" style={{ margin: 0 }}>Sent to {SUPPORT_EMAIL}. We reply to {form.email}.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4 mt-5">
            {state.error && <p className="mk-small" style={{ color: 'var(--mk-warn)' }}>{state.error}</p>}
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="mk-field"><span className="mk-label">Your name</span><input className="mk-input" value={form.name} onChange={set('name')} autoComplete="name" required /></label>
              <label className="mk-field"><span className="mk-label">Work email</span><input className="mk-input" type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
            </div>
            <label className="mk-field"><span className="mk-label">Agency or company</span><input className="mk-input" value={form.company} onChange={set('company')} autoComplete="organization" /></label>
            <label className="mk-field"><span className="mk-label">What are you trying to do?</span><textarea className="mk-textarea" value={form.message} onChange={set('message')} placeholder="Team size, where you operate, what you use today." required /></label>
            <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            {turnstile.enabled && <TurnstileWidget siteKey={turnstile.siteKey} onToken={setToken} theme="light" />}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="mk-small">Or email <a className="mk-accent" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
              <Button type="submit" disabled={!valid || state.sending}>{state.sending ? 'Sending…' : 'Send'}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
