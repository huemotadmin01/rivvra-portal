// ============================================================================
// AtsCandidateNewV2.jsx — routed candidate create flow, on ds
// ============================================================================
//
// Route: /org/:slug/ats/candidates/new, behind PageSwitch.
//
// ── The hook ordering is the load-bearing thing here ────────────────────────
// `useState` for `form` and `saving` is declared BEFORE the non-admin early
// return, and legacy says why in a comment worth repeating: putting the gate
// first changes the hook COUNT when the role flips, which produced a
// "Rendered fewer hooks than expected" crash in production in May.
//
// So the slices are drawn around that: hooks first (verbatim, comment
// included), then the ds-themed gate, then the handlers (verbatim). The gate
// sits between two spliced blocks precisely so re-theming it could not move it
// relative to the hooks.
//
// ── Also carried across unchanged ───────────────────────────────────────────
//   • The admin gate itself. Candidate creation is admin-only and this mirrors
//     the list-page button gate, so typing the URL does not bypass it.
//   • `canSubmit = name && email` — both trimmed, so whitespace is not a name.
//   • The payload's `|| undefined` on every optional field. Sending `''` would
//     write empty strings onto the record instead of leaving the fields unset.
//   • The post-create navigation, including its fallback: jump to the new
//     candidate's detail page, or to the list if the API returned no id.
//     `{ replace: true }` on both, so Back does not return to a submitted form.
//
// Not triggered: candidate creation.
// ============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ChevronLeft, Loader2, User } from 'lucide-react';
import { Panel, Button, Field, Input, EmptyState } from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' };

// ── Main Page ──────────────────────────────────────────────────────────────
function AtsCandidateNewV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  usePageTitle('New Candidate');

  const orgSlug = currentOrg?.slug;
  const isAdmin = getAppRole('ats') === 'admin';

  // Hooks must be declared before any conditional return to keep hook
  // ordering stable across renders. The non-admin gate below otherwise
  // changes the hook count when the role flips, producing the
  // "Rendered fewer hooks than expected" prod crash we hit in May.
  const [form, setForm] = useState({ name: '', email: '', phone: '', mobile: '', linkedinProfile: '' });
  const [saving, setSaving] = useState(false);

  // Candidate creation is admin-only; this mirrors the list-page button gate so
  // typing the URL does not bypass it. Note it sits AFTER the hooks above — see
  // the header note on hook ordering.
  if (!isAdmin) {
    return (
      <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 640, margin: '0 auto' }}>
        <Panel>
          <EmptyState
            icon={<User size={28} />}
            tone="warn"
            title="Admin access required"
            actions={(
              <Button variant="ghost" size="sm" onClick={() => navigate(orgPath('/ats/candidates'))}
                iconLeft={<ChevronLeft size={15} />}>
                Back to Candidates
              </Button>
            )}
          >
            Only ATS admins can create new candidate records. Ask an admin to add the candidate,
            then it&apos;ll be available for you to manage.
          </EmptyState>
        </Panel>
      </div>
    );
  }
  const canSubmit = form.name.trim() && form.email.trim();

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        mobile: form.mobile.trim() || undefined,
        linkedinProfile: form.linkedinProfile.trim() || undefined,
      };
      const res = await atsApi.createCandidate(orgSlug, payload);
      if (res?.success) {
        showToast('Candidate created');
        const id = res.candidate?._id || res._id;
        if (id) navigate(orgPath(`/ats/candidates/${id}`), { replace: true });
        else navigate(orgPath('/ats/candidates'), { replace: true });
      } else {
        showToast(res?.error || 'Failed to create candidate', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to create candidate', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 640, margin: '0 auto', display: 'grid', gap: 18 }}>
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} iconLeft={<ChevronLeft size={16} />}>
          Back
        </Button>
      </div>

      <div>
        <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>
          New Candidate
        </h1>
        <p style={{ ...microStyle, marginTop: 4 }}>
          Add the basics here. Description, skills and evaluation fill in on the record page.
        </p>
      </div>

      {/* The form owns its own submit so `required` + Enter behave as legacy. */}
      <form onSubmit={handleSubmit}>
        <Panel title="Contact" icon={<User size={16} />}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Name" htmlFor="cn-name" required>
              <Input id="cn-name" type="text" autoFocus required
                value={form.name} onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g. John Doe" />
            </Field>
            <Field label="Email" htmlFor="cn-email" required>
              <Input id="cn-email" type="email" required
                value={form.email} onChange={(e) => handleChange('email', e.target.value)}
                placeholder="e.g. john@example.com" />
            </Field>
            <Field label="Phone" htmlFor="cn-phone">
              <Input id="cn-phone" type="tel"
                value={form.phone} onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="e.g. +91 98765 43210" />
            </Field>
            <Field label="Mobile" htmlFor="cn-mobile">
              <Input id="cn-mobile" type="tel"
                value={form.mobile} onChange={(e) => handleChange('mobile', e.target.value)}
                placeholder="e.g. +91 98765 43210" />
            </Field>
            <Field label="LinkedIn" htmlFor="cn-linkedin">
              <Input id="cn-linkedin" type="url"
                value={form.linkedinProfile} onChange={(e) => handleChange('linkedinProfile', e.target.value)}
                placeholder="https://linkedin.com/in/…" />
            </Field>
          </div>
        </Panel>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
          {/* Label and disabled predicate are legacy's exactly — the button
              keeps its text while saving and only gains a spinner. */}
          <Button type="submit" disabled={saving || !canSubmit}
            iconLeft={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}>
            Create Candidate
          </Button>
        </div>
      </form>
    </div>
  );
}

export default AtsCandidateNewV2;
