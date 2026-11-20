/**
 * "Do not work with" companies (2026-11-20).
 *
 * Owner: a status + team list for clients we don't want to work with. The block
 * is on the whole COMPANY (email domain) — a per-contact status left colleagues
 * and other reps' copies reachable. Only the org owner or an org admin can set
 * or lift it; reps see the reason. Server: /api/outreach/company-blocks.
 */
import { useEffect, useRef, useState } from 'react';
import { Ban } from 'lucide-react';
import api from '../../utils/api';
import { domainOfEmail, refreshCompanyBlocks, useCompanyBlocks, fmtBlockDate } from './companyBlocks';
import { Modal, Button, Field, Input, Textarea, Panel, ConfirmDialog } from '../ds';

const FONT = "'Inter', system-ui, sans-serif";

/**
 * Block a company. `initial` is an email or domain; when `editableDomain` the
 * admin can type one (Settings). Shows what will change before anything does.
 */
export function BlockCompanyDialog({ open, onClose, initial = '', companyName = '', editableDomain = false, onDone }) {
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reasonRef = useRef(null);

  // The modal takes focus when it opens; hand it to the reason box after.
  useEffect(() => {
    if (!open || editableDomain) return undefined;
    const t = setTimeout(() => reasonRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open, editableDomain]);

  useEffect(() => {
    if (!open) return;
    setDomain(initial.includes('@') ? domainOfEmail(initial) : initial);
    setReason('');
    setPreview(null);
    setError('');
  }, [open, initial]);

  // Live preview of what the block touches (debounced while typing).
  useEffect(() => {
    if (!open || !domain.trim()) { setPreview(null); return undefined; }
    let stale = false;
    const t = setTimeout(() => {
      api.previewCompanyBlock(domain.trim())
        .then((res) => { if (!stale) { setPreview(res?.success ? res : null); setError(res?.success ? '' : (res?.error || '')); } })
        .catch((e) => { if (!stale) { setPreview(null); setError(e?.message || 'Could not check this company'); } });
    }, editableDomain ? 400 : 0);
    return () => { stale = true; clearTimeout(t); };
  }, [open, domain, editableDomain]);

  const submit = async () => {
    if (busy || !preview || preview.alreadyBlocked || !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.blockCompany({ domain: preview.domain, reason: reason.trim(), companyName: companyName || preview.companyName });
      if (!res?.success) throw new Error(res?.error || 'Could not block this company');
      await refreshCompanyBlocks();
      onDone?.(res, preview);
      onClose?.();
    } catch (e) {
      setError(e?.message || 'Could not block this company');
    } finally {
      setBusy(false);
    }
  };

  const name = companyName || preview?.companyName || preview?.domain || '';
  const p = preview;
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      size="sm"
      tone="danger"
      icon={<Ban size={16} />}
      title="Don't work with this company"
      sub={name ? `${name}${p?.domain && name !== p.domain ? ` · ${p.domain}` : ''}` : undefined}
      footer={(
        <>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy || !p || p.alreadyBlocked || !reason.trim()}
            onClick={submit}
          >
            {busy ? 'Blocking…' : 'Block company'}
          </Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {editableDomain && (
          <Field label="Company email or domain" htmlFor="cb-domain" hint="e.g. name@company.com or company.com">
            <Input id="cb-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.com" autoFocus />
          </Field>
        )}
        {p && !p.alreadyBlocked && (
          <div style={{ font: `450 12.5px/1.5 ${FONT}`, color: 'var(--fg-2)', background: 'var(--surface-2)', borderRadius: 'var(--r-2)', padding: '10px 12px' }}>
            <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>This will, for everyone in the workspace:</div>
            <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc' }}>
              <li>stop {p.activeSequences} active sequence{p.activeSequences === 1 ? '' : 's'} to anyone at <b>{p.domain}</b></li>
              <li>mark {p.contacts} contact{p.contacts === 1 ? '' : 's'} “Do Not Work With”{p.owners?.length ? ` (owned by ${p.owners.join(', ')})` : ''} and move them to that list</li>
              <li>stop anyone at {p.domain} from being added to a sequence</li>
            </ul>
            <div style={{ marginTop: 6, color: 'var(--fg-4)' }}>You or another admin can unblock it later in Outreach settings. Stopped sequences don’t restart.</div>
          </div>
        )}
        {p?.alreadyBlocked && (
          <div style={{ font: `500 12.5px/1.4 ${FONT}`, color: 'var(--fg-3)' }}>{p.domain} is already blocked.</div>
        )}
        {!(p?.alreadyBlocked) && (
          <Field label="Why don't we work with them?" htmlFor="cb-reason" required hint="Reps see this next to every contact at this company.">
            <Textarea
              id="cb-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Asked us to sign one-sided vendor terms; payment issues in 2025"
              ref={reasonRef}
            />
          </Field>
        )}
        {error && <div role="alert" style={{ font: `500 12px/1.4 ${FONT}`, color: 'var(--danger)' }}>{error}</div>}
      </div>
    </Modal>
  );
}

/**
 * Settings → Outreach: the companies we don't work with. Everyone sees the
 * list (and why); the owner and org admins can add and unblock.
 */
export function CompanyBlocksPanel() {
  const { loaded, canManage, blocks } = useCompanyBlocks();
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // block being unblocked
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const unblock = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await api.unblockCompany(confirm._id);
      if (!res?.success) throw new Error(res?.error || 'Could not unblock');
      await refreshCompanyBlocks();
      setMsg(`${res.domain} unblocked · ${res.contactsRestored} contact${res.contactsRestored === 1 ? '' : 's'} back to their earlier status. Stopped sequences were not restarted.`);
      setConfirm(null);
    } catch (e) {
      setMsg(e?.message || 'Could not unblock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Companies we don't work with"
      icon={<Ban size={14} />}
      actions={canManage ? <Button size="sm" variant="ghost" iconLeft={<Ban size={13} />} onClick={() => setAddOpen(true)}>Block a company</Button> : null}
    >
      <p style={{ font: `400 12px/1.5 ${FONT}`, color: 'var(--fg-4)', margin: '0 0 10px' }}>
        No one at these companies can be added to a sequence, and their contacts sit in the “Do Not Work With” list.
        {canManage ? ' Only the owner and admins can change this list.' : ' Ask the owner or an admin to change it.'}
      </p>
      {!loaded ? (
        <div style={{ font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-4)' }}>Loading…</div>
      ) : blocks.length === 0 ? (
        <div style={{ font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-4)' }}>No companies blocked.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {blocks.map((b) => (
            <div key={b._id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `600 12.5px/1.3 ${FONT}`, color: 'var(--fg)' }}>
                  {b.companyName || b.domain} <span style={{ fontWeight: 450, color: 'var(--fg-4)' }}>· {b.domain} · {b.contacts} contact{b.contacts === 1 ? '' : 's'}</span>
                </div>
                <div style={{ font: `450 12px/1.45 ${FONT}`, color: 'var(--fg-2)', marginTop: 2, wordBreak: 'break-word' }}>{b.reason}</div>
                <div style={{ font: `450 11px/1.4 ${FONT}`, color: 'var(--fg-4)', marginTop: 2 }}>
                  Blocked{b.blockedByName ? ` by ${b.blockedByName}` : ''} on {fmtBlockDate(b.blockedAt)}
                </div>
              </div>
              {canManage && <Button size="sm" variant="ghost" onClick={() => setConfirm(b)}>Unblock</Button>}
            </div>
          ))}
        </div>
      )}
      {msg && <div role="status" style={{ font: `500 12px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 10 }}>{msg}</div>}
      <BlockCompanyDialog open={addOpen} onClose={() => setAddOpen(false)} editableDomain onDone={(res) => setMsg(`Blocked · ${res.stoppedSequences || 0} sequence(s) stopped · ${res.contactsMarked || 0} contact(s) marked`)} />
      <ConfirmDialog
        open={!!confirm}
        title={`Unblock ${confirm?.companyName || confirm?.domain || ''}?`}
        message={`Contacts at ${confirm?.domain || ''} go back to the status and list they had before, and can be added to sequences again. Sequences that were stopped are not restarted.`}
        confirmLabel="Unblock"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={unblock}
      />
    </Panel>
  );
}
