import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, Upload, RefreshCw, CheckCircle, AlertTriangle, Pencil, Sparkles, Briefcase, ExternalLink, UserCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import api from '../utils/api';
import crmApi from '../utils/crmApi';

function ExportToCRMModal({ isOpen, onClose, lead, onSuccess }) {
  const { user } = useAuth();
  const { orgSlug } = useOrg();
  const navigate = useNavigate();
  const isPro = user?.plan === 'pro' || user?.plan === 'premium';

  // 'choose' → 'form' → 'dup-warn' → 'confirm' → 'exporting' → 'success' | 'error' | 'duplicate'
  // (dup-warn = our new "an opportunity already exists for this contact" gate)
  const [step, setStep] = useState('choose');
  const [destination, setDestination] = useState(''); // 'odoo' | 'rivvra'
  const [profileType, setProfileType] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [expectedRole, setExpectedRole] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [requirementType, setRequirementType] = useState('');
  const [checking, setChecking] = useState(false);
  const [alreadyExported, setAlreadyExported] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [profileTypeError, setProfileTypeError] = useState(false);
  const [duplicateOpps, setDuplicateOpps] = useState([]);
  const [reassigning, setReassigning] = useState(false);
  const [checkingDup, setCheckingDup] = useState(false);

  // Reset state when modal opens with a new lead
  useEffect(() => {
    if (isOpen && lead) {
      setStep('choose');
      setDestination('');
      setProfileType(lead.profileType || '');
      setName(lead.name || '');
      setCompany(lead.company || lead.companyName || '');
      setEmail(lead.email || '');
      setPhone(lead.phone || '');
      setContactTitle(lead.title || lead.headline || lead.currentTitle || '');
      setExpectedRole('');
      setRequirementType('');
      setAlreadyExported(false);
      setExportResult(null);
      setErrorMessage('');
      setProfileTypeError(false);
      setChecking(false);
      setDuplicateOpps([]);
      setReassigning(false);
      setCheckingDup(false);

      // Check if already exported (Odoo)
      if (lead.linkedinUrl && user?.email) {
        setChecking(true);
        api.checkCRMExport(lead.linkedinUrl, user.email)
          .then(res => {
            if (res.alreadyExported) {
              setAlreadyExported(true);
            }
          })
          .catch(() => {})
          .finally(() => setChecking(false));
      }
    }
  }, [isOpen, lead, user?.email]);

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
    setStep('choose');
    setDestination('');
    onClose();
  };

  // ── Odoo Export Handler ──
  const handleOdooExportClick = () => {
    if (!profileType) {
      setProfileTypeError(true);
      return;
    }
    setProfileTypeError(false);
    setStep('confirm');
  };

  const handleConfirmOdooExport = async () => {
    setStep('exporting');
    try {
      let extractedSkill = null;
      if (profileType === 'candidate') {
        const headline = lead.headline || lead.title || lead.currentTitle || '';
        if (headline) {
          try {
            const skillResult = await api.extractSkill(headline, user?.email || '');
            if (skillResult.success && skillResult.skill) {
              extractedSkill = skillResult.skill;
            }
          } catch (skillErr) {
            console.warn('Skill extraction failed:', skillErr);
          }
        }
      }

      const result = await api.exportToOdoo({
        leadData: {
          name: name.trim(),
          companyName: company.trim(),
          email: email.trim(),
          phone: lead.phone || '',
          function: lead.title || lead.headline || '',
          street: lead.location || '',
          sourcedBy: user?.name || '',
          notes: lead.notes || [],
        },
        userEmail: user?.email || '',
        linkedinUrl: lead.linkedinUrl || '',
        profileType,
        extractedSkill,
      });

      if (result.success) {
        // Update lead status to 'converted' (non-fatal if fails)
        try {
          await api.updateLead(lead._id, { outreachStatus: 'converted' });
        } catch (e) {
          console.warn('Failed to update lead status to converted:', e);
        }

        // Notify parent to update local state
        onSuccess?.(lead._id);

        setExportResult(result);
        setStep('success');
      } else if (result.alreadyExists) {
        setExportResult(result);
        setStep('duplicate');
      } else {
        setErrorMessage(result.error || 'Export failed');
        setStep('error');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Export failed. Please try again.');
      setStep('error');
    }
  };

  // Cross-owner detection: the lead's owner (lead.userId — set by Outreach
  // when the contact was first sourced) vs the user clicking Export.
  const leadOwnerId = lead?.userId || null;
  const leadOwnerName = lead?.ownerName || lead?.sourcedBy || lead?.userEmail || null;
  const currentUserId = user?._id || user?.id || null;
  const isCrossOwner = !!(leadOwnerId && currentUserId && String(leadOwnerId) !== String(currentUserId));

  // ── Rivvra CRM Export Handler ──
  // Two-phase: pre-flight checks for an existing opportunity; if found,
  // routes to a warning step. The user can either Open the existing opp,
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
    // Pre-flight: warn if a CRM opportunity already exists for this contact /
    // company. Backend matches on contactEmail first, falls back to
    // (contactName, companyName).
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
      // Update the local lead reference so subsequent payloads/UI reflect
      // the new owner. The parent's lead list will refetch on success.
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
  // STEP: Choose Destination
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 'choose') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <button onClick={handleClose} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors z-10">
            <X className="w-5 h-5" />
          </button>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-rivvra-500/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-rivvra-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Export to CRM</h2>
                <p className="text-dark-400 text-sm">Choose where to export this contact</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {/* Rivvra CRM Option */}
              <button
                onClick={() => { setDestination('rivvra'); setStep('form'); }}
                className="w-full flex items-center gap-4 px-4 py-4 bg-dark-800 border border-dark-600 rounded-xl hover:border-rivvra-500/50 hover:bg-rivvra-500/5 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium group-hover:text-rivvra-400 transition-colors">Export to Rivvra CRM</p>
                  <p className="text-dark-500 text-xs mt-0.5">Create an opportunity in your Rivvra pipeline</p>
                </div>
                <ExternalLink className="w-4 h-4 text-dark-600 group-hover:text-dark-400" />
              </button>

              {/* Odoo Option */}
              <button
                onClick={() => { setDestination('odoo'); setStep('form'); }}
                className="w-full flex items-center gap-4 px-4 py-4 bg-dark-800 border border-dark-600 rounded-xl hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <Upload className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium group-hover:text-purple-400 transition-colors">Export to Odoo</p>
                  <p className="text-dark-500 text-xs mt-0.5">Send this contact to your Odoo CRM instance</p>
                </div>
                <ExternalLink className="w-4 h-4 text-dark-600 group-hover:text-dark-400" />
              </button>
            </div>

            <button
              onClick={handleClose}
              className="w-full px-4 py-2.5 rounded-xl bg-dark-800 text-dark-300 font-medium hover:bg-dark-700 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP: Form (differs by destination)
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 'form') {
    if (destination === 'rivvra') {
      // Rivvra CRM form — simpler, create opportunity directly
      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
            <button onClick={handleClose} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors z-10">
              <X className="w-5 h-5" />
            </button>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Export to Rivvra CRM</h2>
                  <p className="text-dark-400 text-sm">Create an opportunity from this contact</p>
                </div>
              </div>

              {/* Already converted warning */}
              {lead.outreachStatus === 'converted' && (
                <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-sm text-amber-300">This lead was already exported. A new opportunity will be created.</span>
                </div>
              )}

              {/* Lead owner banner — surfaces who owns this lead in Outreach.
                  When the current user isn't the owner, the export footer
                  offers a "reassign to me first" path so ownership change is
                  explicit rather than silent. */}
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
              <div className="mb-6">
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

              {/* Actions */}
              {(() => {
                const formInvalid = !name.trim() || !company.trim() || !contactTitle.trim() || !requirementType;
                const busy = checkingDup || reassigning;
                return (
                  <div className="space-y-2">
                    <div className="flex gap-3">
                      <button onClick={() => setStep('choose')} disabled={busy}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 text-white font-medium hover:bg-dark-700 transition-colors disabled:opacity-50">
                        Back
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
        </div>
      );
    }

    // Odoo form — existing behavior
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <button onClick={handleClose} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors z-10">
            <X className="w-5 h-5" />
          </button>

          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Export to Odoo CRM</h2>
                <p className="text-dark-400 text-sm">Send this contact to your Odoo CRM</p>
              </div>
            </div>

            {checking && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-dark-800 rounded-lg">
                <RefreshCw className="w-4 h-4 text-rivvra-400 animate-spin" />
                <span className="text-sm text-dark-300">Checking export status...</span>
              </div>
            )}

            {alreadyExported && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-sm text-amber-300">This contact may have already been exported to CRM.</span>
              </div>
            )}

            {/* Profile Type - Read-only, sourced from contact */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Profile Type <span className="text-red-400">*</span>
              </label>
              {profileType ? (
                <div className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl">
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                    profileType === 'client'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-purple-500/10 text-purple-400'
                  }`}>
                    {profileType === 'client' ? 'Client' : 'Candidate'}
                  </span>
                </div>
              ) : (
                <div className={`w-full px-3 py-2.5 bg-dark-800 border rounded-xl ${
                  profileTypeError ? 'border-red-500' : 'border-dark-600'
                }`}>
                  <span className="text-dark-500 text-sm">No profile type set</span>
                </div>
              )}
              {profileTypeError && (
                <p className="text-red-400 text-xs mt-1">Profile Type is required. Please set it from the extension or contact details before exporting.</p>
              )}
            </div>

            {/* Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">
                Name <span className="text-red-400">*</span>
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

            {/* Email */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-dark-300 mb-1.5">Email</label>
              <div className="relative">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="No email found"
                  className="w-full px-3 py-2.5 pr-10 bg-dark-800 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500" />
                <Pencil className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => setStep('choose')}
                className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 text-white font-medium hover:bg-dark-700 transition-colors">
                Back
              </button>
              <button onClick={handleOdooExportClick} disabled={!name.trim() || !company.trim() || checking}
                className="flex-1 px-4 py-2.5 rounded-xl bg-purple-500 text-white font-semibold hover:bg-purple-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" />
                Export to Odoo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP: Confirm (Odoo only — Rivvra goes straight to exporting)
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 'confirm') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <button onClick={handleClose} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors z-10">
            <X className="w-5 h-5" />
          </button>

          <div className="p-6">
            <h2 className="text-xl font-bold text-white mb-2">Export to Odoo CRM</h2>
            <p className="text-dark-400 text-sm mb-1">Are you sure you want to export this contact to Odoo CRM?</p>
            <p className="text-dark-500 text-xs mb-5 border-l-2 border-dark-600 pl-3">
              Review and edit the information below before exporting:
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3">
                <span className="text-sm text-dark-400 w-20">Name:</span>
                <span className="text-sm text-white font-medium">{name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-dark-400 w-20">Company:</span>
                <span className="text-sm text-white font-medium">{company}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-dark-400 w-20">Email:</span>
                <span className="text-sm text-white font-medium">{email || 'Not provided'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-dark-400 w-20">Type:</span>
                <span className="text-sm text-white font-medium capitalize">{profileType}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('form')}
                className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 text-white font-medium hover:bg-dark-700 transition-colors">
                Back
              </button>
              <button onClick={handleConfirmOdooExport}
                className="flex-1 px-4 py-2.5 rounded-xl bg-purple-500 text-white font-semibold hover:bg-purple-400 transition-colors flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" />
                Yes, Export
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP: Duplicate-opp warning (Rivvra only)
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
    const isRivvra = destination === 'rivvra';
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 text-center">
            <div className={`w-16 h-16 rounded-2xl ${isRivvra ? 'bg-emerald-500/10' : 'bg-rivvra-500/10'} flex items-center justify-center mx-auto mb-4`}>
              <RefreshCw className={`w-8 h-8 ${isRivvra ? 'text-emerald-400' : 'text-rivvra-400'} animate-spin`} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {isRivvra ? 'Creating Opportunity...' : 'Exporting to Odoo CRM'}
            </h2>
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
    const isRivvra = destination === 'rivvra';
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {isRivvra ? 'Opportunity Created' : 'Export Successful'}
            </h2>
            <p className="text-dark-400 mb-2">
              {exportResult?.message || (isRivvra ? 'Opportunity created in Rivvra CRM.' : 'Contact exported to Odoo CRM.')}
            </p>
            {exportResult?.crmId && (
              <p className="text-dark-500 text-sm mb-4">CRM ID: {exportResult.crmId}</p>
            )}
            {isRivvra && (exportResult?.companyContact || exportResult?.individualContact) && (
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
            {isRivvra && exportResult?.opportunityId && orgSlug && (
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
  // STEP: Duplicate (Odoo only)
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 'duplicate') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Already Exported</h2>
            <p className="text-dark-400 mb-2">{exportResult?.message || 'This contact already exists in your CRM.'}</p>
            {exportResult?.crmId && (
              <p className="text-dark-500 text-sm mb-6">CRM ID: {exportResult.crmId}</p>
            )}
            <button onClick={handleClose}
              className="px-6 py-2.5 rounded-xl bg-dark-800 text-white font-medium hover:bg-dark-700 transition-colors">
              Close
            </button>
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
