import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import employeeApi from '../../utils/employeeApi';
import { STEPS as ONBOARDING_STEPS } from '../../components/employee/OnboardingStepper';
import DocumentUpload from '../../components/employee/DocumentUpload';
import {
  Loader2, User, Users, Building2, GraduationCap, ClipboardCheck,
  Plus, Trash2, ChevronRight, ChevronLeft, CheckCircle,
} from 'lucide-react';
import {
  Panel, Button, Input, Select, Switch, Field, Callout, EmptyState, PageSpinner, Stepper,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// This is the form an employee fills in once, and half of what it collects is
// statutory: PAN, Aadhaar, IFSC, account number, UAN, PF and ESIC. The whole
// data layer — `INITIAL_FORM`, every mutator, the entire `validateStep` with its
// six format patterns, `goNext`/`goPrev`, and `handleSubmit` — is spliced in
// byte-identically. The step renderers are rebuilt on ds; nothing they bind was
// added, dropped, or renamed (42 fields on each side, verified by extraction).
//
// Carried across as-is, and reported rather than fixed:
//   • `IFSC_RE` is declared and never applied. The IFSC field is checked for
//     presence only, so any 11 characters pass as a bank routing code.
//   • `address.street2` / `permanentAddress.street2` are in `INITIAL_FORM` and
//     go up in the payload, but no step renders an input for either.
//
// `DocumentUpload` stays as it is — an upload flow, not a styling primitive.
// `OnboardingStepper` is replaced by ds `Stepper`: its active step painted brand
// ink on a 20% wash of the same brand and measured 4.22 against a 4.5 floor.
// The step *list* is still imported from it, so the two stay in lockstep.
//
// Not triggered: submit onboarding, delete uploaded document.
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Initial form state
// ---------------------------------------------------------------------------
const INITIAL_FORM = {
  // Step 1 — Personal
  gender: '',
  dateOfBirth: '',
  bloodGroup: '',
  fatherName: '',
  maritalStatus: '',
  spouseName: '',
  nationality: 'Indian',
  religion: '',
  alternatePhone: '',
  personalEmail: '',
  address: { street: '', street2: '', city: '', state: '', zip: '', country: 'India' },
  permanentAddress: { street: '', street2: '', city: '', state: '', zip: '', country: 'India' },
  sameAsCurrentAddress: true,

  // Step 2 — Family & Emergency
  emergencyContact: { name: '', phone: '', relation: '' },
  familyMembers: [],

  // Step 3 — Bank & Statutory
  bankDetails: { bankName: '', accountNumber: '', ifsc: '', pan: '' },
  statutory: { aadhaar: '', uan: '', pfNumber: '', esicNumber: '' },

  // Step 4 — Education
  education: [],
};

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const RELATIONS = ['Father', 'Mother', 'Spouse', 'Child', 'Sibling', 'Other'];
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];

// ---------------------------------------------------------------------------
// Reusable form pieces
// ---------------------------------------------------------------------------
// Same five steps the legacy stepper declares, re-shaped for ds `Stepper`.
const STEPPER_STEPS = ONBOARDING_STEPS.map((s) => ({ id: s.key, label: s.label, num: s.num }));

const sectionHead = { font: "600 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: '0 0 12px' };
const stepHead = { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px', font: "700 15px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' };
const req = <span style={{ color: 'var(--danger)' }}>*</span>;

const readOnlyBox = {
  width: '100%', height: 38, padding: '0 12px', display: 'flex', alignItems: 'center',
  borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)',
  boxShadow: '0 0 0 1px var(--line-2)', cursor: 'not-allowed',
  font: "450 13.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
};

function ReviewSection({ title, children }) {
  return (
    <Panel style={{ marginBottom: 12 }}>
      <div style={{ padding: 4 }}>
        <h3 style={{ font: "600 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)', margin: '0 0 10px' }}>{title}</h3>
        {children}
      </div>
    </Panel>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
      <span style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{label}</span>
      <span style={{ textAlign: 'right', font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{value || '—'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function EmployeeOnboardingWizardV2() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [step, setStep] = useState('personal');
  const [errors, setErrors] = useState({});
  const [bankDocs, setBankDocs] = useState([]);
  const [educationDocs, setEducationDocs] = useState({}); // { [index]: docs[] }

  // Load employee profile
  useEffect(() => {
    if (!currentOrg?.slug) return;
    let cancelled = false;

    employeeApi.getMyProfile(currentOrg.slug)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.employee) {
          const emp = res.employee;
          setEmployee(emp);
          // Pre-fill form from existing employee data
          setForm((prev) => ({
            ...prev,
            gender: emp.gender || '',
            dateOfBirth: emp.dateOfBirth ? emp.dateOfBirth.slice(0, 10) : '',
            bloodGroup: emp.bloodGroup || '',
            fatherName: emp.fatherName || '',
            maritalStatus: emp.maritalStatus || '',
            spouseName: emp.spouseName || '',
            nationality: emp.nationality || 'Indian',
            religion: emp.religion || '',
            alternatePhone: emp.alternatePhone || emp.privatePhone || '',
            personalEmail: emp.privateEmail || '',
            address: emp.address || prev.address,
            permanentAddress: emp.permanentAddress || prev.permanentAddress,
            emergencyContact: emp.emergencyContact || prev.emergencyContact,
            familyMembers: emp.familyMembers?.length ? emp.familyMembers : [],
            bankDetails: emp.bankDetails ? { ...prev.bankDetails, ...emp.bankDetails, ifsc: emp.bankDetails.ifsc || emp.bankDetails.ifscCode || '' } : prev.bankDetails,
            statutory: emp.statutory || prev.statutory,
            education: emp.education?.length ? emp.education : [],
          }));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [currentOrg?.slug]);

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------
  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const updateNested = (parent, key, value) => {
    setForm((prev) => ({
      ...prev,
      [parent]: { ...prev[parent], [key]: value },
    }));
  };

  const addFamilyMember = () => {
    setForm((prev) => ({
      ...prev,
      familyMembers: [...prev.familyMembers, { name: '', relation: '', dateOfBirth: '', isDependent: false, phone: '' }],
    }));
  };

  const updateFamilyMember = (idx, key, value) => {
    setForm((prev) => {
      const copy = [...prev.familyMembers];
      copy[idx] = { ...copy[idx], [key]: value };
      return { ...prev, familyMembers: copy };
    });
  };

  const removeFamilyMember = (idx) => {
    setForm((prev) => ({
      ...prev,
      familyMembers: prev.familyMembers.filter((_, i) => i !== idx),
    }));
  };

  const addEducation = () => {
    setForm((prev) => ({
      ...prev,
      education: [...prev.education, { degree: '', institution: '', yearOfPassing: '', percentage: '', specialization: '' }],
    }));
  };

  const updateEducation = (idx, key, value) => {
    setForm((prev) => {
      const copy = [...prev.education];
      copy[idx] = { ...copy[idx], [key]: value };
      return { ...prev, education: copy };
    });
  };

  const removeEducation = async (idx) => {
    // Delete uploaded docs for this education entry
    const docsForIdx = educationDocs[idx] || [];
    for (const doc of docsForIdx) {
      try { await employeeApi.deleteMyDoc(currentOrg.slug, doc._id); } catch (_) {}
    }
    // Remove education entry
    setForm((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== idx),
    }));
    // Re-index educationDocs (shift indices down for entries after removed one)
    setEducationDocs(prev => {
      const next = {};
      Object.keys(prev).forEach(key => {
        const k = Number(key);
        if (k < idx) next[k] = prev[k];
        else if (k > idx) next[k - 1] = prev[k];
      });
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  // Format patterns
  const PHONE_RE = /^[6-9]\d{9}$/;                       // Indian 10-digit mobile
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;         // basic email
  const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;             // ABCDE1234F
  const AADHAAR_RE = /^\d{12}$/;                          // 12 digits
  const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;             // ABCD0XXXXXX
  const ACCT_RE = /^\d{9,18}$/;                           // 9-18 digits

  const validateStep = () => {
    const errs = {};

    if (step === 'personal') {
      if (!form.gender) errs.gender = 'Gender is required';
      if (!form.dateOfBirth) errs.dateOfBirth = 'Date of birth is required';
      if (!form.maritalStatus) errs.maritalStatus = 'Marital status is required';
      if (!form.nationality?.trim()) errs.nationality = 'Nationality is required';

      // Alternate phone — required + format
      const phone = form.alternatePhone.trim();
      if (!phone) errs.alternatePhone = 'Alternate phone is required';
      else if (!PHONE_RE.test(phone)) errs.alternatePhone = 'Enter a valid 10-digit mobile number';

      // Personal email — required + format
      const pEmail = form.personalEmail?.trim();
      if (!pEmail) errs.personalEmail = 'Personal email is required';
      else if (!EMAIL_RE.test(pEmail)) errs.personalEmail = 'Enter a valid email address';

      // Current address — required
      if (!form.address.street?.trim()) errs.addressStreet = 'Street address is required';
      if (!form.address.city?.trim()) errs.addressCity = 'City is required';
      if (!form.address.state?.trim()) errs.addressState = 'State is required';
      if (!form.address.zip?.trim()) errs.addressZip = 'PIN code is required';
    }

    if (step === 'family') {
      if (!form.emergencyContact.name?.trim()) errs.emergencyName = 'Emergency contact name is required';

      const ePhone = form.emergencyContact.phone?.trim();
      if (!ePhone) errs.emergencyPhone = 'Emergency contact phone is required';
      else if (!PHONE_RE.test(ePhone)) errs.emergencyPhone = 'Enter a valid 10-digit mobile number';

      if (!form.emergencyContact.relation) errs.emergencyRelation = 'Relation is required';

      // Validate family member phones (optional but must be valid if entered)
      form.familyMembers.forEach((fm, i) => {
        const fmPhone = fm.phone?.trim();
        if (fmPhone && !PHONE_RE.test(fmPhone)) errs[`fm_phone_${i}`] = 'Enter a valid 10-digit number';
      });
    }

    if (step === 'bank') {
      // Bank details — all required + format
      if (!form.bankDetails.bankName?.trim()) errs.bankName = 'Bank name is required';

      const acct = form.bankDetails.accountNumber?.trim();
      if (!acct) errs.accountNumber = 'Account number is required';
      else if (!ACCT_RE.test(acct)) errs.accountNumber = 'Account number must be 9-18 digits';

      const ifsc = (form.bankDetails.ifsc || '').trim().toUpperCase();
      if (!ifsc) errs.ifsc = 'IFSC code is required';

      const pan = form.bankDetails.pan?.trim().toUpperCase();
      if (!pan) errs.pan = 'PAN number is required';
      else if (!PAN_RE.test(pan)) errs.pan = 'Invalid PAN format (e.g. ABCDE1234F)';

      // Statutory — optional but validate format if provided
      const aadhaar = form.statutory.aadhaar?.trim();
      if (aadhaar && !AADHAAR_RE.test(aadhaar)) errs.aadhaar = 'Aadhaar must be 12 digits';

      // Bank proof document required
      if (bankDocs.length === 0) errs.bankDocs = 'Please upload a cancelled cheque or digital passbook';
    }

    if (step === 'education') {
      if (form.education.length === 0) errs.education = 'At least one education entry is required';
      // Validate each entry has degree, institution, and at least one document
      form.education.forEach((ed, i) => {
        if (!ed.degree?.trim()) errs[`edu_degree_${i}`] = `Education ${i + 1}: Degree is required`;
        if (!ed.institution?.trim()) errs[`edu_institution_${i}`] = `Education ${i + 1}: Institution is required`;
        if (!(educationDocs[i]?.length > 0)) errs[`edu_docs_${i}`] = `Education ${i + 1}: Please upload at least one certificate`;
      });
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  const STEP_ORDER = ['personal', 'family', 'bank', 'education', 'review'];

  const goNext = () => {
    if (!validateStep()) return;
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  };

  const goPrev = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        permanentAddress: form.sameAsCurrentAddress ? form.address : form.permanentAddress,
      };
      delete payload.sameAsCurrentAddress;

      const res = await employeeApi.submitOnboarding(currentOrg.slug, payload);
      if (res.success) {
        navigate(orgPath('/home'), { replace: true });
      } else {
        setErrors({ submit: res.error || 'Failed to submit' });
      }
    } catch (err) {
      setErrors({ submit: err.message || 'Failed to submit' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading / error
  // ---------------------------------------------------------------------------
  if (loading) return <PageSpinner label="Loading your profile…" />;

  if (!employee) {
    return (
      <Panel>
        <EmptyState icon={<User size={22} />} title="No employee profile found">
          Please contact your administrator.
        </EmptyState>
      </Panel>
    );
  }

  // ---------------------------------------------------------------------------
  // Step Renderers
  // ---------------------------------------------------------------------------
  const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 };
  const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 };

  const renderPersonal = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <h2 style={stepHead}><User size={17} style={{ color: 'var(--brand-ink)' }} /> Personal Details</h2>

      <div style={grid2}>
        <Field label="Full Name">
          <div style={readOnlyBox}>{employee.fullName || ''}</div>
        </Field>

        <Field label="Work Email">
          <div style={readOnlyBox}>{employee.email || ''}</div>
        </Field>

        <Field label="Gender" required htmlFor="ow-gender" error={errors.gender}>
          <Select id="ow-gender" value={form.gender} invalid={!!errors.gender}
            onChange={(e) => updateField('gender', e.target.value)}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
        </Field>

        <Field label="Date of Birth" required htmlFor="ow-dob" error={errors.dateOfBirth}>
          <Input id="ow-dob" type="date" value={form.dateOfBirth} invalid={!!errors.dateOfBirth}
            onChange={(e) => updateField('dateOfBirth', e.target.value)} />
        </Field>

        <Field label="Blood Group" htmlFor="ow-blood">
          <Select id="ow-blood" value={form.bloodGroup} onChange={(e) => updateField('bloodGroup', e.target.value)}>
            <option value="">Select blood group</option>
            {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
          </Select>
        </Field>

        <Field label="Father's Name" htmlFor="ow-father">
          <Input id="ow-father" type="text" value={form.fatherName} placeholder="Father's full name"
            onChange={(e) => updateField('fatherName', e.target.value)} />
        </Field>

        <Field label="Marital Status" required htmlFor="ow-marital" error={errors.maritalStatus}>
          <Select id="ow-marital" value={form.maritalStatus} invalid={!!errors.maritalStatus}
            onChange={(e) => updateField('maritalStatus', e.target.value)}>
            <option value="">Select status</option>
            {MARITAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>

        {form.maritalStatus === 'Married' && (
          <Field label="Spouse Name" htmlFor="ow-spouse">
            <Input id="ow-spouse" type="text" value={form.spouseName} placeholder="Spouse's full name"
              onChange={(e) => updateField('spouseName', e.target.value)} />
          </Field>
        )}

        <Field label="Nationality" required htmlFor="ow-nat" error={errors.nationality}>
          <Input id="ow-nat" type="text" value={form.nationality} invalid={!!errors.nationality}
            onChange={(e) => updateField('nationality', e.target.value)} />
        </Field>

        <Field label="Religion" htmlFor="ow-religion">
          <Input id="ow-religion" type="text" value={form.religion} placeholder="Optional"
            onChange={(e) => updateField('religion', e.target.value)} />
        </Field>

        <Field label="Alternate Phone Number" required htmlFor="ow-altphone" error={errors.alternatePhone}>
          <Input id="ow-altphone" type="tel" value={form.alternatePhone} invalid={!!errors.alternatePhone}
            placeholder="Personal / alternate number"
            onChange={(e) => updateField('alternatePhone', e.target.value)} />
        </Field>

        <Field label="Personal Email" required htmlFor="ow-pemail" error={errors.personalEmail}>
          <Input id="ow-pemail" type="email" value={form.personalEmail} invalid={!!errors.personalEmail}
            placeholder="Personal email"
            onChange={(e) => updateField('personalEmail', e.target.value)} />
        </Field>
      </div>

      {/* Current address */}
      <div>
        <h3 style={sectionHead}>Current Address {req}</h3>
        <div style={grid2}>
          <Field label="Street" required htmlFor="ow-street" error={errors.addressStreet} style={{ gridColumn: '1 / -1' }}>
            <Input id="ow-street" type="text" value={form.address.street} invalid={!!errors.addressStreet}
              placeholder="Street address"
              onChange={(e) => updateNested('address', 'street', e.target.value)} />
          </Field>
          <Field label="City" required htmlFor="ow-city" error={errors.addressCity}>
            <Input id="ow-city" type="text" value={form.address.city} invalid={!!errors.addressCity} placeholder="City"
              onChange={(e) => updateNested('address', 'city', e.target.value)} />
          </Field>
          <Field label="State" required htmlFor="ow-state" error={errors.addressState}>
            <Input id="ow-state" type="text" value={form.address.state} invalid={!!errors.addressState} placeholder="State"
              onChange={(e) => updateNested('address', 'state', e.target.value)} />
          </Field>
          <Field label="PIN Code" required htmlFor="ow-zip" error={errors.addressZip}>
            <Input id="ow-zip" type="text" value={form.address.zip} invalid={!!errors.addressZip} placeholder="PIN code"
              onChange={(e) => updateNested('address', 'zip', e.target.value)} />
          </Field>
          <Field label="Country" htmlFor="ow-country">
            <Input id="ow-country" type="text" value={form.address.country}
              onChange={(e) => updateNested('address', 'country', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Permanent address */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h3 style={{ ...sectionHead, margin: 0 }}>Permanent Address</h3>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Switch
              checked={form.sameAsCurrentAddress}
              label="Same as current address"
              onChange={(next) => updateField('sameAsCurrentAddress', next)}
            />
            <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Same as current address</span>
          </span>
        </div>
        {!form.sameAsCurrentAddress && (
          <div style={grid2}>
            <Field label="Street" htmlFor="ow-pstreet" style={{ gridColumn: '1 / -1' }}>
              <Input id="ow-pstreet" type="text" value={form.permanentAddress.street}
                onChange={(e) => updateNested('permanentAddress', 'street', e.target.value)} />
            </Field>
            <Field label="City" htmlFor="ow-pcity">
              <Input id="ow-pcity" type="text" value={form.permanentAddress.city}
                onChange={(e) => updateNested('permanentAddress', 'city', e.target.value)} />
            </Field>
            <Field label="State" htmlFor="ow-pstate">
              <Input id="ow-pstate" type="text" value={form.permanentAddress.state}
                onChange={(e) => updateNested('permanentAddress', 'state', e.target.value)} />
            </Field>
            <Field label="PIN Code" htmlFor="ow-pzip">
              <Input id="ow-pzip" type="text" value={form.permanentAddress.zip}
                onChange={(e) => updateNested('permanentAddress', 'zip', e.target.value)} />
            </Field>
            <Field label="Country" htmlFor="ow-pcountry">
              <Input id="ow-pcountry" type="text" value={form.permanentAddress.country}
                onChange={(e) => updateNested('permanentAddress', 'country', e.target.value)} />
            </Field>
          </div>
        )}
      </div>
    </div>
  );

  const renderFamily = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <h2 style={stepHead}><Users size={17} style={{ color: 'var(--brand-ink)' }} /> Family &amp; Emergency Contact</h2>

      <Panel>
        <div style={{ padding: 4 }}>
          <h3 style={sectionHead}>Emergency Contact {req}</h3>
          <div style={grid3}>
            <Field label="Name" required htmlFor="ow-ename" error={errors.emergencyName}>
              <Input id="ow-ename" type="text" value={form.emergencyContact.name} invalid={!!errors.emergencyName}
                placeholder="Contact name"
                onChange={(e) => updateNested('emergencyContact', 'name', e.target.value)} />
            </Field>
            <Field label="Phone" required htmlFor="ow-ephone" error={errors.emergencyPhone}>
              <Input id="ow-ephone" type="tel" value={form.emergencyContact.phone} invalid={!!errors.emergencyPhone}
                placeholder="Phone number"
                onChange={(e) => updateNested('emergencyContact', 'phone', e.target.value)} />
            </Field>
            <Field label="Relation" required htmlFor="ow-erel" error={errors.emergencyRelation}>
              <Select id="ow-erel" value={form.emergencyContact.relation} invalid={!!errors.emergencyRelation}
                onChange={(e) => updateNested('emergencyContact', 'relation', e.target.value)}>
                <option value="">Select</option>
                {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </Panel>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <h3 style={{ ...sectionHead, margin: 0 }}>Family Members</h3>
          <Button variant="ghost" size="sm" type="button" onClick={addFamilyMember} iconLeft={<Plus size={14} />}>
            Add Member
          </Button>
        </div>

        {form.familyMembers.length === 0 && (
          <EmptyState compact title={'No family members added yet. Click "Add Member" to start.'} />
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {form.familyMembers.map((fm, i) => (
            <Panel key={i} style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                <Button variant="ghost" size="sm" type="button" aria-label={`Remove family member ${i + 1}`}
                  onClick={() => removeFamilyMember(i)} style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
              </span>
              <div style={{ ...grid3, padding: 4, paddingRight: 28 }}>
                <Field label="Name" htmlFor={`ow-fm-name-${i}`}>
                  <Input id={`ow-fm-name-${i}`} type="text" value={fm.name} placeholder="Full name"
                    onChange={(e) => updateFamilyMember(i, 'name', e.target.value)} />
                </Field>
                <Field label="Relation" htmlFor={`ow-fm-rel-${i}`}>
                  <Select id={`ow-fm-rel-${i}`} value={fm.relation}
                    onChange={(e) => updateFamilyMember(i, 'relation', e.target.value)}>
                    <option value="">Select</option>
                    {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </Field>
                <Field label="Date of Birth" htmlFor={`ow-fm-dob-${i}`}>
                  <Input id={`ow-fm-dob-${i}`} type="date" value={fm.dateOfBirth}
                    onChange={(e) => updateFamilyMember(i, 'dateOfBirth', e.target.value)} />
                </Field>
                <Field label="Phone" htmlFor={`ow-fm-phone-${i}`} error={errors[`fm_phone_${i}`]}>
                  <Input id={`ow-fm-phone-${i}`} type="tel" value={fm.phone} placeholder="Phone"
                    invalid={!!errors[`fm_phone_${i}`]}
                    onChange={(e) => updateFamilyMember(i, 'phone', e.target.value)} />
                </Field>
                <Field label="Dependent?">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38 }}>
                    <Switch
                      checked={fm.isDependent}
                      label={`Family member ${i + 1} is a dependent`}
                      onChange={(next) => updateFamilyMember(i, 'isDependent', next)}
                    />
                    <span style={{ font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>Yes, dependent</span>
                  </span>
                </Field>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );

  const renderBank = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <h2 style={stepHead}><Building2 size={17} style={{ color: 'var(--brand-ink)' }} /> Bank &amp; Statutory Details</h2>

      <Panel>
        <div style={{ padding: 4 }}>
          <h3 style={sectionHead}>Bank Account {req}</h3>
          <div style={grid2}>
            <Field label="Bank Name" required htmlFor="ow-bank" error={errors.bankName}>
              <Input id="ow-bank" type="text" value={form.bankDetails.bankName} invalid={!!errors.bankName}
                placeholder="Bank name"
                onChange={(e) => updateNested('bankDetails', 'bankName', e.target.value)} />
            </Field>
            <Field label="Account Number" required htmlFor="ow-acct" error={errors.accountNumber}>
              <Input id="ow-acct" type="text" value={form.bankDetails.accountNumber} invalid={!!errors.accountNumber}
                placeholder="Account number" maxLength={18}
                onChange={(e) => updateNested('bankDetails', 'accountNumber', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="IFSC Code" required htmlFor="ow-ifsc" error={errors.ifsc}>
              <Input id="ow-ifsc" type="text" value={form.bankDetails.ifsc} invalid={!!errors.ifsc}
                placeholder="SBIN0001234" maxLength={11}
                onChange={(e) => updateNested('bankDetails', 'ifsc', e.target.value.toUpperCase())} />
            </Field>
            <Field label="PAN Number" required htmlFor="ow-pan" error={errors.pan}>
              <Input id="ow-pan" type="text" value={form.bankDetails.pan} invalid={!!errors.pan}
                placeholder="ABCDE1234F" maxLength={10}
                onChange={(e) => updateNested('bankDetails', 'pan', e.target.value.toUpperCase())} />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel>
        <div style={{ padding: 4 }}>
          <h3 style={sectionHead}>Statutory / ID Details</h3>
          <div style={grid2}>
            <Field label="Aadhaar Number" htmlFor="ow-aadhaar" error={errors.aadhaar}>
              <Input id="ow-aadhaar" type="text" value={form.statutory.aadhaar} invalid={!!errors.aadhaar}
                placeholder="12-digit Aadhaar" maxLength={12}
                onChange={(e) => updateNested('statutory', 'aadhaar', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="UAN (Universal Account Number)" htmlFor="ow-uan">
              <Input id="ow-uan" type="text" value={form.statutory.uan} placeholder="UAN number"
                onChange={(e) => updateNested('statutory', 'uan', e.target.value)} />
            </Field>
            <Field label="PF Number" htmlFor="ow-pf">
              <Input id="ow-pf" type="text" value={form.statutory.pfNumber} placeholder="PF account number"
                onChange={(e) => updateNested('statutory', 'pfNumber', e.target.value)} />
            </Field>
            <Field label="ESIC Number" htmlFor="ow-esic">
              <Input id="ow-esic" type="text" value={form.statutory.esicNumber} placeholder="ESIC number"
                onChange={(e) => updateNested('statutory', 'esicNumber', e.target.value)} />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel>
        <div style={{ padding: 4 }}>
          <DocumentUpload
            orgSlug={currentOrg?.slug}
            category="bank_proof"
            required
            label="Bank Proof (Cancelled Cheque / Digital Passbook)"
            hasError={!!errors.bankDocs}
            onDocumentsChange={(docs) => setBankDocs(docs)}
          />
          {errors.bankDocs && (
            <p style={{ font: "500 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: '8px 0 0' }}>{errors.bankDocs}</p>
          )}
        </div>
      </Panel>
    </div>
  );

  const renderEducation = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={stepHead}><GraduationCap size={17} style={{ color: 'var(--brand-ink)' }} /> Education {req}</h2>
        <Button variant="secondary" size="sm" type="button" onClick={addEducation} iconLeft={<Plus size={14} />}>
          Add Education
        </Button>
      </div>

      {errors.education && <Callout tone="danger">{errors.education}</Callout>}

      {form.education.length === 0 && (
        <div style={{
          padding: '32px 16px', borderRadius: 'var(--r-3, 16px)', textAlign: 'center',
          border: `1px dashed ${errors.education ? 'var(--danger)' : 'var(--line-2)'}`,
          background: errors.education ? 'var(--danger-soft)' : 'transparent',
        }}>
          <GraduationCap size={34} style={{ color: 'var(--fg-4)' }} />
          <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: '10px 0 0' }}>No education entries added yet.</p>
          <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
            Click &quot;Add Education&quot; to add your qualifications. {req}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {form.education.map((ed, i) => (
          <Panel key={i} style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
              <Button variant="ghost" size="sm" type="button" aria-label={`Remove education ${i + 1}`}
                onClick={() => removeEducation(i)} style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
            </span>
            <div style={{ ...grid2, padding: 4, paddingRight: 28 }}>
              <Field label="Degree / Qualification" required htmlFor={`ow-edu-deg-${i}`} error={errors[`edu_degree_${i}`]}>
                <Input id={`ow-edu-deg-${i}`} type="text" value={ed.degree} invalid={!!errors[`edu_degree_${i}`]}
                  placeholder="e.g. B.Tech, MBA"
                  onChange={(e) => updateEducation(i, 'degree', e.target.value)} />
              </Field>
              <Field label="Institution / University" required htmlFor={`ow-edu-inst-${i}`} error={errors[`edu_institution_${i}`]}>
                <Input id={`ow-edu-inst-${i}`} type="text" value={ed.institution} invalid={!!errors[`edu_institution_${i}`]}
                  placeholder="Institution name"
                  onChange={(e) => updateEducation(i, 'institution', e.target.value)} />
              </Field>
              <Field label="Year of Passing" htmlFor={`ow-edu-yr-${i}`}>
                <Input id={`ow-edu-yr-${i}`} type="number" value={ed.yearOfPassing} placeholder="e.g. 2020" min={1950} max={2030}
                  onChange={(e) => updateEducation(i, 'yearOfPassing', e.target.value)} />
              </Field>
              <Field label="Percentage / CGPA" htmlFor={`ow-edu-pct-${i}`}>
                <Input id={`ow-edu-pct-${i}`} type="text" value={ed.percentage} placeholder="e.g. 85% or 8.5"
                  onChange={(e) => updateEducation(i, 'percentage', e.target.value)} />
              </Field>
              <Field label="Specialization" htmlFor={`ow-edu-spec-${i}`} style={{ gridColumn: '1 / -1' }}>
                <Input id={`ow-edu-spec-${i}`} type="text" value={ed.specialization} placeholder="e.g. Computer Science"
                  onChange={(e) => updateEducation(i, 'specialization', e.target.value)} />
              </Field>

              <div style={{ gridColumn: '1 / -1', marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
                <DocumentUpload
                  orgSlug={currentOrg?.slug}
                  category="education_certificate"
                  educationIndex={i}
                  required
                  label={`Certificate / Degree Document`}
                  hasError={!!errors[`edu_docs_${i}`]}
                  onDocumentsChange={(docs) => setEducationDocs(prev => ({ ...prev, [i]: docs }))}
                />
                {errors[`edu_docs_${i}`] && (
                  <p style={{ font: "500 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: '6px 0 0' }}>{errors[`edu_docs_${i}`]}</p>
                )}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );

  const renderReview = () => {
    const addr = form.sameAsCurrentAddress ? form.address : form.permanentAddress;
    const addrStr = [addr.street, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(', ');

    return (
      <div>
        <h2 style={stepHead}><ClipboardCheck size={17} style={{ color: 'var(--brand-ink)' }} /> Review &amp; Submit</h2>
        <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '6px 0 16px' }}>
          Please review your information before submitting. You can go back to any step to make changes.
        </p>

        {errors.submit && <Callout tone="danger" style={{ marginBottom: 14 }}>{errors.submit}</Callout>}

        <ReviewSection title="Personal Details">
          <ReviewRow label="Name" value={employee.fullName} />
          <ReviewRow label="Gender" value={form.gender} />
          <ReviewRow label="Date of Birth" value={form.dateOfBirth} />
          <ReviewRow label="Blood Group" value={form.bloodGroup} />
          <ReviewRow label="Father's Name" value={form.fatherName} />
          <ReviewRow label="Marital Status" value={form.maritalStatus} />
          {form.maritalStatus === 'Married' && <ReviewRow label="Spouse Name" value={form.spouseName} />}
          <ReviewRow label="Alternate Phone" value={form.alternatePhone} />
          <ReviewRow label="Personal Email" value={form.personalEmail} />
          <ReviewRow label="Current Address" value={[form.address.street, form.address.city, form.address.state].filter(Boolean).join(', ')} />
          <ReviewRow label="Permanent Address" value={form.sameAsCurrentAddress ? 'Same as current' : addrStr} />
        </ReviewSection>

        <ReviewSection title="Emergency Contact">
          <ReviewRow label="Name" value={form.emergencyContact.name} />
          <ReviewRow label="Phone" value={form.emergencyContact.phone} />
          <ReviewRow label="Relation" value={form.emergencyContact.relation} />
        </ReviewSection>

        {form.familyMembers.length > 0 && (
          <ReviewSection title={`Family Members (${form.familyMembers.length})`}>
            {form.familyMembers.map((fm, i) => (
              <ReviewRow key={i} label={fm.relation || 'Member'} value={`${fm.name}${fm.phone ? ` — ${fm.phone}` : ''}`} />
            ))}
          </ReviewSection>
        )}

        <ReviewSection title="Bank Details">
          <ReviewRow label="Bank Name" value={form.bankDetails.bankName} />
          <ReviewRow label="Account Number" value={form.bankDetails.accountNumber} />
          <ReviewRow label="IFSC" value={form.bankDetails.ifsc} />
          <ReviewRow label="PAN" value={form.bankDetails.pan} />
          <ReviewRow label="Bank Proof" value={`${bankDocs.length} document(s) uploaded`} />
        </ReviewSection>

        <ReviewSection title="Statutory Details">
          <ReviewRow label="Aadhaar" value={form.statutory.aadhaar} />
          <ReviewRow label="UAN" value={form.statutory.uan} />
          <ReviewRow label="PF Number" value={form.statutory.pfNumber} />
          <ReviewRow label="ESIC" value={form.statutory.esicNumber} />
        </ReviewSection>

        {form.education.length > 0 && (
          <ReviewSection title={`Education (${form.education.length})`}>
            {form.education.map((ed, i) => (
              <ReviewRow key={i} label={ed.degree || 'Qualification'} value={`${ed.institution || ''}${ed.yearOfPassing ? ` (${ed.yearOfPassing})` : ''} — ${(educationDocs[i]?.length || 0)} doc(s)`} />
            ))}
          </ReviewSection>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const stepContent = {
    personal: renderPersonal,
    family: renderFamily,
    bank: renderBank,
    education: renderEducation,
    review: renderReview,
  };

  const isFirst = step === STEP_ORDER[0];
  const isLast = step === STEP_ORDER[STEP_ORDER.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 'calc(100dvh - 3.5rem)' }}>
      <div style={{ width: '100%', maxWidth: 820, padding: '24px 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <h1 style={{ font: "700 20px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>
            Welcome to {currentOrg?.name || 'your workspace'}!
          </h1>
          <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '5px 0 0' }}>
            Let&apos;s set up your profile. This will only take a few minutes.
          </p>
        </div>

        <Stepper steps={STEPPER_STEPS} value={step} />

        <div style={{ marginTop: 24, minHeight: 300 }}>
          {stepContent[step]?.()}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, marginTop: 28, paddingTop: 16, borderTop: '1px solid var(--line-2)',
        }}>
          <Button variant="ghost" size="sm" type="button" onClick={goPrev} disabled={isFirst}
            iconLeft={<ChevronLeft size={15} />}>
            Previous
          </Button>

          {isLast ? (
            <Button size="sm" type="button" onClick={handleSubmit} disabled={submitting}
              iconLeft={submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}>
              {submitting ? 'Submitting...' : 'Submit & Continue'}
            </Button>
          ) : (
            <Button size="sm" type="button" onClick={goNext} iconRight={<ChevronRight size={15} />}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
