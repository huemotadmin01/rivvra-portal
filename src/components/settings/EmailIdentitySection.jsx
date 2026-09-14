import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Check, RefreshCw, Trash2, AlertTriangle, ShieldCheck, Copy } from 'lucide-react';
import api from '../../utils/api';
import { Button, Input, Callout, Chip, Switch, Field } from '../ds';

/**
 * Settings → General → "Email identity" (owner only).
 *
 * F9: connect the workspace's own sending domain. The API creates it in
 * Resend and hands back the DNS records; the owner adds them at their DNS
 * host and presses Verify. Until Resend reports verified, every email keeps
 * leaving from team@rivvra.com, so a half-finished setup cannot break mail.
 *
 * F10: the "Powered by Rivvra" footer switch.
 *
 * Both are plan-gated server-side (EMAIL_DOMAIN_MIN_PLAN); this section
 * shows the upgrade path rather than a disabled form when the plan does not
 * qualify.
 */

const STATUS_TONE = { verified: 'brand', pending: 'warn', failed: 'danger', not_started: 'neutral' };
const STATUS_LABEL = { verified: 'Verified', pending: 'Waiting for DNS', failed: 'Failed', not_started: 'Not started' };

const font = (w, s, lh = 1.5) => `${w} ${s}px/${lh} 'Inter', system-ui, sans-serif`;

function Header({ title }) {
  return (
    <h3 style={{ font: font(600, 13, 1.3), color: 'var(--fg)', margin: '22px 0 8px', paddingTop: 18, borderTop: '1px solid var(--line)' }}>{title}</h3>
  );
}

function copy(text) {
  try { navigator.clipboard?.writeText(text); } catch { /* ignore */ }
}

export default function EmailIdentitySection({ currentOrg, orgPath }) {
  const slug = currentOrg?.slug;
  const [state, setState] = useState(null); // { emailDomain, poweredByRivvra, eligible, minPlan, fallbackFrom }
  const [loading, setLoading] = useState(true);
  const [domainInput, setDomainInput] = useState('');
  const [busy, setBusy] = useState(''); // 'add' | 'verify' | 'remove' | 'footer'
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!slug) return;
    try {
      const r = await api.getEmailDomain(slug);
      if (r?.success) setState(r);
    } catch (e) {
      setError(e?.message || 'Could not load email settings');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (kind, fn, okMsg) => {
    setBusy(kind); setError(''); setNotice('');
    try {
      const r = await fn();
      if (r?.success) {
        setState((s) => ({ ...(s || {}), ...(r.emailDomain !== undefined ? { emailDomain: r.emailDomain } : {}), ...(typeof r.poweredByRivvra === 'boolean' ? { poweredByRivvra: r.poweredByRivvra } : {}) }));
        if (okMsg) setNotice(okMsg);
      } else {
        setError(r?.error || 'Something went wrong');
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (<><Header title="Email identity" /><p style={{ font: font(400, 12.5), color: 'var(--fg-4)', margin: 0 }}>Loading…</p></>);
  }
  if (!state) {
    return (<><Header title="Email identity" />{error && <Callout tone="danger" icon={<AlertTriangle size={15} />}>{error}</Callout>}</>);
  }

  const { emailDomain, poweredByRivvra, eligible, minPlan, fallbackFrom } = state;
  const planLabel = (minPlan || 'growth').charAt(0).toUpperCase() + (minPlan || 'growth').slice(1);
  const verified = emailDomain?.status === 'verified';

  return (
    <>
      <Header title="Email identity" />
      <p style={{ font: font(400, 11, 1.6), color: 'var(--fg-4)', margin: '0 0 14px' }}>
        Emails Rivvra sends on your behalf — offers, invoices, timesheet reminders, signature requests — currently leave as
        {' '}<strong style={{ color: 'var(--fg-2)' }}>{currentOrg?.name || 'your workspace'} &lt;{verified ? `team@${emailDomain.domain}` : fallbackFrom}&gt;</strong>.
      </p>

      {!eligible && (
        <Callout tone="warn" icon={<ShieldCheck size={15} />} style={{ marginBottom: 14 }}>
          Sending from your own domain and removing the Rivvra footer are part of the <strong>{planLabel}</strong> plan and up.{' '}
          {orgPath && <Link to={orgPath('/upgrade')} style={{ color: 'var(--brand)', fontWeight: 600 }}>See plans</Link>}
        </Callout>
      )}

      {error && <Callout tone="danger" icon={<AlertTriangle size={15} />} style={{ marginBottom: 12 }}>{error}</Callout>}
      {notice && <Callout tone="brand" icon={<Check size={15} />} style={{ marginBottom: 12 }}>{notice}</Callout>}

      {/* ── Sending domain ─────────────────────────────────────────────── */}
      {!emailDomain ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={{ flex: '1 1 260px' }}>
            <Field label="Your sending domain" htmlFor="email-domain" hint="A subdomain such as mail.yourcompany.com keeps your main domain's mail untouched.">
              <Input
                id="email-domain"
                placeholder="mail.yourcompany.com"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                disabled={!eligible || busy === 'add'}
              />
            </Field>
          </div>
          <Button
            size="sm"
            disabled={!eligible || !domainInput.trim() || busy === 'add'}
            onClick={() => run('add', () => api.createEmailDomain(slug, domainInput.trim()), 'Domain added. Create the DNS records below, then press Verify.')}
            iconLeft={busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            Add domain
          </Button>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-2, 10px)', padding: 14, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ font: font(600, 13.5), color: 'var(--fg)' }}>{emailDomain.domain}</span>
            <Chip tone={STATUS_TONE[emailDomain.status] || 'neutral'}>{STATUS_LABEL[emailDomain.status] || emailDomain.status}</Chip>
            <span style={{ flex: 1 }} />
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === 'verify'}
              onClick={() => run('verify', () => api.verifyEmailDomain(slug), verified ? 'Still verified.' : undefined)}
              iconLeft={busy === 'verify' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            >
              {verified ? 'Re-check' : 'Verify'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === 'remove'}
              onClick={() => {
                if (!window.confirm(`Remove ${emailDomain.domain}? Emails go back to ${fallbackFrom} immediately.`)) return;
                run('remove', () => api.deleteEmailDomain(slug), 'Domain removed.');
              }}
              iconLeft={busy === 'remove' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            >
              Remove
            </Button>
          </div>

          {!verified && (
            <p style={{ font: font(400, 11.5, 1.6), color: 'var(--fg-3)', margin: '0 0 10px' }}>
              Add these records at your DNS host, wait a few minutes, then press Verify. Until then mail keeps leaving from {fallbackFrom}.
            </p>
          )}

          {emailDomain.records?.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', font: font(400, 12, 1.4) }}>
                <thead>
                  <tr style={{ color: 'var(--fg-4)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Type</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Name</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Value</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emailDomain.records.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'nowrap' }}>{r.type}{r.priority != null ? ` (${r.priority})` : ''}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {r.name}
                          <button type="button" onClick={() => copy(r.name)} title="Copy" aria-label="Copy name" style={{ border: 'none', background: 'none', color: 'var(--fg-4)', cursor: 'pointer', padding: 0 }}><Copy size={12} /></button>
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6 }}>
                          {r.value}
                          <button type="button" onClick={() => copy(r.value)} title="Copy" aria-label="Copy value" style={{ border: 'none', background: 'none', color: 'var(--fg-4)', cursor: 'pointer', padding: 0, flexShrink: 0 }}><Copy size={12} /></button>
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px' }}><Chip tone={STATUS_TONE[r.status] || 'neutral'}>{STATUS_LABEL[r.status] || r.status}</Chip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Powered-by footer ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <div style={{ flex: 1 }}>
          <p style={{ font: font(500, 12.5, 1.3), color: 'var(--fg)', margin: 0 }}>Show "Powered by Rivvra" in email footers</p>
          <p style={{ font: font(400, 11, 1.5), color: 'var(--fg-4)', margin: '2px 0 0' }}>
            {eligible ? 'Switch it off to send fully white-label emails.' : `Available from the ${planLabel} plan.`}
          </p>
        </div>
        <Switch
          checked={poweredByRivvra !== false}
          disabled={!eligible || busy === 'footer'}
          onChange={(next) => run('footer', () => api.updateEmailBranding(slug, { poweredByRivvra: typeof next === 'boolean' ? next : !!next?.target?.checked }))}
          aria-label="Show Powered by Rivvra in email footers"
        />
      </div>
    </>
  );
}
