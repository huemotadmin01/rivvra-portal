import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import employeeApi from '../../utils/employeeApi';
import api from '../../utils/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Plus, Edit2, Trash2, Loader2, FileText, ChevronDown, ChevronUp,
  UserCheck, User, Shield, Monitor, Clock, CheckCircle, Users,
} from 'lucide-react';

const RESPONSIBLE_TYPES = [
  { value: 'hr', label: 'HR', icon: Shield },
  { value: 'manager', label: 'Manager', icon: UserCheck },
  { value: 'employee', label: 'Employee', icon: User },
  { value: 'it', label: 'IT', icon: Monitor },
];

const PLAN_TYPES = [
  { value: 'onboarding', label: 'Onboarding', color: 'bg-green-500/10 text-green-400' },
  { value: 'offboarding', label: 'Offboarding', color: 'bg-amber-500/10 text-amber-400' },
];

function Badge({ children, className }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Task Editor (used inside template form)
// ---------------------------------------------------------------------------
function TaskEditor({ tasks, onChange, members = [] }) {
  const addTask = () => {
    onChange([...tasks, { title: '', description: '', responsibleType: 'hr', relativeDays: 0, isMandatory: false, assignedToUserId: '', assignedToName: '' }]);
  };

  const updateTask = (idx, key, value) => {
    const copy = [...tasks];
    copy[idx] = { ...copy[idx], [key]: value };
    onChange(copy);
  };

  const handleAssignedChange = (idx, userId) => {
    const copy = [...tasks];
    if (!userId) {
      copy[idx] = { ...copy[idx], assignedToUserId: '', assignedToName: '' };
    } else {
      const member = members.find(m => m.userId === userId);
      copy[idx] = { ...copy[idx], assignedToUserId: userId, assignedToName: member?.name || '' };
    }
    onChange(copy);
  };

  const removeTask = (idx) => {
    onChange(tasks.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-dark-300">Tasks</label>
        <button type="button" onClick={addTask} className="flex items-center gap-1 text-xs text-rivvra-400 hover:text-rivvra-300">
          <Plus size={14} /> Add Task
        </button>
      </div>
      {tasks.length === 0 && (
        <p className="text-dark-500 text-sm text-center py-4">No tasks added yet.</p>
      )}
      <div className="space-y-2">
        {tasks.map((task, i) => (
          <div key={i} className="bg-dark-800 rounded-xl p-3 border border-dark-700 relative group">
            <button type="button" onClick={() => removeTask(i)}
              className="absolute top-2 right-2 text-dark-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
              <Trash2 size={14} />
            </button>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 items-start">
              <input
                type="text" value={task.title} placeholder="Task title"
                onChange={(e) => updateTask(i, 'title', e.target.value)}
                className="px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
              />
              <select
                value={task.responsibleType} onChange={(e) => updateTask(i, 'responsibleType', e.target.value)}
                className="px-2 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500"
              >
                {RESPONSIBLE_TYPES.map((rt) => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <Clock size={12} className="text-dark-500" />
                <input
                  type="number" value={task.relativeDays} min={0} max={90}
                  onChange={(e) => updateTask(i, 'relativeDays', Number(e.target.value))}
                  className="w-14 px-2 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white text-sm text-center focus:outline-none focus:border-rivvra-500"
                />
                <span className="text-dark-500 text-xs">days</span>
              </div>
              <label className="flex items-center gap-1.5 py-2 cursor-pointer">
                <input
                  type="checkbox" checked={task.isMandatory}
                  onChange={(e) => updateTask(i, 'isMandatory', e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-dark-600 bg-dark-900 text-rivvra-500 focus:ring-rivvra-500"
                />
                <span className="text-xs text-dark-400">Required</span>
              </label>
            </div>
            {/* Row 2: Description + Assigned to */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mt-2">
              <input
                type="text" value={task.description || ''} placeholder="Description (optional)"
                onChange={(e) => updateTask(i, 'description', e.target.value)}
                className="w-full px-3 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-dark-300 text-xs placeholder-dark-600 focus:outline-none focus:border-rivvra-500"
              />
              <div className="flex items-center gap-1">
                <Users size={12} className="text-dark-500 flex-shrink-0" />
                <select
                  value={task.assignedToUserId || ''}
                  onChange={(e) => handleAssignedChange(i, e.target.value)}
                  className="px-2 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-dark-300 text-xs focus:outline-none focus:border-rivvra-500 min-w-[140px]"
                >
                  <option value="">Auto (by role)</option>
                  {members.map(m => (
                    <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function PlanTemplates() {
  usePageTitle('Plan Templates');
  const { currentOrg } = useOrg();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null = not editing, 'new' = creating
  const [formData, setFormData] = useState({ name: '', description: '', planType: 'onboarding', tasks: [] });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [members, setMembers] = useState([]);

  const loadTemplates = async () => {
    if (!currentOrg?.slug) return;
    try {
      const res = await employeeApi.listPlanTemplates(currentOrg.slug);
      if (res.success) setTemplates(res.templates);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadMembers = async () => {
    if (!currentOrg?.slug) return;
    try {
      const res = await api.getOrgMembers(currentOrg.slug);
      if (res.success) setMembers(res.members?.filter(m => m.status === 'active') || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadTemplates(); loadMembers(); }, [currentOrg?.slug]);

  const startCreate = () => {
    setEditingId('new');
    setFormData({ name: '', description: '', planType: 'onboarding', tasks: [] });
  };

  const startEdit = (tpl) => {
    setEditingId(tpl._id);
    setFormData({ name: tpl.name, description: tpl.description, planType: tpl.planType, tasks: [...tpl.tasks] });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ name: '', description: '', planType: 'onboarding', tasks: [] });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      if (editingId === 'new') {
        await employeeApi.createPlanTemplate(currentOrg.slug, formData);
      } else {
        await employeeApi.updatePlanTemplate(currentOrg.slug, editingId, formData);
      }
      cancelEdit();
      await loadTemplates();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await employeeApi.deletePlanTemplate(currentOrg.slug, id);
      await loadTemplates();
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-dark-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Plan Templates</h1>
          <p className="text-dark-400 text-sm mt-1">Manage onboarding and offboarding task templates</p>
        </div>
        <button onClick={startCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-400 text-dark-950 text-sm font-semibold transition-colors">
          <Plus size={16} /> New Template
        </button>
      </div>

      {/* Create/Edit Form */}
      {editingId && (
        <div className="card p-5 mb-6 border-rivvra-500/30">
          <h3 className="text-white font-semibold mb-4">{editingId === 'new' ? 'Create Template' : 'Edit Template'}</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">Name</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
                  placeholder="e.g. Standard Onboarding" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1.5">Type</label>
                <select value={formData.planType} onChange={(e) => setFormData({ ...formData, planType: e.target.value })}
                  className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm focus:outline-none focus:border-rivvra-500">
                  {PLAN_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">Description</label>
              <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
                placeholder="Brief description" />
            </div>
            <TaskEditor tasks={formData.tasks} onChange={(tasks) => setFormData({ ...formData, tasks })} members={members} />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={cancelEdit} className="px-4 py-2 text-sm text-dark-400 hover:text-white">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving || !formData.name.trim()}
                className="px-5 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {editingId === 'new' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates List */}
      {templates.length === 0 && !editingId && (
        <div className="text-center py-16">
          <FileText size={48} className="mx-auto mb-4 text-dark-600" />
          <p className="text-dark-400">No plan templates yet.</p>
          <p className="text-dark-500 text-sm mt-1">Create a template to get started with onboarding/offboarding plans.</p>
        </div>
      )}

      <div className="space-y-3">
        {templates.map((tpl) => {
          const typeConfig = PLAN_TYPES.find((p) => p.value === tpl.planType) || PLAN_TYPES[0];
          const isExpanded = expandedId === tpl._id;

          return (
            <div key={tpl._id} className="card">
              <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : tpl._id)}>
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-dark-400" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{tpl.name}</span>
                      <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
                      {tpl.isDefault && <Badge className="bg-dark-700 text-dark-400">Default</Badge>}
                    </div>
                    {tpl.description && <p className="text-dark-500 text-xs mt-0.5">{tpl.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-dark-500 text-xs">{tpl.tasks?.length || 0} tasks</span>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); startEdit(tpl); }}
                      className="p-1.5 text-dark-500 hover:text-white transition-colors rounded-lg hover:bg-dark-700">
                      <Edit2 size={14} />
                    </button>
                    {!tpl.isDefault && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(tpl._id); }}
                        className="p-1.5 text-dark-500 hover:text-red-400 transition-colors rounded-lg hover:bg-dark-700">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-dark-500" /> : <ChevronDown size={16} className="text-dark-500" />}
                </div>
              </div>

              {isExpanded && tpl.tasks?.length > 0 && (
                <div className="px-4 pb-4 border-t border-dark-800">
                  <div className="mt-3 space-y-1">
                    {tpl.tasks.map((task, i) => {
                      const rt = RESPONSIBLE_TYPES.find((r) => r.value === task.responsibleType);
                      return (
                        <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-dark-800/50 text-sm">
                          <span className="text-dark-500 text-xs w-5">{i + 1}.</span>
                          <span className="text-white flex-1">{task.title}</span>
                          <Badge className="bg-dark-700 text-dark-400">{rt?.label || task.responsibleType}</Badge>
                          {task.assignedToName && (
                            <span className="text-dark-400 text-xs flex items-center gap-1">
                              <User size={10} /> {task.assignedToName}
                            </span>
                          )}
                          <span className="text-dark-500 text-xs">Day {task.relativeDays}</span>
                          {task.isMandatory && <Badge className="bg-red-500/10 text-red-400">Required</Badge>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
