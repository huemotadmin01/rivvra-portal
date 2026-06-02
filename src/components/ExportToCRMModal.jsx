import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Upload, RefreshCw, CheckCircle, AlertTriangle, Pencil, Sparkles, Briefcase, ExternalLink, UserCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import api from '../utils/api';
import crmApi from '../utils/crmApi';

// 2026-05-17 OUTREACH-EXPORT: Odoo path removed (Odoo is being shut down on
// the Huemot cutover). Modal now opens directly to the Rivvra form — no
// "choose destination" step. State machine: form → dup-warn? → exporting →
// success | error.
function ExportToCRMModal({ isOpen, onClose, lead, onSuccess }) {
  const { user } = useAuth();
  const { orgSlug, hasAppAccess } = useOrg();
  // Paid outreach access is granted at the org level (enabledApps → membership
  // appAccess.outreach), so org-provisioned users have no legacy user.plan.
  // Treat org outreach access as Pro; keep the legacy plan check as a fallback.
  const isPro = hasAppAccess('outreach') || user?.plan === 'pro' || user?.plan === 'premium';

  const [step, setStep] = useState('form');
  const [profileType, setProfileType] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [expectedRole, setExpectedRole] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [requirementType, setRequirementType] = useState('');
  const [exportResult, setExportResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [duplicateOpps, setDuplicateOpps] = useState([]);
  const [reassigning, setReassigning] = useState(false);
  const [checkingDup, setCheckingDup] = useState(false);
  // Preflight result for CRM record-existence: { companyMatch, contactMatch }
  // Drives the soft-warn banner shown above the form fields — never blocks
  // submit, just transparency on what will happen on convert.
  const [preflight, setPreflight] = useState({ companyMatch: null, contactMatch: null });

  // Reset state when modal opens with a new lead
  useEffect(() => {
    if (isOpen && lead) {
      setStep('form');
      setProfileType(lead.profileType || '');
      setName(lead.name || '');
      setCompany(lead.company || lead.companyName || '');
      setEmail(lead.email || '');
      setPhone(lead.phone || '');
      setContactTitle(lead.title || lead.headline || lead.currentTitle || '');
      setExpectedRole('');
      setRequirementType('');
      setExportResult(null);
      setErrorMessage('');
      setDuplicateOpps([]);
      setReassigning(false);
      setCheckingDup(false);
      setPreflight({ companyMatch: null, contactMatch: null });
    }
  }, [isOpen, lead]);

  // Debounced preflight: tells us if the company / POC already exists in
  // CRM. Fires whenever the user changes name, company, or email; the
  // latest field values win.
  useEffect(() => {
    if (!isOpen || step !== 'form') return;
    if (!orgSlug) return;
    const co = company.trim();
    const em = email.trim();
    const nm = name.trim();
    if (!co && !em && !nm) {
      setPreflight({ companyMatch: null, contactMatch: null });
      return;
    }
    const t = setTimeout(() => {
      crmApi.preflightConvertLead(orgSlug, {
        email: em || undefined,
        contactName: nm || undefined,
        companyName: co || undefined,
      }).then(res => {
        if (res?.success) {
          setPreflight({
            companyMatch: res.companyMatch || null,
            contactMatch: res.contactMatch || null,
          });
        }
      }).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [isOpen, step, orgSlug, company, email, name]);

  if (!isOpen || !lead) return null;

  // Defence-in-depth: block free users from exporting
  if (!isPro) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Work in Progress</h2>
          <p className="text-dark-400 mb-6">
            <span className="text-white font-medium">Export to CRM</span> is currently being built and will be available soon.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-dark-950 font-semibold hover:from-amber-400 hover:to-orange-400 transition-all"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  const handleClose = () => {
    setStep('form');
    onClose();
  };

  // Cross-owner detection: the lead's owner (lead.userId — set by Outreach
  // when the contact was first sourced) vs the user clicking Export.
  const leadOwnerId = lead?.userId || null;
  const leadOwnerName = lead?.ownerName || lead?.sourcedBy || lead?.userEmail || null;
  const currentUserId = user?._id || user?.id || null;
  // When the CRM company or POC already exists, the new opp will be owned
  // by that account's salesperson (account-owner-first resolver), not by
  // the lead owner. In that case, suppress the "reassign lead to me first"
  // nudge — reassigning the lead won't change the opp ownership anymore.
  const hasAccountOwner = !!(preflight.contactMatch?.salespersonId || preflight.companyMatch?.salespersonId);
  const isCrossOwner = !hasAccountOwner && !!(leadOwnerId && currentUserId && String(leadOwnerId) !== String(currentUserId));

  // Two-phase: pre-flight checks for an existing opportunity; if found,
  // routes to a warning step. The user can either open the existing opp,
  // proceed anyway, or cancel.
  const performRivvraExport = async () => {
    setStep('exporting');
    try {
      const convertData = {
        contactName: name.trim(),
        companyName: company.trim(),
        contactEmail: email.trim() || undefined,
        contactPhone: phone.trim() || undefined,
        contactJobTitle: contactTitle.trim() || undefined,
        expectedRole: expectedRole.trim() || undefined,
        requirementType: requirementType || undefined,
        linkedinUrl: lead.linkedinUrl || undefined,
        clientType: profileType === 'client' ? 'existing' : 'new',
        notes: lead.notes?.length ? lead.notes.map(n => typeof n === 'string' ? n : n.text || '').join('\n') : undefined,
        opportunityName: `${name.trim()} — ${company.trim() || 'Opportunity'}`,
        leadId: lead._id, // Backend will atomically update lead status to 'converted'
      };

      const result = await crmApi.convertLead(orgSlug, convertData);

      if (result.success) {
        onSuccess?.(lead._id);
        setExportResult({
          message: 'Lead converted — opportunity, company & contact created.',
          opportunityId: result.opportunity?._id,
          opportunityName: result.opportunity?.name,
          individualContact: result.individualContact,
          companyContact: result.companyContact,
        });
        setStep('success');
      } else {
        setErrorMessage(result.error || 'Export failed');
        setStep('error');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Export failed. Please try again.');
      setStep('error');
    }
  };

  const handleRivvraExportClick = async () => {
    setCheckingDup(true);
    try {
      const dupRes = await crmApi.checkDuplicateOpportunities(orgSlug, {
        email: email.trim() || undefined,
        contactName: name.trim() || undefined,
        companyName: company.trim() || undefined,
      });
      const matches = dupRes?.opportunities || [];
      if (matches.length > 0) {
        setDuplicateOpps(matches);
        setStep('dup-warn');
        return;
      }
    } catch {
      // Non-fatal: if the pre-flight fails, fall through to export. Worst
      // case the user gets a duplicate they could clean up after.
    } finally {
      setCheckingDup(false);
    }
    await performRivvraExport();
  };

  const handleReassignAndExport = async () => {
    if (!currentUserId) return;
    setReassigning(true);
    try {
      const res = await api.assignLeadOwner(lead._id, currentUserId);
      if (!res?.success) throw new Error(res?.error || 'Reassign failed');
      lead.userId = currentUserId;
      lead.ownerName = user?.name || user?.fullName || user?.email || 'You';
    } catch (err) {
      setReassigning(false);
      const msg = err?.message || '';
      if (/admin|team lead|permission|403/i.test(msg)) {
        setErrorMessage('Only admins or team leads can reassign leads. Ask your admin, or click "Export anyway" to keep the original owner.');
      } else {
        setErrorMessage(msg || 'Failed to reassign lead.');
      }
      setStep('error');
      return;
    }
    setReassigning(false);
    await handleRivvraExportClick();
  };

  // ═══════════════════════════════════════════════════════════════════════
  // STEP: Form
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 'form') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
        {/* 2026-05-17 OUTREACH-EXPORT: cap card at 90vh and make the body
            scrollable. Sticky header keeps title + close button anchored;
            sticky footer keeps the action buttons visible while the user
            scrolls through the fields. */}
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
          {/* Sticky header */}
          <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-dark-700/60 flex-shrink-0">
            <div className="w-12 h-12 rounded-xl bg-rivvra-500/10 flex items-center justify-center flex-shrink-0">
              <Upload className="w-6 h-6 text-rivvra-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white">Export to CRM</h2>
              <p className="text-dark-400 text-sm">Create an opportunity from this contact</p>
            </div>
            <button onClick={handleClose} aria-label="Close" className="p-1 text-dark-400 hover:text-white transition-colors flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="px-6 py-5 overflow-y-auto flex-1">

            {/* Already converted warning */}
            {lead.outreachStatus === 'converted' && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-sm text-amber-300">This lead was already exported. A new opportunity will be created.</span>
              </div>
            )}

            {/* CRM preflight banner — surfaces when the company or POC
                already exists in CRM. Soft warn only — conversion still
                proceeds, reusing the existing records and assigning the
                new opp to the account-owner. */}
            {(preflight.contactMatch || preflight.companyMatch) && (
              <div className="mb-4 px-3 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
                  <div className="text-xs leading-relaxed text-amber-200/90">
                    {preflight.contactMatch ? (
                      <>
                        <span className="font-medium text-amber-300">
                          {preflight.contactMatch.name}
                        </span>
                        {preflight.contactMatch.parentCompanyName && (
                          <> from <span className="font-medium text-amber-300">{preflight.contactMatch.parentCompanyName}</span></>
                        )}
                        {' '}is already a CRM contact. The new opportunity will be linked to the existing record
                        {preflight.contactMatch.salespersonName && (
                          <>, owned by <span className="font-medium text-amber-300">{preflight.contactMatch.salespersonName}</span></>
                        )}
                        .
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-amber-300">{preflight.companyMatch.name}</span>
                        {' '}is already a CRM customer. The new opportunity will be assigned to{' '}
                        {preflight.companyMatch.salespersonName ? (
                          <span className="font-medium text-amber-300">{preflight.companyMatch.salespersonName}</span>
                        ) : (
                          <span>the account owner</span>
                        )}
                        .
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Lead owner banner */}
            {leadOwnerName && (
              <div className={`flex items-start gap-2 mb-4 px-3 py-2 border rounded-lg ${
                isCrossOwner ? 'bg-blue-500/5 border-blue-500/20' : 'bg-dark-800 border-dark-600'
              }`}>
                <Users className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isCrossOwner ? 'text-blue-400' : 'text-dark-400'}`} />
                <div className="text-xs leading-relaxed">
                  <span className="text-dark-400">Lead owner: </span>
                  <span className="text-white font-medium">{leadOwnerName}</span>
                  {isCrossOwner && (
                    <span className="block text-blue-300 mt-0.5">
                      The new opportunity will be assigned to {leadOwnerName.split(' ')[0]}.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Contact Name <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 bg-dark-800 border border-dark-600 rounded-xl text-white focus:outline-none focus:border-rivvra-500" />
                <Pencil className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              </div>
            </div>

            {/* Company */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Company <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 bg-dark-800 border border-dark-600 rounded-xl text-white focus:outline-none focus:border-rivvra-500" />
                <Pencil className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              </div>
            </div>

            {/* Contact Title */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Contact Title <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input type="text" value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="e.g., VP Engineering"
                  className="w-full px-3 py-2.5 pr-10 bg-dark-800 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500" />
                <Pencil className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              </div>
            </div>

            {/* Email */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">Email</label>
              <div className="relative">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="No email found"
                  className="w-full px-3 py-2.5 pr-10 bg-dark-800 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500" />
                <Pencil className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              </div>
            </div>

            {/* Expected Role */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">Expected Role</label>
              <p className="text-[10px] text-dark-500 -mt-1 mb-1.5">Used as Job Position name when converting to ATS</p>
              <div className="relative">
                <input type="text" value={expectedRole} onChange={(e) => setExpectedRole(e.target.value)} placeholder="e.g., Backend Developer"
                  className="w-full px-3 py-2.5 pr-10 bg-dark-800 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500" />
                <Pencil className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              </div>
            </div>

            {/* Requirement Type */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Requirement Type <span className="text-red-400">*</span>
              </label>
              <select
                value={requirementType}
                onChange={(e) => setRequirementType(e.target.value)}
                className={`w-full px-3 py-2.5 bg-dark-800 border rounded-xl text-white focus:outline-none focus:border-rivvra-500 ${
                  !requirementType ? 'text-dark-500 border-dark-600' : 'border-dark-600'
                }`}
              >
                <option value="" disabled>Select requirement type</option>
                <option value="Staff Augmentation">Staff Augmentation</option>
                <option value="Project Based">Project Based</option>
                <option value="Full-time Hire">Full-time Hire</option>
              </select>
            </div>
          </div>

          {/* Sticky footer — action buttons always visible */}
          {(() => {
            const formInvalid = !name.trim() || !company.trim() || !contactTitle.trim() || !requirementType;
            const busy = checkingDup || reassigning;
            return (
              <div className="px-6 py-4 border-t border-dark-700/60 bg-dark-900 rounded-b-2xl flex-shrink-0 space-y-2">
                <div className="flex gap-3">
                  <button onClick={handleClose} disabled={busy}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 text-white font-medium hover:bg-dark-700 transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    onClick={handleRivvraExportClick}
                    disabled={formInvalid || busy}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-rivvra-500 text-dark-950 font-semibold hover:bg-rivvra-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {checkingDup ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
                    {isCrossOwner
                      ? `Export — assign to ${leadOwnerName?.split(' ')[0] || 'owner'}`
                      : 'Create Opportunity'}
                  </button>
                </div>
                {isCrossOwner && (
                  <button
                    onClick={handleReassignAndExport}
                    disabled={formInvalid || busy}
                    className="w-full px-4 py-2 rounded-xl bg-dark-800 border border-blue-500/30 text-blue-300 font-medium text-sm hover:bg-blue-500/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {reassigning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                    Reassign to me, then export
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP: Duplicate-opp warning
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 'dup-warn') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <button onClick={handleClose} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors z-10">
            <X className="w-5 h-5" />
          </button>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Existing Opportunity Found</h2>
                <p className="text-dark-400 text-sm">
                  {duplicateOpps.length === 1
                    ? 'An opportunity already exists for this contact.'
                    : `${duplicateOpps.length} opportunities already exist for this contact.`}
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
              {duplicateOpps.map(opp => {
                const statusColor = opp.status === 'Lost' ? 'text-red-400 bg-red-500/10'
                  : opp.status === 'Converted' ? 'text-emerald-400 bg-emerald-500/10'
                  : opp.status === 'Won' ? 'text-amber-400 bg-amber-500/10'
                  : 'text-rivvra-400 bg-rivvra-500/10';
                return (
                  <Link
                    key={opp._id}
                    to={`/org/${orgSlug}/crm/opportunities/${opp._id}`}
                    onClick={handleClose}
                    className="block px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-lg hover:border-rivvra-500/40 hover:bg-rivvra-500/5 transition-colors group"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm text-white font-medium truncate group-hover:text-rivvra-400">{opp.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${statusColor}`}>
                            {opp.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-dark-500 flex items-center gap-1.5 flex-wrap">
                          {opp.stageName && <span>{opp.stageName}</span>}
                          {opp.salespersonName && <><span>·</span><span>{opp.salespersonName}</span></>}
                          {opp.createdAt && <><span>·</span><span>{new Date(opp.createdAt).toLocaleDateString()}</span></>}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-dark-500 group-hover:text-rivvra-400 flex-shrink-0 mt-0.5" />
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={performRivvraExport}
                className="w-full px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium hover:bg-amber-500/25 transition-colors flex items-center justify-center gap-2"
              >
                <Briefcase className="w-4 h-4" />
                Create new opportunity anyway
              </button>
              <button
                onClick={() => setStep('form')}
                className="w-full px-4 py-2 rounded-xl bg-dark-800 text-dark-300 font-medium text-sm hover:bg-dark-700 transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP: Exporting
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 'exporting') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Creating Opportunity...</h2>
            <p className="text-dark-400">Please wait...</p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP: Success
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 'success') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Opportunity Created</h2>
            <p className="text-dark-400 mb-2">
              {exportResult?.message || 'Opportunity created in Rivvra CRM.'}
            </p>
            {(exportResult?.companyContact || exportResult?.individualContact) && (
              <div className="mb-4 mx-auto max-w-xs text-left">
                <div className="bg-dark-800/60 border border-dark-700 rounded-xl p-3 space-y-2">
                  {exportResult.companyContact && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-dark-400">Company</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white font-medium">{exportResult.companyContact.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          exportResult.companyContact.created
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {exportResult.companyContact.created ? 'Created' : 'Linked'}
                        </span>
                      </div>
                    </div>
                  )}
                  {exportResult.individualContact && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-dark-400">Contact</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white font-medium">{exportResult.individualContact.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          exportResult.individualContact.created
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {exportResult.individualContact.created ? 'Created' : 'Linked'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {exportResult?.opportunityId && orgSlug && (
              <Link
                to={`/org/${orgSlug}/crm/opportunities/${exportResult.opportunityId}`}
                className="inline-flex items-center gap-1.5 text-sm text-rivvra-400 hover:text-rivvra-300 mb-4"
                onClick={handleClose}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View Opportunity
              </Link>
            )}
            <div className="mt-2">
              <button onClick={handleClose}
                className="px-6 py-2.5 rounded-xl bg-rivvra-500 text-dark-950 font-semibold hover:bg-rivvra-400 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP: Error
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 'error') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Export Failed</h2>
            <p className="text-dark-400 mb-6">{errorMessage}</p>
            <div className="flex gap-3">
              <button onClick={handleClose}
                className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 text-white font-medium hover:bg-dark-700 transition-colors">
                Close
              </button>
              <button onClick={() => setStep('form')}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rivvra-500 text-dark-950 font-semibold hover:bg-rivvra-400 transition-colors">
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default ExportToCRMModal;
