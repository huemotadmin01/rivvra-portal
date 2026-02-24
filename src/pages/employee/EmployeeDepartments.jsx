import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import { Plus, Edit2, X, Loader2, Users, Building2 } from 'lucide-react';

const EMPTY_FORM = { name: '', description: '' };

export default function EmployeeDepartments() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();

  const isAdmin = getAppRole('employee') === 'admin';
  const orgSlug = currentOrg?.slug;

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null); // null = add, object = edit
  const [form, setForm] = useState(EMPTY_FORM);

  // ── Fetch departments ──────────────────────────────────────────────────
  const fetchDepartments = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await employeeApi.listDepartments(orgSlug);
      if (res.success) {
        setDepartments(res.departments);
      }
    } catch (err) {
      showToast('Failed to load departments', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  // ── Open modal ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingDept(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (dept) => {
    setEditingDept(dept);
    setForm({ name: dept.name, description: dept.description || '' });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingDept(null);
    setForm(EMPTY_FORM);
  };

  // ── Save (create or update) ────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      setSaving(true);
      if (editingDept) {
        const res = await employeeApi.updateDepartment(orgSlug, editingDept._id, {
          name: form.name.trim(),
          description: form.description.trim(),
          isActive: editingDept.isActive,
        });
        if (res.success) {
          showToast('Department updated');
        }
      } else {
        const res = await employeeApi.createDepartment(orgSlug, {
          name: form.name.trim(),
          description: form.description.trim(),
        });
        if (res.success) {
          showToast('Department created');
        }
      }
      closeModal();
      fetchDepartments();
    } catch (err) {
      showToast(err.message || 'Failed to save department', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle active ──────────────────────────────────────────────────────
  const toggleActive = async () => {
    if (!editingDept) return;
    try {
      setSaving(true);
      const res = await employeeApi.updateDepartment(orgSlug, editingDept._id, {
        isActive: !editingDept.isActive,
      });
      if (res.success) {
        setEditingDept({ ...editingDept, isActive: !editingDept.isActive });
        showToast(`Department ${editingDept.isActive ? 'deactivated' : 'activated'}`);
        fetchDepartments();
      }
    } catch (err) {
      showToast('Failed to update status', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!editingDept) return;
    try {
      setDeleting(true);
      const res = await employeeApi.deleteDepartment(orgSlug, editingDept._id);
      if (res.success) {
        showToast('Department deleted');
        closeModal();
        fetchDepartments();
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete department', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Departments</h1>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="bg-rivvra-500 text-dark-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-2 transition-colors"
          >
            <Plus size={16} />
            Add Department
          </button>
        )}
      </div>

      {/* Empty state */}
      {departments.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="w-12 h-12 text-dark-500 mb-4" />
          <p className="text-dark-300 text-lg font-medium mb-1">No departments yet</p>
          <p className="text-dark-500 text-sm">
            {isAdmin
              ? 'Create your first department to organize your team.'
              : 'No departments have been created yet.'}
          </p>
        </div>
      )}

      {/* Department card grid */}
      {departments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div key={dept._id} className="card p-5 flex flex-col gap-3">
              {/* Top row: name + status */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-white font-semibold text-base leading-snug">{dept.name}</h3>
                <span
                  className={`shrink-0 inline-block w-2 h-2 rounded-full mt-1.5 ${
                    dept.isActive ? 'bg-emerald-400' : 'bg-dark-500'
                  }`}
                  title={dept.isActive ? 'Active' : 'Inactive'}
                />
              </div>

              {/* Description */}
              <p className="text-dark-400 text-sm line-clamp-2 min-h-[2.5rem]">
                {dept.description || 'No description'}
              </p>

              {/* Manager */}
              {dept.manager?.fullName && (
                <p className="text-dark-500 text-xs">
                  Manager: <span className="text-dark-300">{dept.manager.fullName}</span>
                </p>
              )}

              {/* Footer: employee count + edit */}
              <div className="flex items-center justify-between mt-auto pt-2 border-t border-dark-700/50">
                <span className="bg-orange-500/10 text-orange-400 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Users size={12} />
                  {dept.employeeCount ?? 0} employee{(dept.employeeCount ?? 0) !== 1 ? 's' : ''}
                </span>

                {isAdmin && (
                  <button
                    onClick={() => openEdit(dept)}
                    className="text-dark-400 hover:text-white transition-colors p-1 rounded"
                  >
                    <Edit2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal (Add / Edit) ──────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">
                {editingDept ? 'Edit Department' : 'Add Department'}
              </h3>
              <button
                onClick={closeModal}
                className="text-dark-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Engineering"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of this department"
                  rows={3}
                  className="input-field min-h-[80px]"
                />
              </div>

              {/* Active/Inactive toggle (edit mode only) */}
              {editingDept && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-dark-300">Status</span>
                  <button
                    type="button"
                    onClick={toggleActive}
                    disabled={saving}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                      editingDept.isActive
                        ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        : 'bg-dark-700 text-dark-500 hover:bg-dark-600'
                    }`}
                  >
                    {editingDept.isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {editingDept ? 'Save Changes' : 'Create Department'}
                </button>
              </div>

              {/* Delete (edit mode only, employeeCount must be 0) */}
              {editingDept && (editingDept.employeeCount ?? 0) === 0 && (
                <div className="pt-3 border-t border-dark-700">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2"
                  >
                    {deleting && <Loader2 size={14} className="animate-spin" />}
                    Delete Department
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
