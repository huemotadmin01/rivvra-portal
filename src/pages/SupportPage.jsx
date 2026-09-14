import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, Mail, Clock, BookOpen, Check, Loader2, AlertCircle } from 'lucide-react';
import MarketingLayout from '../components/marketing/MarketingLayout';
import TurnstileWidget from '../components/TurnstileWidget';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import api from '../utils/api';

/**
 * /support (and /contact) — the public support page.
 *
 * Until now the only support surface was a mailto link in the footer. This
 * page states the address, the response promise by plan (matching the
 * pricing table), and carries a contact form that emails support@rivvra.com
 * through the API. The form uses the same Turnstile gate as signup when it
 * is on, so bots cannot fill the inbox.
 */
const SUPPORT_EMAIL = 'support@rivvra.com';

const PLAN_SLAS = [
  { plan: 'Free', promise: 'Email support, reply within 2 business days' },
  { plan: 'Growth', promise: 'Email support, reply within 1 business day' },
  { plan: 'Scale', promise: 'Priority support, same business day' },
];

export default function SupportPage() {
  useDocumentMeta({
    title: 'Support',
    description: 'Get help with Rivvra. Email support@rivvra.com or send a message here; a person replies, usually within one business day.',
    path: '/support',
  });

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
      if (r?.success) setSent(r.reference);
      else setError(r?.error || 'We could not send that.');
    } catch (err) {
      setError(err?.message || 'We could not send that.');
    } finally {
      setSending(false);
    }
  };

  const input = 'w-full rounded-xl bg-dark-900 border border-dark-700 px-4 py-3 text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500/60 transition-colors';

  return (
    <MarketingLayout activePage="support">
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-16">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[13px] text-dark-300 mb-6">
            <LifeBuoy className="w-3.5 h-3.5 text-rivvra-400" /> Support
          </div>
          <h1 className="font-marketing text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">Talk to a person, not a bot.</h1>
          <p className="text-lg text-dark-400 leading-relaxed">
            Every message goes to the people who build Rivvra. Write to{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-rivvra-400 hover:text-rivvra-300">{SUPPORT_EMAIL}</a>{' '}
            or use the form below. Signed in? The life-ring icon in the top bar sends with your workspace details attached.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 mt-12">
          {/* Form */}
          <div className="lg:col-span-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
            {sent ? (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rivvra-500/15 text-rivvra-300 flex items-center justify-center flex-shrink-0"><Check className="w-4 h-4" /></div>
                <div>
                  <h2 className="text-white font-semibold text-lg mb-1">Message sent</h2>
                  <p className="text-dark-400 text-sm">Reference <span className="font-mono text-dark-200">{sent}</span>. We reply to <span className="text-dark-200">{form.email}</span>.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}</div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-sm font-medium text-dark-300 mb-1.5">Your name <span className="text-red-400">*</span></span>
                    <input className={input} value={form.name} onChange={set('name')} maxLength={100} autoComplete="name" />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-medium text-dark-300 mb-1.5">Email <span className="text-red-400">*</span></span>
                    <input className={input} type="email" value={form.email} onChange={set('email')} maxLength={200} autoComplete="email" placeholder="you@company.com" />
                  </label>
                </div>
                <label className="block">
                  <span className="block text-sm font-medium text-dark-300 mb-1.5">Company</span>
                  <input className={input} value={form.company} onChange={set('company')} maxLength={150} autoComplete="organization" />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-dark-300 mb-1.5">How can we help? <span className="text-red-400">*</span></span>
                  <textarea className={input} rows={6} value={form.message} onChange={set('message')} maxLength={5000} />
                </label>
                {/* Honeypot: hidden from people, filled by bots. */}
                <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                {turnstile.enabled && (
                  <TurnstileWidget siteKey={turnstile.siteKey} onToken={setToken} theme="dark" className="flex justify-start" />
                )}
                <button
                  type="submit"
                  disabled={!canSend || sending}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-rivvra-500 text-dark-950 text-[15px] font-semibold hover:bg-rivvra-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send message
                </button>
              </form>
            )}
          </div>

          {/* Side */}
          <aside className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
              <div className="flex items-center gap-2 text-white font-semibold mb-3"><Clock className="w-4 h-4 text-rivvra-400" /> Response times</div>
              <ul className="space-y-2.5">
                {PLAN_SLAS.map((s) => (
                  <li key={s.plan} className="flex items-baseline gap-3 text-sm">
                    <span className="w-16 flex-shrink-0 text-dark-200 font-medium">{s.plan}</span>
                    <span className="text-dark-400">{s.promise}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-dark-500 mt-4">Business days are Monday to Friday, India time. See <Link to="/pricing" className="text-rivvra-400 hover:text-rivvra-300">pricing</Link> for what each plan includes.</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
              <div className="flex items-center gap-2 text-white font-semibold mb-3"><BookOpen className="w-4 h-4 text-rivvra-400" /> Help yourself first</div>
              <ul className="space-y-2 text-sm text-dark-400">
                <li>Inside the app, the <span className="text-dark-200">?</span> button opens the Knowledge Base for the app you are in.</li>
                <li><span className="text-dark-200">Ask Rivvra</span> (⌘K) answers questions about your own data and has a "Talk to a human" button when it cannot.</li>
                <li>Billing questions: <Link to="/pricing" className="text-rivvra-400 hover:text-rivvra-300">pricing and FAQ</Link>.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-sm text-dark-400">
              <div className="text-white font-semibold mb-2">Security or privacy issue?</div>
              Email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-rivvra-400 hover:text-rivvra-300">{SUPPORT_EMAIL}</a> with "Security" in the subject and we will treat it as urgent. Our <Link to="/privacy" className="text-rivvra-400 hover:text-rivvra-300">privacy policy</Link> explains what we hold and how to request or delete it.
            </div>
          </aside>
        </div>
      </main>
    </MarketingLayout>
  );
}
