import { useState, useEffect, useRef } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import {
  getMyTax, updateMyTaxRegime, updateMyTaxDeclarations, getMyTaxReport, getMyTaxProofs,
  uploadTaxProof, deleteTaxProof, downloadTaxProof, getTaxProofUrl, getPublicPlatformSetting,
  SECTION_80C_KEYS, SECTION_80D_KEYS, normalize80CItems, normalize80D,
} from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import { Shield, Save, Upload, Trash2, Download, FileText, Eye, CheckCircle, Clock, XCircle, AlertCircle, Info } from 'lucide-react';
import {
  PageHeader, Panel, Callout, Chip, Button, Field, Input, Select, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// A tax page. It computes the 80C cap, the 80D total, the declared-deduction
// total and the HRA annualisation that the TDS calculation reads, and its
// regime toggle changes which slab table applies. So everything above
// `return (` is spliced in from the legacy file verbatim and diffed
// byte-for-byte, and every ₹ string is asserted present.
//
// Two things NOT changed, both written up in REDESIGN-QA.md:
//   • The New Regime panel hardcodes statutory figures (₹75,000 standard
//     deduction, the ₹12,75,000 rebate ceiling, 14% employer NPS) as prose,
//     while the 80C limit beside it is fetched from a platform setting. The two
//     can drift apart across a finance act; only one of them can be corrected
//     without a deploy.
//   • `isProofWindow()` gates the whole upload block to Jan 1 – Mar 15, so it
//     is unreachable for most of the year, including today.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

function getCurrentFY() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
}

function isProofWindow() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  // Window: Jan 1 – Mar 15 (mid-month cap applies to March only)
  return m === 1 || m === 2 || (m === 3 && d <= 15);
}

const SECTION_LABELS = {
  section80C: 'Section 80C — Investments & Savings',
  section80D: 'Section 80D — Health Insurance',
  section80E: 'Section 80E — Education Loan Interest',
  section80G: 'Section 80G — Charitable Donations',
  section24b: 'Section 24(b) — Home Loan Interest',
  hra: 'HRA Exemption',
};

/** Blank declarations in the canonical shape (see payrollApi.js header note). */
function emptyDeclarations() {
  return {
    section80C: Object.fromEntries(SECTION_80C_KEYS.map(([k]) => [k, 0])),
    section80D: { selfFamily: 0, parents: 0, parentsSenior: 0 },
    section80E: 0,
    section80G: 0,
    section24b: 0,
    hra: { rentPaidMonthly: 0, landlordName: '', landlordPan: '', cityType: 'non-metro' },
  };
}

const sumItems = (obj) => Object.values(obj || {}).reduce((s, v) => s + (Number(v) || 0), 0);

/** Icon and label carried from legacy's STATUS_STYLES; the colour class becomes
 *  a Chip/Callout tone. `pending_approval` was blue, which has no Chip tone —
 *  `info` is its direct equivalent. */
const STATUS_STYLES = {
  provisional: { icon: Clock, tone: 'warn', label: 'Provisional' },
  pending_approval: { icon: AlertCircle, tone: 'info', label: 'Pending Approval' },
  approved: { icon: CheckCircle, tone: 'brand', label: 'Approved' },
  rejected: { icon: XCircle, tone: 'danger', label: 'Rejected' },
};

/** ₹-prefixed number input. Legacy repeated this markup at every money field;
 *  the input's own attributes (type, min, value, onChange) are unchanged. */
function RupeeInput({ value, onChange, min, placeholder = '0', align = 'left', ...rest }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
        font: "400 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', pointerEvents: 'none',
      }}>₹</span>
      <Input
        type="number"
        min={min}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ paddingLeft: 26, textAlign: align }}
        {...rest}
      />
    </div>
  );
}

export default function MyTaxDeclarationsPageV2() {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxInfo, setTaxInfo] = useState(null);
  const [regime, setRegime] = useState('new');
  const [declarations, setDeclarations] = useState(emptyDeclarations);
  // Whatever the server currently has, so a save merges instead of replacing
  // (the backend swaps `declarations` out wholesale).
  const [storedDecl, setStoredDecl] = useState(null);
  const [status, setStatus] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const fileRef = useRef(null);
  const [uploadSection, setUploadSection] = useState('');
  const [sectionLabels, setSectionLabels] = useState(SECTION_LABELS);
  const [section80CLimit, setSection80CLimit] = useState(150000);
  // Why the page can't be used at all: 'not_linked' (404), 'not_india'
  // (403 NON_INDIA_COMPANY / 400 no active company) or 'error'. Previously only
  // a 404 was handled — a 403 toasted and then fell through to the full India
  // regime/80C/HRA form with all-zero state, and Save then 403'd too.
  const [blockReason, setBlockReason] = useState(null);
  const [switchingRegime, setSwitchingRegime] = useState(false);
  const fy = getCurrentFY();

  // Fetch dynamic tax section config
  useEffect(() => {
    getPublicPlatformSetting('tax_declaration_sections')
      .then(res => {
        if (res?.sections) {
          const labels = {};
          res.sections.forEach(s => { labels[s.key] = s.label; });
          if (Object.keys(labels).length) setSectionLabels(prev => ({ ...prev, ...labels }));
        }
        if (res?.limits?.section80C) setSection80CLimit(res.limits.section80C);
      })
      .catch(() => {});
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [orgSlug, currentCompany?._id]);

  async function loadData() {
    setLoading(true);
    setBlockReason(null);
    setTaxInfo(null);
    setRegime('new');
    setProofs([]);
    setComparison(null);
    setStatus(null);
    setStoredDecl(null);
    setDeclarations(emptyDeclarations());
    try {
      const [taxRes, reportRes, proofsRes] = await Promise.all([
        getMyTax(orgSlug),
        getMyTaxReport(orgSlug, fy).catch(() => null),
        getMyTaxProofs(orgSlug, fy).catch(() => ({ proofs: [] })),
      ]);

      setTaxInfo(taxRes.tax);
      setRegime(taxRes.tax?.regime || 'new');
      setProofs(proofsRes.proofs || []);

      if (taxRes.tax?.declarations) {
        const d = taxRes.tax.declarations;
        setStoredDecl(d);
        setDeclarations({
          // Shared normalizers, so a document written by the admin page (80C as
          // an itemized object, 80D keyed selfFamily/parentsSenior) renders
          // correctly instead of putting an object into a number input (₹NaN).
          section80C: normalize80CItems(d),
          section80D: normalize80D(d),
          section80E: Number(d.section80E) || 0,
          section80G: Number(d.section80G) || 0,
          section24b: Number(d.section24b) || 0,
          hra: {
            rentPaidMonthly: Number(d.hra?.rentPaidMonthly) || Math.round((Number(d.hra?.rentPaidAnnual) || 0) / 12),
            landlordName: d.hra?.landlordName || '',
            landlordPan: d.hra?.landlordPan || '',
            cityType: d.hra?.cityType || 'non-metro',
          },
        });
      }

      if (reportRes?.report?.comparison) setComparison(reportRes.report.comparison);
      setStatus(reportRes?.report?.declarationStatus || null);
    } catch (err) {
      const st = err.response?.status;
      const code = err.response?.data?.code;
      if (st === 404) {
        setBlockReason('not_linked');
      } else if (st === 403 || code === 'NON_INDIA_COMPANY' || st === 400) {
        setBlockReason('not_india');
      } else {
        setBlockReason('error');
        showToast('Failed to load tax info', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegimeSwitch(newRegime) {
    if (status === 'approved') return;
    // In-flight guard — a double-click used to fire two PUTs plus two report
    // reloads that could resolve out of order.
    if (switchingRegime) return;
    setSwitchingRegime(true);
    try {
      await updateMyTaxRegime(orgSlug, newRegime);
      setRegime(newRegime);
      showToast(`Switched to ${newRegime === 'old' ? 'Old' : 'New'} Regime`);
      // Reload comparison
      const reportRes = await getMyTaxReport(orgSlug, fy).catch(() => null);
      if (reportRes?.report?.comparison) setComparison(reportRes.report.comparison);
    } catch (err) {
      showToast('Failed to switch regime', 'error');
    } finally {
      setSwitchingRegime(false);
    }
  }

  async function handleSave() {
    if (status === 'approved') return;
    setSaving(true);
    try {
      const hraRentAnnual = (Number(declarations.hra.rentPaidMonthly) || 0) * 12;
      const items = declarations.section80C;
      await updateMyTaxDeclarations(orgSlug, {
        financialYear: fy,
        regime,
        declarations: {
          ...(storedDecl || {}),
          ...declarations,
          // `section80C` goes out as a capped SCALAR because the ESS backend
          // route (payroll.js ~4037) computes section80CTotal via
          // Number(section80C). `section80CItems` carries the canonical
          // breakdown that both this page and the admin page read.
          section80C: Math.min(sumItems(items), section80CLimit),
          section80CItems: items,
          section80D: declarations.section80D,
          hra: {
            ...(storedDecl?.hra || {}),
            ...declarations.hra,
            rentPaidAnnual: hraRentAnnual,
          },
        },
      });
      showToast('Declarations saved');
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleProofUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !uploadSection) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('File is too large — maximum size is 10MB', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('section', uploadSection);
      fd.append('financialYear', fy);
      await uploadTaxProof(orgSlug, fd);
      showToast('Proof uploaded');
      setUploadSection('');
      const proofsRes = await getMyTaxProofs(orgSlug, fy);
      setProofs(proofsRes.proofs || []);
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDeleteProof(proofId) {
    if (!window.confirm('Delete this proof document? This cannot be undone.')) return;
    try {
      await deleteTaxProof(orgSlug, proofId);
      setProofs(prev => prev.filter(p => p._id !== proofId));
      showToast('Proof deleted');
    } catch (err) {
      showToast('Delete failed', 'error');
    }
  }

  async function handleDownloadProof(proof) {
    try {
      const blob = await downloadTaxProof(orgSlug, proof._id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = proof.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Download failed', 'error');
    }
  }

  const updateDecl = (field, value) => setDeclarations(prev => ({ ...prev, [field]: value }));
  const update80C = (field, value) => setDeclarations(prev => ({ ...prev, section80C: { ...prev.section80C, [field]: value } }));
  const update80D = (field, value) => setDeclarations(prev => ({ ...prev, section80D: { ...prev.section80D, [field]: value } }));
  const updateHRA = (field, value) => setDeclarations(prev => ({ ...prev, hra: { ...prev.hra, [field]: value } }));

  if (loading) return <PageSpinner label="Loading tax information…" />;

  if (blockReason) {
    const BLOCK_COPY = {
      not_linked: "Your account isn't linked to an employee record — contact HR.",
      not_india: 'Tax declarations (Section 80C, HRA, old/new regime) apply to India-registered companies only. Your active company is outside India, so there is nothing to declare here.',
      error: "We couldn't load your tax information. Please try again.",
    };
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <PageHeader title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Shield size={18} style={{ color: 'var(--brand-ink)' }} /> Tax Declarations</span>} />
        <Panel>
          <EmptyState
            icon={<Shield size={22} />}
            title="Nothing to declare"
            actions={blockReason === 'error' ? <Button size="sm" onClick={loadData}>Retry</Button> : undefined}
          >
            {BLOCK_COPY[blockReason]}
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const isApproved = status === 'approved';
  const total80D = sumItems(declarations.section80D);
  const total80C = Math.min(sumItems(declarations.section80C), section80CLimit);
  const totalDeclared = total80C + total80D + (Number(declarations.section80E) || 0) + (Number(declarations.section80G) || 0) + (Number(declarations.section24b) || 0);
  const rentAnnual = (Number(declarations.hra.rentPaidMonthly) || 0) * 12;
  const statusInfo = status ? STATUS_STYLES[status] : null;

  const row = (label, value, opts = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, ...(opts.style || {}) }}>
      <span style={{ color: opts.strong ? 'var(--fg)' : 'var(--fg-3)' }}>{label}</span>
      <span style={{
        color: opts.accent || 'var(--fg)', fontWeight: opts.strong ? 600 : 400,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Shield size={18} style={{ color: 'var(--brand-ink)' }} /> Tax Declarations</span>}
        sub={`FY ${fy} • Declare your tax-saving investments`}
      />

      <div style={{ display: 'grid', gap: 14 }}>

        {/* Status */}
        {statusInfo && (
          <Callout tone={statusInfo.tone} icon={<statusInfo.icon size={16} />}>
            <strong>{statusInfo.label}</strong>
            {status === 'rejected' && <span style={{ opacity: 0.8 }}> — Please revise and resubmit</span>}
            {isApproved && <span style={{ opacity: 0.8 }}> — Approved by admin. Declarations are locked; contact HR to amend.</span>}
          </Callout>
        )}

        {/* ── Regime ── */}
        <Panel>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>Tax Regime</div>
              <div style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 3 }}>
                Choose the tax regime for TDS calculation
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 'var(--r-2)', padding: 3 }}>
              {[['new', 'New Regime'], ['old', 'Old Regime']].map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={regime === key ? 'primary' : 'ghost'}
                  onClick={() => handleRegimeSwitch(key)}
                  disabled={isApproved || switchingRegime}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Regime comparison — money, strings byte-identical to legacy */}
          {comparison && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12,
              marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line-2)',
            }}>
              {[
                ['new', 'New Regime Tax', comparison.newRegime.totalTax],
                ['old', 'Old Regime Tax', comparison.oldRegime.totalTax],
              ].map(([key, label, amount]) => {
                const better = comparison.betterRegime === key;
                return (
                  <div key={key} style={{
                    padding: 14, borderRadius: 'var(--r-2)',
                    border: `1px solid ${better ? 'var(--brand-line)' : 'var(--line-2)'}`,
                    background: better ? 'var(--brand-soft)' : 'var(--surface-2)',
                  }}>
                    <div style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 6 }}>{label}</div>
                    <div style={{ font: "700 17px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                      ₹{fmt(amount)}
                    </div>
                    {better && (
                      <span style={{ font: "600 10px/1.3 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)', display: 'inline-block', marginTop: 6 }}>
                        ✓ Saves ₹{fmt(comparison.savings)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {regime === 'new' && (
            <div style={{ marginTop: 16 }}>
              <Callout tone="info" icon={<Info size={15} />}>
                Under the <strong>New Tax Regime</strong>, most deductions and exemptions are not available. You get lower slab rates with a flat standard deduction.
              </Callout>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 12, paddingLeft: 4 }}>
                <div>
                  <p style={{ font: "600 11px/1 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)', margin: '0 0 8px' }}>
                    ✓ What's included automatically
                  </p>
                  <ul style={{ font: "400 11px/1.7 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0, paddingLeft: 14 }}>
                    <li>Standard Deduction — ₹75,000</li>
                    <li>Employer NPS contribution (Sec 80CCD(2)) — up to 14% of Basic</li>
                    <li>Lower tax slab rates</li>
                    <li>Tax rebate up to ₹12,75,000 taxable income</li>
                  </ul>
                </div>
                <div>
                  <p style={{ font: "600 11px/1 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: '0 0 8px' }}>
                    ✗ Not available
                  </p>
                  <ul style={{ font: "400 11px/1.7 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0, paddingLeft: 14 }}>
                    <li>Section 80C — PPF, ELSS, LIC, etc.</li>
                    <li>Section 80D — Health Insurance</li>
                    <li>HRA Exemption</li>
                    <li>Section 24(b) — Home Loan Interest</li>
                    <li>Section 80E, 80G, and others</li>
                  </ul>
                </div>
              </div>
              <p style={{ font: "400 10.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '10px 0 0 4px' }}>
                No declarations needed — switch to Old Regime if you want to claim deductions.
              </p>
            </div>
          )}
        </Panel>

        {/* ── Declaration form — Old Regime only ── */}
        {regime === 'old' && (
          <fieldset disabled={isApproved} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 14, opacity: isApproved ? 0.75 : 1 }}>

            {/* 80C */}
            <Panel>
              <div style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{sectionLabels.section80C}</div>
              <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 14px' }}>
                Break your investments down by instrument — Max ₹{fmt(section80CLimit)} in total
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px 24px' }}>
                {SECTION_80C_KEYS.map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <label htmlFor={`c80-${key}`} style={{ font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', flex: 1 }}>{label}</label>
                    <div style={{ width: 144 }}>
                      <RupeeInput id={`c80-${key}`} min="0" align="right"
                        value={declarations.section80C?.[key] || ''} onChange={e => update80C(key, e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line-2)',
                font: "500 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
              }}>
                <span>Total 80C (capped)</span>
                <span style={{ fontWeight: 700, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>₹{fmt(total80C)}</span>
              </div>
              {sumItems(declarations.section80C) > section80CLimit && (
                <p style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--warn-ink)', margin: '6px 0 0', textAlign: 'right' }}>
                  Capped at ₹{fmt(section80CLimit)}
                </p>
              )}
            </Panel>

            {/* 80D */}
            <Panel>
              <div style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{sectionLabels.section80D}</div>
              <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 14px' }}>Health insurance premiums</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                {SECTION_80D_KEYS.map(([key, label]) => (
                  <Field key={key} label={label} htmlFor={`d80-${key}`}>
                    <RupeeInput id={`d80-${key}`} min="0"
                      value={declarations.section80D?.[key] || ''} onChange={e => update80D(key, e.target.value)} />
                  </Field>
                ))}
              </div>
            </Panel>

            {/* 80E / 80G / 24(b) */}
            <Panel>
              <div style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 14 }}>Other Deductions</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <Field label="80E — Education Loan Interest" htmlFor="d-80e">
                  <RupeeInput id="d-80e" value={declarations.section80E || ''} onChange={e => updateDecl('section80E', e.target.value)} />
                </Field>
                <Field label="80G — Charitable Donations" htmlFor="d-80g">
                  <RupeeInput id="d-80g" value={declarations.section80G || ''} onChange={e => updateDecl('section80G', e.target.value)} />
                </Field>
                <Field label="24(b) — Home Loan Interest" htmlFor="d-24b">
                  <RupeeInput id="d-24b" value={declarations.section24b || ''} onChange={e => updateDecl('section24b', e.target.value)} />
                </Field>
              </div>
            </Panel>

            {/* HRA */}
            <Panel>
              <div style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{sectionLabels.hra}</div>
              <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 14px' }}>
                For employees paying rent (requires landlord PAN if annual rent &gt; ₹1,00,000)
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <Field label="Monthly Rent" htmlFor="hra-rent">
                  <RupeeInput id="hra-rent" value={declarations.hra?.rentPaidMonthly || ''} onChange={e => updateHRA('rentPaidMonthly', e.target.value)} />
                </Field>
                <Field label="City Type" htmlFor="hra-city">
                  <Select id="hra-city" value={declarations.hra?.cityType || 'non-metro'} onChange={e => updateHRA('cityType', e.target.value)}>
                    <option value="metro">Metro (Delhi, Mumbai, Chennai, Kolkata)</option>
                    <option value="non-metro">Non-Metro</option>
                  </Select>
                </Field>
                <Field label="Landlord Name" htmlFor="hra-name">
                  <Input id="hra-name" type="text" placeholder="Full name"
                    value={declarations.hra?.landlordName || ''} onChange={e => updateHRA('landlordName', e.target.value)} />
                </Field>
                <Field
                  label={<>Landlord PAN {rentAnnual > 100000 && <span style={{ color: 'var(--danger)' }}>*</span>}</>}
                  htmlFor="hra-pan"
                  error={rentAnnual > 100000 && !declarations.hra?.landlordPan ? 'Required when annual rent exceeds ₹1,00,000' : undefined}
                >
                  <Input id="hra-pan" type="text" placeholder="ABCDE1234F" maxLength={10}
                    value={declarations.hra?.landlordPan || ''} onChange={e => updateHRA('landlordPan', e.target.value.toUpperCase())} />
                </Field>
              </div>
            </Panel>

            {/* Summary */}
            <Panel>
              <div style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 12 }}>Declaration Summary</div>
              <div style={{ display: 'grid', gap: 8, font: "400 13px/1.4 'Inter', system-ui, sans-serif" }}>
                {row('Section 80C', `₹${fmt(total80C)}`)}
                {row('Section 80D', `₹${fmt(total80D)}`)}
                {Number(declarations.section80E) > 0 && row('Section 80E', `₹${fmt(declarations.section80E)}`)}
                {Number(declarations.section80G) > 0 && row('Section 80G', `₹${fmt(declarations.section80G)}`)}
                {Number(declarations.section24b) > 0 && row('Section 24(b)', `₹${fmt(declarations.section24b)}`)}
                {row('Total Deductions', `₹${fmt(totalDeclared)}`, {
                  strong: true, accent: 'var(--brand-ink)',
                  style: { borderTop: '1px solid var(--line-2)', paddingTop: 8 },
                })}
              </div>
            </Panel>
          </fieldset>
        )}

        {/* ── Proof upload — Jan 1 – Mar 15 only ── */}
        {isProofWindow() && regime === 'old' && (
          <Panel>
            <div style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>Upload Proof Documents</div>
            <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 14px' }}>
              Submission window: Jan 1 – Mar 15. Upload proofs for each declaration section.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Select value={uploadSection} onChange={e => setUploadSection(e.target.value)} aria-label="Proof section" style={{ maxWidth: 320 }}>
                <option value="">Select section...</option>
                {Object.entries(sectionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleProofUpload} style={{ display: 'none' }} />
              <Button size="sm" onClick={() => uploadSection && fileRef.current?.click()} disabled={!uploadSection || uploading} iconLeft={<Upload size={14} />}>
                {uploading ? 'Uploading...' : 'Upload File'}
              </Button>
            </div>

            {proofs.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                {proofs.map(p => {
                  const canPreview = p.mimeType?.startsWith('image/') || p.mimeType === 'application/pdf';
                  return (
                    <div
                      key={p._id}
                      onClick={() => canPreview && setPreviewDoc(p)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        padding: '10px 14px', borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
                        cursor: canPreview ? 'pointer' : 'default',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <FileText size={16} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ font: "500 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.filename}
                          </div>
                          <div style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 2 }}>
                            {sectionLabels[p.section] || p.section} • {Math.round(p.size / 1024)}KB
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <Chip tone={p.status === 'verified' ? 'brand' : 'warn'}>
                          {p.status === 'verified' ? 'Verified' : 'Uploaded'}
                        </Chip>
                        {canPreview && (
                          <Button variant="ghost" size="sm" aria-label={`Preview ${p.filename}`}
                            onClick={(e) => { e.stopPropagation(); setPreviewDoc(p); }} iconLeft={<Eye size={14} />} />
                        )}
                        <Button variant="ghost" size="sm" aria-label={`Download ${p.filename}`}
                          onClick={(e) => { e.stopPropagation(); handleDownloadProof(p); }} iconLeft={<Download size={14} />} />
                        {p.status !== 'verified' && (
                          <Button variant="ghost" size="sm" aria-label={`Delete ${p.filename}`}
                            onClick={(e) => { e.stopPropagation(); handleDeleteProof(p._id); }} iconLeft={<Trash2 size={14} />} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        )}

        {/* ── Save ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <Button onClick={handleSave} disabled={saving || isApproved} iconLeft={<Save size={15} />}>
            {saving ? 'Saving...' : 'Save Declarations'}
          </Button>
          {isApproved && (
            <p style={{ font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
              Approved by admin — contact HR to amend.
            </p>
          )}
        </div>
      </div>

      {previewDoc && (
        <DocumentPreviewModal
          filename={previewDoc.filename}
          mimeType={previewDoc.mimeType}
          fetchUrl={getTaxProofUrl(orgSlug, previewDoc._id)}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}
