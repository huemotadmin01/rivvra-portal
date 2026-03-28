/**
 * Role-based field permissions for employee inline editing.
 *
 * admin    — can edit all fields
 * manager  — can edit direct reports' limited work fields
 * self     — can edit own personal fields (no bank details)
 */

const FIELD_PERMISSIONS = {
  // Work Information
  email:              { admin: true, manager: false, self: false },
  phone:              { admin: true, manager: true,  self: false },
  employeeId:         { admin: true, manager: false, self: false },
  department:         { admin: true, manager: true,  self: false },
  designation:        { admin: true, manager: true,  self: false },
  manager:            { admin: true, manager: true,  self: false },
  employmentType:     { admin: true, manager: false, self: false },
  joiningDate:        { admin: true, manager: false, self: false },
  billable:           { admin: true, manager: true,  self: false },
  salaryDisbursement: { admin: true, manager: false, self: false },

  // Personal Information
  privateEmail:       { admin: true, manager: false, self: true },
  privatePhone:       { admin: true, manager: false, self: true },
  dateOfBirth:        { admin: true, manager: false, self: true },
  gender:             { admin: true, manager: false, self: true },
  bloodGroup:         { admin: true, manager: false, self: true },
  fatherName:         { admin: true, manager: false, self: true },
  spouseName:         { admin: true, manager: false, self: true },
  nationality:        { admin: true, manager: false, self: true },
  maritalStatus:      { admin: true, manager: false, self: true },
  religion:           { admin: true, manager: false, self: true },

  // Address
  'address.street':   { admin: true, manager: false, self: true },
  'address.street2':  { admin: true, manager: false, self: true },
  'address.city':     { admin: true, manager: false, self: true },
  'address.state':    { admin: true, manager: false, self: true },
  'address.zip':      { admin: true, manager: false, self: true },
  'address.country':  { admin: true, manager: false, self: true },

  // Emergency Contact
  'emergencyContact.name':     { admin: true, manager: false, self: true },
  'emergencyContact.phone':    { admin: true, manager: false, self: true },
  'emergencyContact.relation': { admin: true, manager: false, self: true },

  // Bank Details — admin only
  'bankDetails.accountNumber': { admin: true, manager: false, self: false },
  'bankDetails.ifsc':          { admin: true, manager: false, self: false },
  'bankDetails.pan':           { admin: true, manager: false, self: false },
  'bankDetails.bankName':      { admin: true, manager: false, self: false },

  // Statutory — admin only
  'statutory.aadhaar':    { admin: true, manager: false, self: false },
  'statutory.uan':        { admin: true, manager: false, self: false },
  'statutory.pfNumber':   { admin: true, manager: false, self: false },
  'statutory.esicNumber': { admin: true, manager: false, self: false },
};

const REQUIRED_FIELDS = new Set([
  'employeeId', 'email', 'department', 'joiningDate', 'manager',
  'phone', 'dateOfBirth', 'gender', 'fatherName', 'bankDetails.pan',
]);

/**
 * Get permission for a field based on viewer role.
 * @param {string} fieldKey - dot-notation field key
 * @param {'admin'|'manager'|'member'} role - viewer's app role
 * @param {boolean} isSelf - viewer is the employee themselves
 * @param {boolean} isDirectReport - employee is viewer's direct report
 * @returns {{ editable: boolean, required: boolean }}
 */
export function getFieldPermission(fieldKey, role, isSelf, isDirectReport) {
  const perm = FIELD_PERMISSIONS[fieldKey];
  if (!perm) return { editable: false, required: false };

  let editable = false;
  if (role === 'admin') {
    editable = perm.admin;
  } else if (isSelf) {
    editable = perm.self;
  } else if (isDirectReport) {
    editable = perm.manager;
  }

  return {
    editable,
    required: REQUIRED_FIELDS.has(fieldKey),
  };
}

/** Fields that self-service endpoint accepts */
export const SELF_EDITABLE_FIELDS = [
  'privateEmail', 'privatePhone', 'dateOfBirth', 'gender', 'bloodGroup',
  'fatherName', 'spouseName', 'nationality', 'maritalStatus', 'religion',
  'alternatePhone', 'emergencyContact', 'address', 'permanentAddress',
];

/** Fields that manager can update on direct reports */
export const MANAGER_EDITABLE_FIELDS = [
  'department', 'designation', 'manager', 'billable', 'phone',
];
