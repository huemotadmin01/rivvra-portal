import { useState, useEffect, useCallback, useRef } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import {
  Plus, Edit2, X, Loader2, Trash2,
  Users, Tag, Check, ShieldAlert, Mail, Eye,
  RotateCcw, Save,
} from 'lucide-react';

/* ── Tab definitions ──────────────────────────────────────────────────── */
const TABS = [
  { key: 'roles', label: 'Roles', icon: Users },
  { key: 'tags',  label: 'Tags',  icon: Tag },
  { key: 'email_templates', label: 'Email Templates', icon: Mail },
];

/* ── Predefined colors ────────────────────────────────────────────────── */
const PREDEFINED_COLORS = [
  { name: 'Blue',    value: '#3b82f6' },
  { name: 'Indigo',  value: '#6366f1' },
  { name: 'Purple',  value: '#8b5cf6' },
  { name: 'Pink',    value: '#ec4899' },
  { name: 'Red',     value: '#ef4444' },
  { name: 'Orange',  value: '#f97316' },
  { name: 'Amber',   value: '#f59e0b' },
  { name: 'Green',   value: '#22c55e' },
  { name: 'Teal',    value: '#14b8a6' },
  { name: 'Cyan',    value: '#06b6d4' },
];

/* ── Roles Section ────────────────────────────────────────────────────── */
function RolesSection({ orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#3b82f6', sequence: 0 });

  const fetchRoles = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await signApi.listRoles(orgSlug);
      if (res.success !== false) {
        const items = res.roles || res.items || [];
        setRoles(items.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
      }
    } catch {
      showToast('Failed to load roles', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const openAdd = () => {
    setEditingItem(null);
    const nextSeq = roles.length > 0 ? Math.max(...roles.map((r) => r.sequence ?? 0)) + 1 : 1;
    setForm({ name: '', color: '#3b82f6', sequence: nextSeq });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input[type="text"]')?.focus(), 50);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      color: item.color || '#3b82f6',
      sequence: item.sequence ?? 0,
    });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input[type="text"]')?.focus(), 50);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setForm({ name: '', color: '#3b82f6', sequence: 0 });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        color: form.color,
        sequence: Number(form.sequence) || 0,
      };
      if (editingItem) {
        const res = await signApi.updateRole(orgSlug, editingItem._id, payload);
        if (res.success !== false) showToast('Role updated');
      } else {
        const res = await signApi.createRole(orgSlug, payload);
        if (res.success !== false) showToast('Role created');
      }
      closeModal();
      fetchRoles();
    } catch (err) {
      showToast(err.message || 'Failed to save role', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    try {
      setDeleting(true);
      const res = await signApi.deleteRole(orgSlug, editingItem._id);
      if (res.success !== false) {
        showToast('Role deleted');
        closeModal();
        fetchRoles();
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete role', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }

  return (
    <>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Roles</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">
              {roles.length}
            </span>
          </div>
          <button
            onClick={openAdd}
            className="bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-400 flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} />
            Add Role
          </button>
        </div>

        {roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No roles yet</p>
            <p className="text-dark-500 text-sm">
              Create roles to define signer types for your templates.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Name</th>
                  <th className="text-center px-4 py-2.5 text-dark-400 font-medium hidden sm:table-cell">Color</th>
                  <th className="text-center px-4 py-2.5 text-dark-400 font-medium hidden sm:table-cell">Sequence</th>
                  <th className="text-center px-4 py-2.5 text-dark-400 font-medium hidden md:table-cell">Default</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: role.color || '#3b82f6' }}
                        />
                        <span className="text-white">{role.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span
                        className="inline-block w-5 h-5 rounded-full border border-dark-600"
                        style={{ backgroundColor: role.color || '#3b82f6' }}
                        title={role.color}
                      />
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className="text-dark-400 text-xs font-mono">{role.sequence ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {role.isDefault ? (
                        <Check size={14} className="text-indigo-400 mx-auto" />
                      ) : (
                        <span className="text-dark-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(role)}
                        className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700"
                        title="Edit role"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') closeModal(); }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">
                {editingItem ? 'Edit Role' : 'Add Role'}
              </h3>
              <button onClick={closeModal} className="text-dark-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Role Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Employee, Manager, Witness"
                  className="input-field"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm({ ...form, color: c.value })}
                      title={c.name}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        form.color === c.value
                          ? 'border-white scale-110'
                          : 'border-transparent hover:border-dark-500'
                      }`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>

              {/* Sequence */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Sequence</label>
                <input
                  type="number"
                  value={form.sequence}
                  onChange={(e) => setForm({ ...form, sequence: e.target.value })}
                  placeholder="0"
                  className="input-field"
                  min="0"
                />
              </div>

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
                  {editingItem ? 'Save Changes' : 'Create Role'}
                </button>
              </div>

              {editingItem && (
                <div className="pt-3 border-t border-dark-700">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete Role
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Tags Section ─────────────────────────────────────────────────────── */
function TagsSection({ orgSlug, showToast }) {
  const modalRef = useRef(null);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#6366f1' });

  const fetchTags = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      const res = await signApi.listTags(orgSlug);
      if (res.success !== false) {
        setTags(res.tags || res.items || []);
      }
    } catch {
      showToast('Failed to load tags', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const openAdd = () => {
    setEditingItem(null);
    setForm({ name: '', color: '#6366f1' });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input[type="text"]')?.focus(), 50);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({ name: item.name, color: item.color || '#6366f1' });
    setShowModal(true);
    setTimeout(() => modalRef.current?.querySelector('input[type="text"]')?.focus(), 50);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setForm({ name: '', color: '#6366f1' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      setSaving(true);
      const payload = { name: form.name.trim(), color: form.color };
      if (editingItem) {
        const res = await signApi.updateTag(orgSlug, editingItem._id, payload);
        if (res.success !== false) showToast('Tag updated');
      } else {
        const res = await signApi.createTag(orgSlug, payload);
        if (res.success !== false) showToast('Tag created');
      }
      closeModal();
      fetchTags();
    } catch (err) {
      showToast(err.message || 'Failed to save tag', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    try {
      setDeleting(true);
      const res = await signApi.deleteTag(orgSlug, editingItem._id);
      if (res.success !== false) {
        showToast('Tag deleted');
        closeModal();
        fetchTags();
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete tag', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }

  return (
    <>
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-dark-400" />
            <h3 className="text-white font-semibold">Tags</h3>
            <span className="text-xs bg-dark-700 text-dark-400 px-2 py-0.5 rounded-full">
              {tags.length}
            </span>
          </div>
          <button
            onClick={openAdd}
            className="bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-400 flex items-center gap-1.5 transition-colors"
          >
            <Plus size={14} />
            Add Tag
          </button>
        </div>

        {tags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Tag className="w-10 h-10 text-dark-500 mb-3" />
            <p className="text-dark-300 font-medium mb-1">No tags yet</p>
            <p className="text-dark-500 text-sm">
              Create tags to categorize and organize your sign templates.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-2.5 text-dark-400 font-medium">Name</th>
                  <th className="text-center px-4 py-2.5 text-dark-400 font-medium hidden sm:table-cell">Color</th>
                  <th className="text-right px-4 py-2.5 text-dark-400 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag._id} className="border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color || '#6366f1' }}
                        />
                        <span className="text-white">{tag.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span
                        className="inline-block w-5 h-5 rounded-full border border-dark-600"
                        style={{ backgroundColor: tag.color || '#6366f1' }}
                        title={tag.color}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(tag)}
                        className="text-dark-400 hover:text-white transition-colors p-1.5 rounded hover:bg-dark-700"
                        title="Edit tag"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tag Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') closeModal(); }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">
                {editingItem ? 'Edit Tag' : 'Add Tag'}
              </h3>
              <button onClick={closeModal} className="text-dark-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Tag Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Contracts, HR, Legal"
                  className="input-field"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm({ ...form, color: c.value })}
                      title={c.name}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        form.color === c.value
                          ? 'border-white scale-110'
                          : 'border-transparent hover:border-dark-500'
                      }`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>

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
                  {editingItem ? 'Save Changes' : 'Create Tag'}
                </button>
              </div>

              {editingItem && (
                <div className="pt-3 border-t border-dark-700">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-4 py-2 transition-colors flex items-center justify-center gap-2"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete Tag
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Sign Email Templates Section ────────────────────────────────────── */

const SIGN_TEMPLATE_LABELS = {
  sign_request_sent: 'Signing Request (to Signer)',
  sign_completed: 'Document Completed (to Creator)',
  sign_refused: 'Signing Refused (to Creator)',
};

const SIGN_TEMPLATE_KEYS = ['sign_request_sent', 'sign_completed', 'sign_refused'];

function SignEmailTemplatesSection({ orgSlug, showToast }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editForm, setEditForm] = useState({ subject: '', htmlBody: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await signApi.listEmailTemplates(orgSlug);
      if (res.success) setTemplates(res.templates || []);
    } catch {
      showToast('Failed to load email templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const getTemplate = (key) => templates.find(t => t.key === key);

  const handleEdit = (key) => {
    const t = getTemplate(key);
    setEditForm({
      subject: t?.subject || '',
      htmlBody: t?.htmlBody || '',
      name: t?.name || SIGN_TEMPLATE_LABELS[key] || key,
    });
    setEditingKey(key);
    setPreviewHtml(null);
  };

  const handleSave = async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      const res = await signApi.updateEmailTemplate(orgSlug, editingKey, editForm);
      if (res.success) {
        showToast('Email template saved', 'success');
        setEditingKey(null);
        loadData();
      }
    } catch {
      showToast('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async (key) => {
    try {
      const res = await signApi.deleteEmailTemplate(orgSlug, key);
      if (res.success) {
        showToast('Reverted to system default', 'success');
        loadData();
      }
    } catch {
      showToast('No custom override to revert', 'error');
    }
  };

  const handlePreview = async (key) => {
    setPreviewLoading(true);
    try {
      const res = await signApi.previewEmailTemplate(orgSlug, key);
      if (res.success) setPreviewHtml(res.html);
    } catch {
      showToast('Preview failed', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const placeholderChips = ['signerName', 'documentName', 'senderName', 'creatorName', 'orgName', 'signingUrl', 'requestUrl', 'message', 'completedDate', 'refusedDate', 'refuseReason'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-rivvra-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Mail size={18} className="text-rivvra-400" />
          Sign Email Templates
        </h3>
        <p className="text-dark-400 text-sm mb-4">
          Manage emails sent during the signing process — request, completion, and refusal notifications.
        </p>

        <div className="bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Template</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Subject</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Recipient</th>
                <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {SIGN_TEMPLATE_KEYS.map(key => {
                const tpl = getTemplate(key);
                const recipientMap = {
                  sign_request_sent: 'Signer',
                  sign_completed: 'Creator',
                  sign_refused: 'Creator',
                };
                return (
                  <tr key={key} className="border-b border-dark-700/50 hover:bg-dark-750/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{SIGN_TEMPLATE_LABELS[key]}</span>
                        {tpl?.isCustom && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">Custom</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-dark-400 truncate block max-w-[300px]">{tpl?.subject || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-dark-300 bg-dark-700 px-2 py-0.5 rounded">{recipientMap[key]}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handlePreview(key)} className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors" title="Preview">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => handleEdit(key)} className="p-1.5 text-dark-400 hover:text-rivvra-400 rounded transition-colors" title="Edit">
                          <Edit2 size={14} />
                        </button>
                        {tpl?.isCustom && (
                          <button onClick={() => handleRevert(key)} className="p-1.5 text-dark-400 hover:text-amber-400 rounded transition-colors" title="Revert to default">
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingKey && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-xl border border-dark-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <div>
                <h3 className="text-lg font-semibold text-white">Edit Email Template</h3>
                <p className="text-sm text-dark-400 mt-0.5">{SIGN_TEMPLATE_LABELS[editingKey] || editingKey}</p>
              </div>
              <button onClick={() => setEditingKey(null)} className="text-dark-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">Available Placeholders</label>
                <div className="flex flex-wrap gap-1.5">
                  {placeholderChips.map(p => (
                    <button
                      key={p}
                      onClick={() => navigator.clipboard.writeText(`{{${p}}}`).then(() => showToast(`Copied {{${p}}}`, 'success'))}
                      className="text-xs bg-dark-700 text-rivvra-400 px-2 py-1 rounded hover:bg-dark-600 transition-colors cursor-pointer font-mono"
                    >
                      {`{{${p}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={editForm.subject}
                  onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:border-rivvra-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">HTML Body</label>
                <textarea
                  value={editForm.htmlBody}
                  onChange={e => setEditForm(f => ({ ...f, htmlBody: e.target.value }))}
                  rows={14}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm font-mono focus:border-rivvra-500 focus:outline-none resize-y"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-5 border-t border-dark-700">
              <button
                onClick={() => handlePreview(editingKey)}
                disabled={previewLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-dark-700 text-dark-200 rounded-lg hover:bg-dark-600 transition-colors"
              >
                {previewLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                Preview
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditingKey(null)} className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-500 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-dark-800 border-b border-dark-700">
              <h3 className="text-sm font-semibold text-white">Email Preview</h3>
              <button onClick={() => setPreviewHtml(null)} className="text-dark-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[80vh]">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[600px] border-0"
                title="Email Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main SignConfig Component ────────────────────────────────────────── */
export default function SignConfig() {
  const { currentOrg, getAppRole } = useOrg();
  const { showToast } = useToast();

  const orgSlug = currentOrg?.slug;
  const isAdmin = getAppRole('sign') === 'admin';

  const [activeTab, setActiveTab] = useState('roles');

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-20 text-dark-400">
          <ShieldAlert size={48} className="mb-4 opacity-40" />
          <p className="text-lg">Admin access required</p>
          <p className="text-sm text-dark-500 mt-1">Only admins can manage Sign configuration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Sign Configuration</h1>
        <p className="text-dark-400 text-sm mt-1">Manage roles and tags for your sign templates</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-dark-900 rounded-xl p-1 border border-dark-800 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-dark-800 text-white shadow-sm'
                  : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/50'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'roles' && (
        <RolesSection orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'tags' && (
        <TagsSection orgSlug={orgSlug} showToast={showToast} />
      )}
      {activeTab === 'email_templates' && (
        <SignEmailTemplatesSection orgSlug={orgSlug} showToast={showToast} />
      )}
    </div>
  );
}
