import { useState, useEffect, useCallback, useRef } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import employeeApi from '../../utils/employeeApi';
import { Plus, Edit2, Loader2, Users, Building2 } from 'lucide-react';
import { PageHeader, Panel, Chip, Button, Input, Textarea, Modal, EmptyState, PageSpinner } from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Departments are what every employee record is filed under. Everything from
// `const { currentOrg, getAppRole }` to `handleDelete` is spliced in verbatim,
// including the guard that only offers Delete when `employeeCount === 0` — the
// only thing standing between an admin and orphaning a department's staff.
//
// Not triggered: create, update, toggle active, delete.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', description: '' };

export default function EmployeeDepartmentsV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const modalRef = useRef(null);

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
      setDepartments([]);
      const res = await employeeApi.listDepartments(orgSlug);
      if (res.success) {
        setDepartments(res.departments);
      }
    } catch (err) {
      showToast('Failed to load departments', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, showToast]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  // ── Open modal ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingDept(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
    // Auto-focus first input after modal renders
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
  };

  const openEdit = (dept) => {
    setEditingDept(dept);
    setForm({ name: dept.name, description: dept.description || '' });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
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
  if (loading) return <PageSpinner label="Loading departments…" />;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Departments"
        actions={isAdmin && (
          <Button size="sm" onClick={openAdd} iconLeft={<Plus size={15} />}>Add Department</Button>
        )}
      />

      {/* Empty state */}
      {departments.length === 0 && (
        <Panel>
          <EmptyState icon={<Building2 size={22} />} title="No departments yet">
            {isAdmin
              ? 'Create your first department to organize your team.'
              : 'No departments have been created yet.'}
          </EmptyState>
        </Panel>
      )}

      {/* Department card grid */}
      {departments.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {departments.map((dept) => (
            <Panel key={dept._id}>
              <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
                {/* Top row: name + status */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{ font: "600 13.5px/1.35 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>{dept.name}</h3>
                  <span
                    title={dept.isActive ? 'Active' : 'Inactive'}
                    style={{
                      flexShrink: 0, width: 8, height: 8, borderRadius: 99, marginTop: 5,
                      background: dept.isActive ? 'var(--acc-emerald)' : 'var(--line-2)',
                    }}
                  />
                </div>

                {/* Description */}
                <p style={{
                  font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0, minHeight: '2.5rem',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {dept.description || 'No description'}
                </p>

                {/* Manager */}
                {dept.manager?.fullName && (
                  <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                    Manager: <span style={{ color: 'var(--fg-2)' }}>{dept.manager.fullName}</span>
                  </p>
                )}

                {/* Footer: employee count + edit */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--line-2)',
                }}>
                  <span style={{ display: 'inline-flex' }}>
                    {/* Neutral, not warn: legacy painted this count in plain grey
                        (bg-dark-700 / text-dark-300) and a headcount is not a
                        warning state. */}
                    <Chip tone="neutral">
                      <Users size={11} />
                      {dept.employeeCount ?? 0} employee{(dept.employeeCount ?? 0) !== 1 ? 's' : ''}
                    </Chip>
                  </span>

                  {isAdmin && (
                    <Button variant="ghost" size="sm" aria-label={`Edit ${dept.name}`}
                      onClick={() => openEdit(dept)} iconLeft={<Edit2 size={14} />} />
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* ── Modal (Add / Edit) ──────────────────────────────────────────── */}
      <Modal
        open={showModal}
        onClose={closeModal}
        size="sm"
        title={editingDept ? 'Edit Department' : 'Add Department'}
        footer={(
          <>
            <Button variant="secondary" size="sm" type="button" onClick={closeModal}>Close</Button>
            <Button size="sm" type="submit" form="dept-form" disabled={saving} block
              iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : undefined}>
              {editingDept ? 'Save Changes' : 'Create Department'}
            </Button>
          </>
        )}
      >
        {/* Form */}
        <form id="dept-form" ref={modalRef} onSubmit={handleSave} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label htmlFor="dept-name" style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 5 }}>
              Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <Input
              id="dept-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Engineering"
            />
          </div>

          <div>
            <label htmlFor="dept-desc" style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 5 }}>
              Description
            </label>
            <Textarea
              id="dept-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of this department"
              rows={3}
            />
          </div>

          {/* Active/Inactive toggle (edit mode only) */}
          {editingDept && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '2px 0' }}>
              <span style={{ font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>Status</span>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={toggleActive}
                disabled={saving}
                style={editingDept.isActive
                  ? { background: 'color-mix(in srgb, var(--acc-emerald) 14%, transparent)' }
                  : undefined}
              >
                {editingDept.isActive ? 'Active' : 'Inactive'}
              </Button>
            </div>
          )}

          {/* Delete (edit mode only, employeeCount must be 0) */}
          {editingDept && (editingDept.employeeCount ?? 0) === 0 && (
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                block
                onClick={handleDelete}
                disabled={deleting}
                style={{ color: 'var(--danger)' }}
                iconLeft={deleting ? <Loader2 size={14} className="animate-spin" /> : undefined}
              >
                Delete Department
              </Button>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
