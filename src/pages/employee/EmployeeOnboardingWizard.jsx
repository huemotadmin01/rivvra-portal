import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import employeeApi from '../../utils/employeeApi';
import OnboardingStepper from '../../components/employee/OnboardingStepper';
import DocumentUpload from '../../components/employee/DocumentUpload';
import {
  Loader2, User, Users, Building2, GraduationCap, ClipboardCheck,
  Plus, Trash2, ChevronRight, ChevronLeft, CheckCircle,
} from 'lucide-react';

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
function FormField({ label, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-dark-300 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 text-sm';
const selectCls = 'w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white focus:outline-none focus:border-rivvra-500 text-sm appearance-none';
const readOnlyCls = 'w-full px-3 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl text-dark-400 text-sm cursor-not-allowed';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function EmployeeOnboardingWizard() {
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
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-dark-400" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-dark-400">
        <User size={48} className="mb-4 opacity-40" />
        <p className="text-lg">No employee profile found</p>
        <p className="text-sm mt-1">Please contact your administrator.</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step Renderers
  // ---------------------------------------------------------------------------
  const renderPersonal = () => (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <User size={18} className="text-rivvra-400" />
        <h2 className="text-lg font-semibold text-white">Personal Details</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Full Name">
          <input type="text" value={employee.fullName || ''} readOnly className={readOnlyCls} />
        </FormField>

        <FormField label="Work Email">
          <input type="email" value={employee.email || ''} readOnly className={readOnlyCls} />
        </FormField>

        <FormField label="Gender" required>
          <select value={form.gender} onChange={(e) => updateField('gender', e.target.value)}
            className={`${selectCls} ${errors.gender ? 'border-red-500' : ''}`}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          {errors.gender && <p className="text-red-400 text-xs mt-1">{errors.gender}</p>}
        </FormField>

        <FormField label="Date of Birth" required>
          <input type="date" value={form.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)}
            className={`${inputCls} ${errors.dateOfBirth ? 'border-red-500' : ''}`} />
          {errors.dateOfBirth && <p className="text-red-400 text-xs mt-1">{errors.dateOfBirth}</p>}
        </FormField>

        <FormField label="Blood Group">
          <select value={form.bloodGroup} onChange={(e) => updateField('bloodGroup', e.target.value)} className={selectCls}>
            <option value="">Select blood group</option>
            {BLOOD_GROUPS.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
          </select>
        </FormField>

        <FormField label="Father's Name">
          <input type="text" value={form.fatherName} onChange={(e) => updateField('fatherName', e.target.value)} className={inputCls} placeholder="Father's full name" />
        </FormField>

        <FormField label="Marital Status" required>
          <select value={form.maritalStatus} onChange={(e) => updateField('maritalStatus', e.target.value)}
            className={`${selectCls} ${errors.maritalStatus ? 'border-red-500' : ''}`}>
            <option value="">Select status</option>
            {MARITAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {errors.maritalStatus && <p className="text-red-400 text-xs mt-1">{errors.maritalStatus}</p>}
        </FormField>

        {form.maritalStatus === 'Married' && (
          <FormField label="Spouse Name">
            <input type="text" value={form.spouseName} onChange={(e) => updateField('spouseName', e.target.value)} className={inputCls} placeholder="Spouse's full name" />
          </FormField>
        )}

        <FormField label="Nationality" required>
          <input type="text" value={form.nationality} onChange={(e) => updateField('nationality', e.target.value)}
            className={`${inputCls} ${errors.nationality ? 'border-red-500' : ''}`} />
          {errors.nationality && <p className="text-red-400 text-xs mt-1">{errors.nationality}</p>}
        </FormField>

        <FormField label="Religion">
          <input type="text" value={form.religion} onChange={(e) => updateField('religion', e.target.value)} className={inputCls} placeholder="Optional" />
        </FormField>

        <FormField label="Alternate Phone Number" required>
          <input
            type="tel" value={form.alternatePhone}
            onChange={(e) => updateField('alternatePhone', e.target.value)}
            className={`${inputCls} ${errors.alternatePhone ? 'border-red-500' : ''}`}
            placeholder="Personal / alternate number"
          />
          {errors.alternatePhone && <p className="text-red-400 text-xs mt-1">{errors.alternatePhone}</p>}
        </FormField>

        <FormField label="Personal Email" required>
          <input type="email" value={form.personalEmail} onChange={(e) => updateField('personalEmail', e.target.value)}
            className={`${inputCls} ${errors.personalEmail ? 'border-red-500' : ''}`} placeholder="Personal email" />
          {errors.personalEmail && <p className="text-red-400 text-xs mt-1">{errors.personalEmail}</p>}
        </FormField>
      </div>

      {/* Address */}
      <div className="pt-2">
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Current Address <span className="text-red-400">*</span></h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Street" required className="md:col-span-2">
            <input type="text" value={form.address.street} onChange={(e) => updateNested('address', 'street', e.target.value)}
              className={`${inputCls} ${errors.addressStreet ? 'border-red-500' : ''}`} placeholder="Street address" />
            {errors.addressStreet && <p className="text-red-400 text-xs mt-1">{errors.addressStreet}</p>}
          </FormField>
          <FormField label="City" required>
            <input type="text" value={form.address.city} onChange={(e) => updateNested('address', 'city', e.target.value)}
              className={`${inputCls} ${errors.addressCity ? 'border-red-500' : ''}`} placeholder="City" />
            {errors.addressCity && <p className="text-red-400 text-xs mt-1">{errors.addressCity}</p>}
          </FormField>
          <FormField label="State" required>
            <input type="text" value={form.address.state} onChange={(e) => updateNested('address', 'state', e.target.value)}
              className={`${inputCls} ${errors.addressState ? 'border-red-500' : ''}`} placeholder="State" />
            {errors.addressState && <p className="text-red-400 text-xs mt-1">{errors.addressState}</p>}
          </FormField>
          <FormField label="PIN Code" required>
            <input type="text" value={form.address.zip} onChange={(e) => updateNested('address', 'zip', e.target.value)}
              className={`${inputCls} ${errors.addressZip ? 'border-red-500' : ''}`} placeholder="PIN code" />
            {errors.addressZip && <p className="text-red-400 text-xs mt-1">{errors.addressZip}</p>}
          </FormField>
          <FormField label="Country">
            <input type="text" value={form.address.country} onChange={(e) => updateNested('address', 'country', e.target.value)} className={inputCls} />
          </FormField>
        </div>
      </div>

      {/* Permanent Address */}
      <div className="pt-2">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-dark-300">Permanent Address</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox" checked={form.sameAsCurrentAddress}
              onChange={(e) => updateField('sameAsCurrentAddress', e.target.checked)}
              className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500"
            />
            <span className="text-xs text-dark-400">Same as current address</span>
          </label>
        </div>
        {!form.sameAsCurrentAddress && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Street" className="md:col-span-2">
              <input type="text" value={form.permanentAddress.street} onChange={(e) => updateNested('permanentAddress', 'street', e.target.value)} className={inputCls} />
            </FormField>
            <FormField label="City">
              <input type="text" value={form.permanentAddress.city} onChange={(e) => updateNested('permanentAddress', 'city', e.target.value)} className={inputCls} />
            </FormField>
            <FormField label="State">
              <input type="text" value={form.permanentAddress.state} onChange={(e) => updateNested('permanentAddress', 'state', e.target.value)} className={inputCls} />
            </FormField>
            <FormField label="PIN Code">
              <input type="text" value={form.permanentAddress.zip} onChange={(e) => updateNested('permanentAddress', 'zip', e.target.value)} className={inputCls} />
            </FormField>
            <FormField label="Country">
              <input type="text" value={form.permanentAddress.country} onChange={(e) => updateNested('permanentAddress', 'country', e.target.value)} className={inputCls} />
            </FormField>
          </div>
        )}
      </div>
    </div>
  );

  const renderFamily = () => (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <Users size={18} className="text-rivvra-400" />
        <h2 className="text-lg font-semibold text-white">Family & Emergency Contact</h2>
      </div>

      {/* Emergency Contact */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Emergency Contact <span className="text-red-400">*</span></h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="Name" required>
            <input type="text" value={form.emergencyContact.name} onChange={(e) => updateNested('emergencyContact', 'name', e.target.value)}
              className={`${inputCls} ${errors.emergencyName ? 'border-red-500' : ''}`} placeholder="Contact name" />
            {errors.emergencyName && <p className="text-red-400 text-xs mt-1">{errors.emergencyName}</p>}
          </FormField>
          <FormField label="Phone" required>
            <input type="tel" value={form.emergencyContact.phone} onChange={(e) => updateNested('emergencyContact', 'phone', e.target.value)}
              className={`${inputCls} ${errors.emergencyPhone ? 'border-red-500' : ''}`} placeholder="Phone number" />
            {errors.emergencyPhone && <p className="text-red-400 text-xs mt-1">{errors.emergencyPhone}</p>}
          </FormField>
          <FormField label="Relation" required>
            <select value={form.emergencyContact.relation} onChange={(e) => updateNested('emergencyContact', 'relation', e.target.value)}
              className={`${selectCls} ${errors.emergencyRelation ? 'border-red-500' : ''}`}>
              <option value="">Select</option>
              {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {errors.emergencyRelation && <p className="text-red-400 text-xs mt-1">{errors.emergencyRelation}</p>}
          </FormField>
        </div>
      </div>

      {/* Family Members */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-dark-300">Family Members</h3>
          <button type="button" onClick={addFamilyMember}
            className="flex items-center gap-1.5 text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors">
            <Plus size={14} /> Add Member
          </button>
        </div>

        {form.familyMembers.length === 0 && (
          <p className="text-dark-500 text-sm text-center py-6">No family members added yet. Click "Add Member" to start.</p>
        )}

        <div className="space-y-3">
          {form.familyMembers.map((fm, i) => (
            <div key={i} className="card p-4 relative">
              <button type="button" onClick={() => removeFamilyMember(i)}
                className="absolute top-3 right-3 text-dark-500 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <FormField label="Name">
                  <input type="text" value={fm.name} onChange={(e) => updateFamilyMember(i, 'name', e.target.value)} className={inputCls} placeholder="Full name" />
                </FormField>
                <FormField label="Relation">
                  <select value={fm.relation} onChange={(e) => updateFamilyMember(i, 'relation', e.target.value)} className={selectCls}>
                    <option value="">Select</option>
                    {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </FormField>
                <FormField label="Date of Birth">
                  <input type="date" value={fm.dateOfBirth} onChange={(e) => updateFamilyMember(i, 'dateOfBirth', e.target.value)} className={inputCls} />
                </FormField>
                <FormField label="Phone">
                  <input type="tel" value={fm.phone} onChange={(e) => updateFamilyMember(i, 'phone', e.target.value)}
                    className={`${inputCls} ${errors[`fm_phone_${i}`] ? 'border-red-500' : ''}`} placeholder="Phone" />
                  {errors[`fm_phone_${i}`] && <p className="text-red-400 text-xs mt-1">{errors[`fm_phone_${i}`]}</p>}
                </FormField>
                <FormField label="Dependent?">
                  <label className="flex items-center gap-2 py-2.5 cursor-pointer">
                    <input type="checkbox" checked={fm.isDependent}
                      onChange={(e) => updateFamilyMember(i, 'isDependent', e.target.checked)}
                      className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500" />
                    <span className="text-sm text-dark-300">Yes, dependent</span>
                  </label>
                </FormField>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderBank = () => (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <Building2 size={18} className="text-rivvra-400" />
        <h2 className="text-lg font-semibold text-white">Bank & Statutory Details</h2>
      </div>

      {/* Bank Details */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Bank Account <span className="text-red-400">*</span></h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Bank Name" required>
            <input type="text" value={form.bankDetails.bankName} onChange={(e) => updateNested('bankDetails', 'bankName', e.target.value)}
              className={`${inputCls} ${errors.bankName ? 'border-red-500' : ''}`} placeholder="Bank name" />
            {errors.bankName && <p className="text-red-400 text-xs mt-1">{errors.bankName}</p>}
          </FormField>
          <FormField label="Account Number" required>
            <input type="text" value={form.bankDetails.accountNumber} onChange={(e) => updateNested('bankDetails', 'accountNumber', e.target.value.replace(/\D/g, ''))}
              className={`${inputCls} ${errors.accountNumber ? 'border-red-500' : ''}`} placeholder="Account number" maxLength={18} />
            {errors.accountNumber && <p className="text-red-400 text-xs mt-1">{errors.accountNumber}</p>}
          </FormField>
          <FormField label="IFSC Code" required>
            <input type="text" value={form.bankDetails.ifsc} onChange={(e) => updateNested('bankDetails', 'ifsc', e.target.value.toUpperCase())}
              className={`${inputCls} ${errors.ifsc ? 'border-red-500' : ''}`} placeholder="SBIN0001234" maxLength={11} />
            {errors.ifsc && <p className="text-red-400 text-xs mt-1">{errors.ifsc}</p>}
          </FormField>
          <FormField label="PAN Number" required>
            <input type="text" value={form.bankDetails.pan} onChange={(e) => updateNested('bankDetails', 'pan', e.target.value.toUpperCase())}
              className={`${inputCls} ${errors.pan ? 'border-red-500' : ''}`} placeholder="ABCDE1234F" maxLength={10} />
            {errors.pan && <p className="text-red-400 text-xs mt-1">{errors.pan}</p>}
          </FormField>
        </div>
      </div>

      {/* Statutory */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Statutory / ID Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Aadhaar Number">
            <input type="text" value={form.statutory.aadhaar} onChange={(e) => updateNested('statutory', 'aadhaar', e.target.value.replace(/\D/g, ''))}
              className={`${inputCls} ${errors.aadhaar ? 'border-red-500' : ''}`} placeholder="12-digit Aadhaar" maxLength={12} />
            {errors.aadhaar && <p className="text-red-400 text-xs mt-1">{errors.aadhaar}</p>}
          </FormField>
          <FormField label="UAN (Universal Account Number)">
            <input type="text" value={form.statutory.uan} onChange={(e) => updateNested('statutory', 'uan', e.target.value)} className={inputCls} placeholder="UAN number" />
          </FormField>
          <FormField label="PF Number">
            <input type="text" value={form.statutory.pfNumber} onChange={(e) => updateNested('statutory', 'pfNumber', e.target.value)} className={inputCls} placeholder="PF account number" />
          </FormField>
          <FormField label="ESIC Number">
            <input type="text" value={form.statutory.esicNumber} onChange={(e) => updateNested('statutory', 'esicNumber', e.target.value)} className={inputCls} placeholder="ESIC number" />
          </FormField>
        </div>
      </div>

      {/* Bank Proof Document */}
      <div className="card p-4">
        <DocumentUpload
          orgSlug={currentOrg?.slug}
          category="bank_proof"
          required
          label="Bank Proof (Cancelled Cheque / Digital Passbook)"
          hasError={!!errors.bankDocs}
          onDocumentsChange={(docs) => setBankDocs(docs)}
        />
        {errors.bankDocs && <p className="text-red-400 text-xs mt-2">{errors.bankDocs}</p>}
      </div>
    </div>
  );

  const renderEducation = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <GraduationCap size={18} className="text-rivvra-400" />
          <h2 className="text-lg font-semibold text-white">Education <span className="text-red-400 text-sm">*</span></h2>
        </div>
        <button type="button" onClick={addEducation}
          className="flex items-center gap-1.5 text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors px-3 py-1.5 rounded-lg bg-rivvra-500/10">
          <Plus size={14} /> Add Education
        </button>
      </div>

      {errors.education && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {errors.education}
        </div>
      )}

      {form.education.length === 0 && (
        <div className={`text-center py-10 rounded-xl border border-dashed ${errors.education ? 'border-red-500/40 bg-red-500/5' : 'border-dark-700'}`}>
          <GraduationCap size={40} className="mx-auto mb-3 text-dark-600" />
          <p className="text-dark-500 text-sm">No education entries added yet.</p>
          <p className="text-dark-600 text-xs mt-1">Click "Add Education" to add your qualifications. <span className="text-red-400">*</span></p>
        </div>
      )}

      <div className="space-y-3">
        {form.education.map((ed, i) => (
          <div key={i} className="card p-4 relative">
            <button type="button" onClick={() => removeEducation(i)}
              className="absolute top-3 right-3 text-dark-500 hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label="Degree / Qualification" required>
                <input type="text" value={ed.degree} onChange={(e) => updateEducation(i, 'degree', e.target.value)}
                  className={`${inputCls} ${errors[`edu_degree_${i}`] ? 'border-red-500' : ''}`} placeholder="e.g. B.Tech, MBA" />
                {errors[`edu_degree_${i}`] && <p className="text-red-400 text-xs mt-1">{errors[`edu_degree_${i}`]}</p>}
              </FormField>
              <FormField label="Institution / University" required>
                <input type="text" value={ed.institution} onChange={(e) => updateEducation(i, 'institution', e.target.value)}
                  className={`${inputCls} ${errors[`edu_institution_${i}`] ? 'border-red-500' : ''}`} placeholder="Institution name" />
                {errors[`edu_institution_${i}`] && <p className="text-red-400 text-xs mt-1">{errors[`edu_institution_${i}`]}</p>}
              </FormField>
              <FormField label="Year of Passing">
                <input type="number" value={ed.yearOfPassing} onChange={(e) => updateEducation(i, 'yearOfPassing', e.target.value)} className={inputCls} placeholder="e.g. 2020" min={1950} max={2030} />
              </FormField>
              <FormField label="Percentage / CGPA">
                <input type="text" value={ed.percentage} onChange={(e) => updateEducation(i, 'percentage', e.target.value)} className={inputCls} placeholder="e.g. 85% or 8.5" />
              </FormField>
              <FormField label="Specialization" className="md:col-span-2">
                <input type="text" value={ed.specialization} onChange={(e) => updateEducation(i, 'specialization', e.target.value)} className={inputCls} placeholder="e.g. Computer Science" />
              </FormField>

              {/* Certificate Upload */}
              <div className="md:col-span-2 mt-1 pt-3 border-t border-dark-800">
                <DocumentUpload
                  orgSlug={currentOrg?.slug}
                  category="education_certificate"
                  educationIndex={i}
                  required
                  label={`Certificate / Degree Document`}
                  hasError={!!errors[`edu_docs_${i}`]}
                  onDocumentsChange={(docs) => setEducationDocs(prev => ({ ...prev, [i]: docs }))}
                />
                {errors[`edu_docs_${i}`] && <p className="text-red-400 text-xs mt-1">{errors[`edu_docs_${i}`]}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderReview = () => {
    const Section = ({ title, children }) => (
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-rivvra-400 mb-3">{title}</h3>
        {children}
      </div>
    );
    const Row = ({ label, value }) => (
      <div className="flex justify-between py-1.5 border-b border-dark-800 last:border-0">
        <span className="text-dark-400 text-sm">{label}</span>
        <span className="text-white text-sm text-right">{value || '\u2014'}</span>
      </div>
    );

    const addr = form.sameAsCurrentAddress ? form.address : form.permanentAddress;
    const addrStr = [addr.street, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(', ');

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardCheck size={18} className="text-rivvra-400" />
          <h2 className="text-lg font-semibold text-white">Review & Submit</h2>
        </div>
        <p className="text-dark-400 text-sm mb-4">Please review your information before submitting. You can go back to any step to make changes.</p>

        {errors.submit && (
          <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-4">
            {errors.submit}
          </div>
        )}

        <Section title="Personal Details">
          <Row label="Name" value={employee.fullName} />
          <Row label="Gender" value={form.gender} />
          <Row label="Date of Birth" value={form.dateOfBirth} />
          <Row label="Blood Group" value={form.bloodGroup} />
          <Row label="Father's Name" value={form.fatherName} />
          <Row label="Marital Status" value={form.maritalStatus} />
          {form.maritalStatus === 'Married' && <Row label="Spouse Name" value={form.spouseName} />}
          <Row label="Alternate Phone" value={form.alternatePhone} />
          <Row label="Personal Email" value={form.personalEmail} />
          <Row label="Current Address" value={[form.address.street, form.address.city, form.address.state].filter(Boolean).join(', ')} />
          <Row label="Permanent Address" value={form.sameAsCurrentAddress ? 'Same as current' : addrStr} />
        </Section>

        <Section title="Emergency Contact">
          <Row label="Name" value={form.emergencyContact.name} />
          <Row label="Phone" value={form.emergencyContact.phone} />
          <Row label="Relation" value={form.emergencyContact.relation} />
        </Section>

        {form.familyMembers.length > 0 && (
          <Section title={`Family Members (${form.familyMembers.length})`}>
            {form.familyMembers.map((fm, i) => (
              <Row key={i} label={fm.relation || 'Member'} value={`${fm.name}${fm.phone ? ` — ${fm.phone}` : ''}`} />
            ))}
          </Section>
        )}

        <Section title="Bank Details">
          <Row label="Bank Name" value={form.bankDetails.bankName} />
          <Row label="Account Number" value={form.bankDetails.accountNumber} />
          <Row label="IFSC" value={form.bankDetails.ifsc} />
          <Row label="PAN" value={form.bankDetails.pan} />
          <Row label="Bank Proof" value={`${bankDocs.length} document(s) uploaded`} />
        </Section>

        <Section title="Statutory Details">
          <Row label="Aadhaar" value={form.statutory.aadhaar} />
          <Row label="UAN" value={form.statutory.uan} />
          <Row label="PF Number" value={form.statutory.pfNumber} />
          <Row label="ESIC" value={form.statutory.esicNumber} />
        </Section>

        {form.education.length > 0 && (
          <Section title={`Education (${form.education.length})`}>
            {form.education.map((ed, i) => (
              <Row key={i} label={ed.degree || 'Qualification'} value={`${ed.institution || ''}${ed.yearOfPassing ? ` (${ed.yearOfPassing})` : ''} — ${(educationDocs[i]?.length || 0)} doc(s)`} />
            ))}
          </Section>
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
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center">
      <div className="w-full max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-white">Welcome to {currentOrg?.name || 'your workspace'}!</h1>
          <p className="text-dark-400 mt-1">Let's set up your profile. This will only take a few minutes.</p>
        </div>

        {/* Stepper */}
        <OnboardingStepper currentStep={step} />

        {/* Content */}
        <div className="mt-6 min-h-[300px]">
          {stepContent[step]?.()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-dark-800">
          <button
            type="button"
            onClick={goPrev}
            disabled={isFirst}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition-colors ${
              isFirst ? 'text-dark-600 cursor-not-allowed' : 'text-dark-300 hover:text-white hover:bg-dark-800'
            }`}
          >
            <ChevronLeft size={16} /> Previous
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <CheckCircle size={16} /> Submit & Continue
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors"
            >
              Next <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
