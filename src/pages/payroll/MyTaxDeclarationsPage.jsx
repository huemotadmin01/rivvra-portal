import { useState, useEffect, useRef } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { getMyTax, updateMyTaxRegime, updateMyTaxDeclarations, getMyTaxReport, getMyTaxProofs, uploadTaxProof, deleteTaxProof, downloadTaxProof } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { Shield, ArrowRightLeft, Save, Upload, Trash2, Download, FileText, CheckCircle, Clock, XCircle, AlertCircle, Info } from 'lucide-react';

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
  return m >= 1 && m <= 3 && d <= 15;
}

const SECTION_LABELS = {
  section80C: 'Section 80C — Investments & Savings',
  section80D: 'Section 80D — Health Insurance',
  section80E: 'Section 80E — Education Loan Interest',
  section80G: 'Section 80G — Charitable Donations',
  section24b: 'Section 24(b) — Home Loan Interest',
  hra: 'HRA Exemption',
};

const STATUS_STYLES = {
  provisional: { icon: Clock, color: 'text-amber-400 bg-amber-500/10', label: 'Provisional' },
  pending_approval: { icon: AlertCircle, color: 'text-blue-400 bg-blue-500/10', label: 'Pending Approval' },
  approved: { icon: CheckCircle, color: 'text-green-400 bg-green-500/10', label: 'Approved' },
  rejected: { icon: XCircle, color: 'text-red-400 bg-red-500/10', label: 'Rejected' },
};

export default function MyTaxDeclarationsPage() {
  const { orgSlug } = usePlatform();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxInfo, setTaxInfo] = useState(null);
  const [regime, setRegime] = useState('new');
  const [declarations, setDeclarations] = useState({
    section80C: 0,
    section80D: { self: 0, parents: 0 },
    section80E: 0,
    section80G: 0,
    section24b: 0,
    hra: { rentPaidMonthly: 0, landlordName: '', landlordPan: '', cityType: 'non-metro' },
  });
  const [status, setStatus] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [uploadSection, setUploadSection] = useState('');
  const fy = getCurrentFY();

  useEffect(() => { loadData(); }, [orgSlug]);

  async function loadData() {
    setLoading(true);
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
        setDeclarations({
          section80C: d.section80C || d.section80CTotal || 0,
          section80D: d.section80D || { self: 0, parents: 0 },
          section80E: Number(d.section80E) || 0,
          section80G: Number(d.section80G) || 0,
          section24b: Number(d.section24b) || 0,
          hra: {
            rentPaidMonthly: d.hra?.rentPaidMonthly || Math.round((d.hra?.rentPaidAnnual || 0) / 12),
            landlordName: d.hra?.landlordName || '',
            landlordPan: d.hra?.landlordPan || '',
            cityType: d.hra?.cityType || 'non-metro',
          },
        });
      }

      if (reportRes?.report?.comparison) setComparison(reportRes.report.comparison);
      setStatus(reportRes?.report?.declarationStatus || null);
    } catch (err) {
      if (err.response?.status !== 404) showToast('Failed to load tax info', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegimeSwitch(newRegime) {
    try {
      await updateMyTaxRegime(orgSlug, newRegime);
      setRegime(newRegime);
      showToast(`Switched to ${newRegime === 'old' ? 'Old' : 'New'} Regime`);
      // Reload comparison
      const reportRes = await getMyTaxReport(orgSlug, fy).catch(() => null);
      if (reportRes?.report?.comparison) setComparison(reportRes.report.comparison);
    } catch {
      showToast('Failed to switch regime', 'error');
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const hraRentAnnual = (Number(declarations.hra.rentPaidMonthly) || 0) * 12;
      await updateMyTaxDeclarations(orgSlug, {
        financialYear: fy,
        regime,
        declarations: {
          ...declarations,
          section80C: Math.min(Number(declarations.section80C) || 0, 150000),
          hra: {
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
    try {
      await deleteTaxProof(orgSlug, proofId);
      setProofs(prev => prev.filter(p => p._id !== proofId));
      showToast('Proof deleted');
    } catch {
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
    } catch {
      showToast('Download failed', 'error');
    }
  }

  const updateDecl = (field, value) => setDeclarations(prev => ({ ...prev, [field]: value }));
  const update80D = (field, value) => setDeclarations(prev => ({ ...prev, section80D: { ...prev.section80D, [field]: value } }));
  const updateHRA = (field, value) => setDeclarations(prev => ({ ...prev, hra: { ...prev.hra, [field]: value } }));

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rivvra-500" /></div>;

  const total80D = Object.values(declarations.section80D || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const total80C = Math.min(Number(declarations.section80C) || 0, 150000);
  const totalDeclared = total80C + total80D + (Number(declarations.section80E) || 0) + (Number(declarations.section80G) || 0) + (Number(declarations.section24b) || 0);
  const rentAnnual = (Number(declarations.hra.rentPaidMonthly) || 0) * 12;
  const statusInfo = status ? STATUS_STYLES[status] : null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Shield size={20} className="text-rivvra-400" /> Tax Declarations</h1>
        <p className="text-sm text-dark-400 mt-1">FY {fy} • Declare your tax-saving investments</p>
      </div>

      {/* Status Badge */}
      {statusInfo && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg mb-4 ${statusInfo.color}`}>
          <statusInfo.icon size={16} />
          <span className="text-sm font-medium">{statusInfo.label}</span>
          {status === 'rejected' && <span className="text-xs ml-2 opacity-70">— Please revise and resubmit</span>}
        </div>
      )}

      {/* Regime Selector */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Tax Regime</h2>
            <p className="text-xs text-dark-400 mt-1">Choose the tax regime for TDS calculation</p>
          </div>
          <div className="flex bg-dark-900 rounded-lg p-1">
            <button
              onClick={() => handleRegimeSwitch('new')}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${regime === 'new' ? 'bg-rivvra-600 text-white' : 'text-dark-400 hover:text-white'}`}
            >
              New Regime
            </button>
            <button
              onClick={() => handleRegimeSwitch('old')}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${regime === 'old' ? 'bg-rivvra-600 text-white' : 'text-dark-400 hover:text-white'}`}
            >
              Old Regime
            </button>
          </div>
        </div>

        {/* Regime Comparison */}
        {comparison && (
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-dark-700">
            <div className={`p-4 rounded-lg border ${comparison.betterRegime === 'new' ? 'border-green-500/30 bg-green-500/5' : 'border-dark-600 bg-dark-750'}`}>
              <div className="text-xs text-dark-400 mb-1">New Regime Tax</div>
              <div className="text-lg font-bold text-white">₹{fmt(comparison.newRegime.totalTax)}</div>
              {comparison.betterRegime === 'new' && <span className="text-[10px] text-green-400 font-medium">✓ Saves ₹{fmt(comparison.savings)}</span>}
            </div>
            <div className={`p-4 rounded-lg border ${comparison.betterRegime === 'old' ? 'border-green-500/30 bg-green-500/5' : 'border-dark-600 bg-dark-750'}`}>
              <div className="text-xs text-dark-400 mb-1">Old Regime Tax</div>
              <div className="text-lg font-bold text-white">₹{fmt(comparison.oldRegime.totalTax)}</div>
              {comparison.betterRegime === 'old' && <span className="text-[10px] text-green-400 font-medium">✓ Saves ₹{fmt(comparison.savings)}</span>}
            </div>
          </div>
        )}

        {regime === 'new' && (
          <div className="mt-4 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-3">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-300">Under the <span className="font-semibold text-blue-200">New Tax Regime</span>, most deductions and exemptions are not available. You get lower slab rates with a flat standard deduction.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-5">
              <div>
                <p className="text-[11px] font-semibold text-green-400 mb-1.5">✓ What's included automatically</p>
                <ul className="text-[11px] text-dark-300 space-y-1">
                  <li>• Standard Deduction — ₹75,000</li>
                  <li>• Employer NPS contribution (Sec 80CCD(2)) — up to 14% of Basic</li>
                  <li>• Lower tax slab rates</li>
                  <li>• Tax rebate up to ₹12,75,000 taxable income</li>
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-red-400 mb-1.5">✗ Not available</p>
                <ul className="text-[11px] text-dark-300 space-y-1">
                  <li>• Section 80C — PPF, ELSS, LIC, etc.</li>
                  <li>• Section 80D — Health Insurance</li>
                  <li>• HRA Exemption</li>
                  <li>• Section 24(b) — Home Loan Interest</li>
                  <li>• Section 80E, 80G, and others</li>
                </ul>
              </div>
            </div>
            <p className="text-[10px] text-dark-500 ml-5">No declarations needed — switch to Old Regime if you want to claim deductions.</p>
          </div>
        )}
      </div>

      {/* Declaration Form — Only for Old Regime */}
      {regime === 'old' && (
        <div className="space-y-4 mb-6">
          {/* Section 80C */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-sm font-semibold text-white mb-1">{SECTION_LABELS.section80C}</h3>
            <p className="text-xs text-dark-400 mb-4">EPF, PPF, ELSS, LIC, NSC, Tuition Fees — Max ₹1,50,000</p>
            <div className="flex items-center gap-3">
              <span className="text-sm text-dark-300 w-32">Total 80C Amount</span>
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">₹</span>
                <input type="number" value={declarations.section80C || ''} onChange={e => updateDecl('section80C', e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none" placeholder="0" />
              </div>
              {Number(declarations.section80C) > 150000 && <span className="text-xs text-amber-400">Capped at ₹1,50,000</span>}
            </div>
          </div>

          {/* Section 80D */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-sm font-semibold text-white mb-1">{SECTION_LABELS.section80D}</h3>
            <p className="text-xs text-dark-400 mb-4">Health insurance premiums</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-dark-400 block mb-1">Self & Family</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">₹</span>
                  <input type="number" value={declarations.section80D?.self || ''} onChange={e => update80D('self', e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs text-dark-400 block mb-1">Parents</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">₹</span>
                  <input type="number" value={declarations.section80D?.parents || ''} onChange={e => update80D('parents', e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none" placeholder="0" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 80E, 80G, 24(b) */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Other Deductions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-dark-400 block mb-1">80E — Education Loan Interest</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">₹</span>
                  <input type="number" value={declarations.section80E || ''} onChange={e => updateDecl('section80E', e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs text-dark-400 block mb-1">80G — Charitable Donations</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">₹</span>
                  <input type="number" value={declarations.section80G || ''} onChange={e => updateDecl('section80G', e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs text-dark-400 block mb-1">24(b) — Home Loan Interest</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">₹</span>
                  <input type="number" value={declarations.section24b || ''} onChange={e => updateDecl('section24b', e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none" placeholder="0" />
                </div>
              </div>
            </div>
          </div>

          {/* HRA */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-sm font-semibold text-white mb-1">{SECTION_LABELS.hra}</h3>
            <p className="text-xs text-dark-400 mb-4">For employees paying rent (requires landlord PAN if annual rent &gt; ₹1,00,000)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-dark-400 block mb-1">Monthly Rent</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">₹</span>
                  <input type="number" value={declarations.hra?.rentPaidMonthly || ''} onChange={e => updateHRA('rentPaidMonthly', e.target.value)}
                    className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs text-dark-400 block mb-1">City Type</label>
                <select value={declarations.hra?.cityType || 'non-metro'} onChange={e => updateHRA('cityType', e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none">
                  <option value="metro">Metro (Delhi, Mumbai, Chennai, Kolkata)</option>
                  <option value="non-metro">Non-Metro</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-dark-400 block mb-1">Landlord Name</label>
                <input type="text" value={declarations.hra?.landlordName || ''} onChange={e => updateHRA('landlordName', e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none" placeholder="Full name" />
              </div>
              <div>
                <label className="text-xs text-dark-400 block mb-1">
                  Landlord PAN {rentAnnual > 100000 && <span className="text-red-400">*</span>}
                </label>
                <input type="text" value={declarations.hra?.landlordPan || ''} onChange={e => updateHRA('landlordPan', e.target.value.toUpperCase())}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none" placeholder="ABCDE1234F" maxLength={10} />
                {rentAnnual > 100000 && !declarations.hra?.landlordPan && <p className="text-xs text-red-400 mt-1">Required when annual rent exceeds ₹1,00,000</p>}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Declaration Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-dark-400">Section 80C</span><span className="text-white">₹{fmt(total80C)}</span></div>
              <div className="flex justify-between"><span className="text-dark-400">Section 80D</span><span className="text-white">₹{fmt(total80D)}</span></div>
              {Number(declarations.section80E) > 0 && <div className="flex justify-between"><span className="text-dark-400">Section 80E</span><span className="text-white">₹{fmt(declarations.section80E)}</span></div>}
              {Number(declarations.section80G) > 0 && <div className="flex justify-between"><span className="text-dark-400">Section 80G</span><span className="text-white">₹{fmt(declarations.section80G)}</span></div>}
              {Number(declarations.section24b) > 0 && <div className="flex justify-between"><span className="text-dark-400">Section 24(b)</span><span className="text-white">₹{fmt(declarations.section24b)}</span></div>}
              <div className="flex justify-between border-t border-dark-600 pt-2 font-semibold"><span className="text-white">Total Deductions</span><span className="text-green-400">₹{fmt(totalDeclared)}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Proof Upload Section — Jan-Mar window */}
      {isProofWindow() && regime === 'old' && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-5 mb-6">
          <h3 className="text-sm font-semibold text-white mb-1">Upload Proof Documents</h3>
          <p className="text-xs text-dark-400 mb-4">Submission window: Jan 1 – Mar 15. Upload proofs for each declaration section.</p>

          <div className="flex items-center gap-3 mb-4">
            <select value={uploadSection} onChange={e => setUploadSection(e.target.value)}
              className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-rivvra-500 outline-none">
              <option value="">Select section...</option>
              {Object.entries(SECTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleProofUpload}
              className="hidden" />
            <button onClick={() => uploadSection && fileRef.current?.click()} disabled={!uploadSection || uploading}
              className="flex items-center gap-1.5 px-4 py-2 bg-rivvra-600 hover:bg-rivvra-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
              <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>

          {proofs.length > 0 && (
            <div className="space-y-2">
              {proofs.map(p => (
                <div key={p._id} className="flex items-center justify-between px-4 py-2.5 bg-dark-750 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText size={16} className="text-dark-400" />
                    <div>
                      <div className="text-sm text-white">{p.filename}</div>
                      <div className="text-xs text-dark-400">{SECTION_LABELS[p.section] || p.section} • {Math.round(p.size / 1024)}KB</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${p.status === 'verified' ? 'text-green-400 bg-green-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                      {p.status === 'verified' ? 'Verified' : 'Uploaded'}
                    </span>
                    <button onClick={() => handleDownloadProof(p)} className="p-1 text-dark-400 hover:text-white"><Download size={14} /></button>
                    <button onClick={() => handleDeleteProof(p._id)} className="p-1 text-dark-400 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-rivvra-600 hover:bg-rivvra-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Declarations'}
        </button>
      </div>
    </div>
  );
}
