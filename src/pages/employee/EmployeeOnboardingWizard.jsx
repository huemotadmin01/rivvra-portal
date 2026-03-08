import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import employeeApi from '../../utils/employeeApi';
import OnboardingStepper from '../../components/employee/OnboardingStepper';
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
  bankDetails: { bankName: '', accountNumber: '', ifscCode: '', pan: '' },
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
            bankDetails: emp.bankDetails || prev.bankDetails,
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

  const removeEducation = (idx) => {
    setForm((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== idx),
    }));
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  const validateStep = () => {
    const errs = {};
    if (step === 'personal') {
      if (!form.alternatePhone.trim()) errs.alternatePhone = 'Alternate phone is required';
    }
    if (step === 'family') {
      if (!form.emergencyContact.name?.trim()) errs.emergencyName = 'Emergency contact name is required';
      if (!form.emergencyContact.phone?.trim()) errs.emergencyPhone = 'Emergency contact phone is required';
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

        <FormField label="Gender">
          <select value={form.gender} onChange={(e) => updateField('gender', e.target.value)} className={selectCls}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </FormField>

        <FormField label="Date of Birth">
          <input type="date" value={form.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} className={inputCls} />
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

        <FormField label="Marital Status">
          <select value={form.maritalStatus} onChange={(e) => updateField('maritalStatus', e.target.value)} className={selectCls}>
            <option value="">Select status</option>
            {MARITAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>

        {form.maritalStatus === 'Married' && (
          <FormField label="Spouse Name">
            <input type="text" value={form.spouseName} onChange={(e) => updateField('spouseName', e.target.value)} className={inputCls} placeholder="Spouse's full name" />
          </FormField>
        )}

        <FormField label="Nationality">
          <input type="text" value={form.nationality} onChange={(e) => updateField('nationality', e.target.value)} className={inputCls} />
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

        <FormField label="Personal Email">
          <input type="email" value={form.personalEmail} onChange={(e) => updateField('personalEmail', e.target.value)} className={inputCls} placeholder="Personal email" />
        </FormField>
      </div>

      {/* Address */}
      <div className="pt-2">
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Current Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Street" className="md:col-span-2">
            <input type="text" value={form.address.street} onChange={(e) => updateNested('address', 'street', e.target.value)} className={inputCls} placeholder="Street address" />
          </FormField>
          <FormField label="City">
            <input type="text" value={form.address.city} onChange={(e) => updateNested('address', 'city', e.target.value)} className={inputCls} placeholder="City" />
          </FormField>
          <FormField label="State">
            <input type="text" value={form.address.state} onChange={(e) => updateNested('address', 'state', e.target.value)} className={inputCls} placeholder="State" />
          </FormField>
          <FormField label="PIN Code">
            <input type="text" value={form.address.zip} onChange={(e) => updateNested('address', 'zip', e.target.value)} className={inputCls} placeholder="PIN code" />
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
          <FormField label="Relation">
            <select value={form.emergencyContact.relation} onChange={(e) => updateNested('emergencyContact', 'relation', e.target.value)} className={selectCls}>
              <option value="">Select</option>
              {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
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
                  <input type="tel" value={fm.phone} onChange={(e) => updateFamilyMember(i, 'phone', e.target.value)} className={inputCls} placeholder="Phone" />
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
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Bank Account</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Bank Name">
            <input type="text" value={form.bankDetails.bankName} onChange={(e) => updateNested('bankDetails', 'bankName', e.target.value)} className={inputCls} placeholder="Bank name" />
          </FormField>
          <FormField label="Account Number">
            <input type="text" value={form.bankDetails.accountNumber} onChange={(e) => updateNested('bankDetails', 'accountNumber', e.target.value)} className={inputCls} placeholder="Account number" />
          </FormField>
          <FormField label="IFSC Code">
            <input type="text" value={form.bankDetails.ifscCode || form.bankDetails.ifsc || ''} onChange={(e) => updateNested('bankDetails', 'ifscCode', e.target.value)} className={inputCls} placeholder="IFSC code" />
          </FormField>
          <FormField label="PAN Number">
            <input type="text" value={form.bankDetails.pan} onChange={(e) => updateNested('bankDetails', 'pan', e.target.value)} className={inputCls} placeholder="ABCDE1234F" />
          </FormField>
        </div>
      </div>

      {/* Statutory */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-dark-300 mb-3">Statutory / ID Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Aadhaar Number">
            <input type="text" value={form.statutory.aadhaar} onChange={(e) => updateNested('statutory', 'aadhaar', e.target.value)} className={inputCls} placeholder="12-digit Aadhaar" maxLength={12} />
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
    </div>
  );

  const renderEducation = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <GraduationCap size={18} className="text-rivvra-400" />
          <h2 className="text-lg font-semibold text-white">Education</h2>
        </div>
        <button type="button" onClick={addEducation}
          className="flex items-center gap-1.5 text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors px-3 py-1.5 rounded-lg bg-rivvra-500/10">
          <Plus size={14} /> Add Education
        </button>
      </div>

      {form.education.length === 0 && (
        <div className="text-center py-10">
          <GraduationCap size={40} className="mx-auto mb-3 text-dark-600" />
          <p className="text-dark-500 text-sm">No education entries added yet.</p>
          <p className="text-dark-600 text-xs mt-1">Click "Add Education" to add your qualifications.</p>
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
              <FormField label="Degree / Qualification">
                <input type="text" value={ed.degree} onChange={(e) => updateEducation(i, 'degree', e.target.value)} className={inputCls} placeholder="e.g. B.Tech, MBA" />
              </FormField>
              <FormField label="Institution / University">
                <input type="text" value={ed.institution} onChange={(e) => updateEducation(i, 'institution', e.target.value)} className={inputCls} placeholder="Institution name" />
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
          <Row label="IFSC" value={form.bankDetails.ifscCode || form.bankDetails.ifsc} />
          <Row label="PAN" value={form.bankDetails.pan} />
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
              <Row key={i} label={ed.degree || 'Qualification'} value={`${ed.institution || ''}${ed.yearOfPassing ? ` (${ed.yearOfPassing})` : ''}`} />
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
    <div className="p-6 max-w-3xl mx-auto">
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
  );
}
