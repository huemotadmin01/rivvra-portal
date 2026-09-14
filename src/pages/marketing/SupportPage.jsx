import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import api from '../../utils/api';
import TurnstileWidget from '../../components/TurnstileWidget';
import Shell from '../../components/marketing/shell/Shell';
import { Section, Eyebrow, Button } from '../../components/marketing/shell/ui';
import { SUPPORT_EMAIL } from '../../content/marketing/site';

const PLAN_SLAS = [
  { plan: 'Free', promise: 'Email support, reply within 2 business days' },
  { plan: 'Growth', promise: 'Email support, reply within 1 business day' },
  { plan: 'Scale', promise: 'Priority support, same business day' },
];

/** /support and /contact. Public form → POST /api/public/support (rate-limited,
 *  honeypot, Turnstile when keys exist). Signed-in users have the in-app
 *  dialog, which attaches workspace and plan automatically. */
export default function SupportPage() {
  useDocumentMeta({ title: 'Support', description: 'Get help with Rivvra. Email support@rivvra.com or send a message here; a person replies, usually within one business day.', path: '/support' });
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', website: '' });
  const [turnstile, setTurnstile] = useState({ enabled: false, siteKey: null });
  const [token, setToken] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getRegistrationStatus()
      .then((r) => setTurnstile(r?.turnstile?.enabled && r?.turnstile?.siteKey ? r.turnstile : { enabled: false, siteKey: null }))
      .catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const canSend = form.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.message.trim() && (!turnstile.enabled || token);
  const submit = async (e) => {
    e.preventDefault();
    if (!canSend || sending) return;
    setSending(true); setError('');
    try {
      const r = await api.sendPublicSupportRequest({ ...form, turnstileToken: turnstile.enabled ? token : undefined });
      if (r?.success) setSent(r.reference); else setError(r?.error || 'We could not send that.');
    } catch (err) { setError(err?.message || 'We could not send that.'); } finally { setSending(false); }
  };

  return (
    <Shell>
      <Section className="pt-16 md:pt-24">
        <div className="max-w-2xl">
          <Eyebrow>Support</Eyebrow>
          <h1 className="mk-display mk-h1">Talk to a person, <span className="mk-accent">not a bot.</span></h1>
          <p className="mk-lede mt-6">Every message goes to the people who build Rivvra. Write to <a className="mk-accent" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or use the form. Signed in? The support icon in the top bar sends with your workspace details attached.</p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6 mt-12">
          <div className="lg:col-span-3 mk-card p-6 md:p-8">
            {sent ? (
              <div className="flex gap-3 items-start">
                <Check style={{ width: 20, height: 20, color: 'var(--mk-brand-hi)', flexShrink: 0, marginTop: 2 }} />
                <div><h2 className="mk-h3">Message sent</h2><p className="mk-p mt-2">Reference <span className="mk-mono">{sent}</span>. We reply to {form.email}.</p></div>
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-4">
                {error && <p className="mk-small" style={{ color: 'var(--mk-warn)' }}>{error}</p>}
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="mk-field"><span className="mk-label">Your name</span><input className="mk-input" value={form.name} onChange={set('name')} maxLength={100} autoComplete="name" required /></label>
                  <label className="mk-field"><span className="mk-label">Email</span><input className="mk-input" type="email" value={form.email} onChange={set('email')} maxLength={200} autoComplete="email" placeholder="you@company.com" required /></label>
                </div>
                <label className="mk-field"><span className="mk-label">Company</span><input className="mk-input" value={form.company} onChange={set('company')} maxLength={150} autoComplete="organization" /></label>
                <label className="mk-field"><span className="mk-label">How can we help?</span><textarea className="mk-textarea" rows={6} value={form.message} onChange={set('message')} maxLength={5000} required /></label>
                <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                {turnstile.enabled && <TurnstileWidget siteKey={turnstile.siteKey} onToken={setToken} theme="light" />}
                <div><Button type="submit" disabled={!canSend || sending}>{sending ? 'Sending…' : 'Send message'}</Button></div>
              </form>
            )}
          </div>

          <aside className="lg:col-span-2 grid gap-4 content-start">
            <div className="mk-card p-6">
              <p className="mk-h4">Response times</p>
              <ul className="grid gap-2.5 mt-3 p-0 m-0 list-none">
                {PLAN_SLAS.map((s) => <li key={s.plan} className="flex gap-3 text-[14px]"><span className="w-16 flex-shrink-0 font-medium" style={{ color: 'var(--mk-ink)' }}>{s.plan}</span><span style={{ color: 'var(--mk-ink-2)' }}>{s.promise}</span></li>)}
              </ul>
              <p className="mk-small mt-4">Business days are Monday to Friday, India time. See <Link className="mk-accent" to="/pricing">pricing</Link> for what each plan includes.</p>
            </div>
            <div className="mk-card p-6">
              <p className="mk-h4">Help yourself first</p>
              <ul className="grid gap-2 mt-3 p-0 m-0 list-none text-[14px]" style={{ color: 'var(--mk-ink-2)' }}>
                <li>Inside the app, the <b style={{ color: 'var(--mk-ink)' }}>?</b> button opens the Knowledge Base for the app you are in.</li>
                <li><b style={{ color: 'var(--mk-ink)' }}>Ask Rivvra</b> (⌘K) answers questions about your own data and has a "Talk to a human" button when it cannot.</li>
                <li>Billing questions: <Link className="mk-accent" to="/pricing">pricing and FAQ</Link>.</li>
              </ul>
            </div>
            <div className="mk-card p-6 text-[14px]" style={{ color: 'var(--mk-ink-2)' }}>
              <p className="mk-h4 mb-2">Security or privacy issue?</p>
              Email <a className="mk-accent" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with "Security" in the subject and we treat it as urgent. Our <Link className="mk-accent" to="/privacy">privacy policy</Link> explains what we hold and how to request or delete it.
            </div>
          </aside>
        </div>
      </Section>
    </Shell>
  );
}
