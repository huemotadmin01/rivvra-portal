import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import employeeApi from '../../utils/employeeApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  Plus, Edit2, Trash2, Loader2, FileText, ChevronDown, ChevronUp,
  UserCheck, User, Shield, Monitor, Clock, CheckCircle, Users,
} from 'lucide-react';
import {
  Panel, Chip, Button, Input, Select, Switch, Field,
  EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// `TaskEditor`'s four mutators and the whole main-component data layer
// (`loadTemplates` through `handleDelete`) are spliced in byte-identically,
// including the native `window.confirm()` gate on delete and the `isDefault`
// guard that hides Delete on seeded templates.
//
// The legacy `api` import was unused — dropped, which is why lint goes 2 -> 1.
//
// Not triggered: create, update, delete.
// ─────────────────────────────────────────────────────────────────────────────

const RESPONSIBLE_TYPES = [
  { value: 'hr', label: 'HR', icon: Shield },
  { value: 'manager', label: 'Manager', icon: UserCheck },
  { value: 'employee', label: 'Employee', icon: User },
  { value: 'it', label: 'IT', icon: Monitor },
];

// Legacy carried Tailwind classes here; the tone is the same distinction —
// onboarding reads as a start, offboarding as something to watch.
const PLAN_TYPES = [
  { value: 'onboarding', label: 'Onboarding', tone: 'brand' },
  { value: 'offboarding', label: 'Offboarding', tone: 'warn' },
];

const APPLICABLE_TYPES = [
  { value: 'confirmed_nonbillable', label: 'Confirmed (Non-Billable)' },
  { value: 'confirmed_billable', label: 'Confirmed (Billable)' },
  { value: 'intern', label: 'Intern' },
  { value: 'internal_consultant_nonbillable', label: 'Internal Consultant (Non-Billable)' },
  { value: 'internal_consultant_billable', label: 'Internal Consultant (Billable)' },
  { value: 'external_consultant', label: 'External Consultant' },
];

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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <label style={{ font: "550 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>Tasks</label>
        <Button variant="ghost" size="sm" type="button" onClick={addTask} iconLeft={<Plus size={14} />}>Add Task</Button>
      </div>

      {tasks.length === 0 && <EmptyState compact title="No tasks added yet." />}

      <div style={{ display: 'grid', gap: 8 }}>
        {tasks.map((task, i) => (
          <div key={i} style={{
            position: 'relative', padding: 12, borderRadius: 'var(--r-2, 12px)',
            background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
          }}>
            <span style={{ position: 'absolute', top: 6, right: 6 }}>
              <Button variant="ghost" size="sm" type="button" aria-label={`Remove task ${i + 1}`}
                onClick={() => removeTask(i)} style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />} />
            </span>

            {/* Row 1: title, responsible, day offset, required */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) auto auto auto', gap: 8, alignItems: 'center', paddingRight: 30 }}>
              <Input
                type="text" value={task.title} placeholder="Task title"
                aria-label={`Task ${i + 1} title`}
                onChange={(e) => updateTask(i, 'title', e.target.value)}
              />
              <Select
                value={task.responsibleType}
                aria-label={`Task ${i + 1} responsible party`}
                onChange={(e) => updateTask(i, 'responsibleType', e.target.value)}
                style={{ width: 'auto' }}
              >
                {RESPONSIBLE_TYPES.map((rt) => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </Select>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Clock size={12} style={{ color: 'var(--fg-4)' }} />
                <Input
                  type="number" value={task.relativeDays} min={0} max={90}
                  aria-label={`Task ${i + 1} day offset`}
                  onChange={(e) => updateTask(i, 'relativeDays', Number(e.target.value))}
                  style={{ width: 62, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                />
                <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>days</span>
              </span>
              {/* Switch fires with the next boolean, not an event, and its
                  `label` is only the accessible name — the visible text is ours. */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Switch
                  checked={task.isMandatory}
                  label={`Task ${i + 1} required`}
                  onChange={(next) => updateTask(i, 'isMandatory', next)}
                />
                <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Required</span>
              </span>
            </div>

            {/* Row 2: description + assignee */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) auto', gap: 8, marginTop: 8 }}>
              <Input
                type="text" value={task.description || ''} placeholder="Description (optional)"
                aria-label={`Task ${i + 1} description`}
                onChange={(e) => updateTask(i, 'description', e.target.value)}
              />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Users size={12} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                <Select
                  value={task.assignedToUserId || ''}
                  aria-label={`Task ${i + 1} assignee`}
                  onChange={(e) => handleAssignedChange(i, e.target.value)}
                  style={{ width: 'auto', minWidth: 150 }}
                >
                  <option value="">Auto (by role)</option>
                  {members.map(m => (
                    <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
                  ))}
                </Select>
              </span>
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
export default function PlanTemplatesV2() {
  usePageTitle('Plan Templates');
  const { currentOrg } = useOrg();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null = not editing, 'new' = creating
  const [formData, setFormData] = useState({ name: '', description: '', planType: 'onboarding', tasks: [], applicableTypes: [] });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [members, setMembers] = useState([]); // active employees for task assignment

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
      const res = await employeeApi.list(currentOrg.slug, { status: 'active' });
      if (res.success) {
        setMembers(
          (res.employees || [])
            .filter(e => e.fullName && e.linkedUserId)
            .map(e => ({ userId: e.linkedUserId?.toString?.() || e.linkedUserId, name: e.fullName }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        );
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadTemplates(); loadMembers(); }, [currentOrg?.slug]);

  const startCreate = () => {
    setEditingId('new');
    setFormData({ name: '', description: '', planType: 'onboarding', tasks: [], applicableTypes: [] });
  };

  const startEdit = (tpl) => {
    setEditingId(tpl._id);
    setFormData({ name: tpl.name, description: tpl.description, planType: tpl.planType, tasks: [...tpl.tasks], applicableTypes: tpl.applicableTypes || [] });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ name: '', description: '', planType: 'onboarding', tasks: [], applicableTypes: [] });
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

  if (loading) return <PageSpinner label="Loading plan templates…" />;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div>
          <h1 style={{ font: "700 18px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>Plan Templates</h1>
          <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
            Manage onboarding and offboarding task templates
          </p>
        </div>
        <Button size="sm" onClick={startCreate} iconLeft={<Plus size={15} />}>New Template</Button>
      </div>

      {/* Create / edit form */}
      {editingId && (
        <Panel title={editingId === 'new' ? 'Create Template' : 'Edit Template'} style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gap: 14, padding: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Field label="Name" htmlFor="pt-name">
                <Input id="pt-name" type="text" value={formData.name} placeholder="e.g. Standard Onboarding"
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </Field>
              <Field label="Type" htmlFor="pt-type">
                <Select id="pt-type" value={formData.planType}
                  onChange={(e) => setFormData({ ...formData, planType: e.target.value })}>
                  {PLAN_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Description" htmlFor="pt-desc">
              <Input id="pt-desc" type="text" value={formData.description} placeholder="Brief description"
                onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </Field>

            <Field label="Applicable Employee Types"
              hint="Select which employee types this template applies to. Leave empty for all types.">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {APPLICABLE_TYPES.map((at) => {
                  const isChecked = formData.applicableTypes.includes(at.value);
                  return (
                    <Button
                      key={at.value}
                      type="button"
                      size="sm"
                      variant={isChecked ? 'primary' : 'secondary'}
                      aria-pressed={isChecked}
                      onClick={() => {
                        const next = isChecked
                          ? formData.applicableTypes.filter(t => t !== at.value)
                          : [...formData.applicableTypes, at.value];
                        setFormData({ ...formData, applicableTypes: next });
                      }}
                    >
                      {at.label}
                    </Button>
                  );
                })}
              </div>
            </Field>

            <TaskEditor tasks={formData.tasks} onChange={(tasks) => setFormData({ ...formData, tasks })} members={members} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
              <Button variant="secondary" size="sm" type="button" onClick={cancelEdit}>Cancel</Button>
              <Button size="sm" type="button" onClick={handleSave} disabled={saving || !formData.name.trim()}
                iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}>
                {editingId === 'new' ? 'Create' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {/* Empty state */}
      {templates.length === 0 && !editingId && (
        <Panel>
          <EmptyState icon={<FileText size={22} />} title="No plan templates yet.">
            Create a template to get started with onboarding/offboarding plans.
          </EmptyState>
        </Panel>
      )}

      {/* Templates */}
      <div style={{ display: 'grid', gap: 10 }}>
        {templates.map((tpl) => {
          const typeConfig = PLAN_TYPES.find((p) => p.value === tpl.planType) || PLAN_TYPES[0];
          const isExpanded = expandedId === tpl._id;

          return (
            <Panel key={tpl._id} flush>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${tpl.name}`}
                onClick={() => setExpandedId(isExpanded ? null : tpl._id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : tpl._id); }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: 14, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <FileText size={17} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ font: "550 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{tpl.name}</span>
                      <Chip tone={typeConfig.tone}>{typeConfig.label}</Chip>
                      {tpl.isDefault && <Chip tone="neutral">Default</Chip>}
                    </div>
                    {tpl.applicableTypes?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                        {tpl.applicableTypes.map(at => {
                          const label = APPLICABLE_TYPES.find(a => a.value === at)?.label || at;
                          return <Chip key={at} tone="neutral">{label}</Chip>;
                        })}
                      </div>
                    )}
                    {tpl.description && (
                      <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>{tpl.description}</p>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
                    {tpl.tasks?.length || 0} tasks
                  </span>
                  <Button variant="ghost" size="sm" aria-label={`Edit ${tpl.name}`}
                    onClick={(e) => { e.stopPropagation(); startEdit(tpl); }} iconLeft={<Edit2 size={14} />} />
                  {/* Seeded templates have no Delete — carried across as-is. */}
                  {!tpl.isDefault && (
                    <Button variant="ghost" size="sm" aria-label={`Delete ${tpl.name}`} style={{ color: 'var(--danger)' }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(tpl._id); }} iconLeft={<Trash2 size={14} />} />
                  )}
                  {isExpanded
                    ? <ChevronUp size={16} style={{ color: 'var(--fg-4)' }} />
                    : <ChevronDown size={16} style={{ color: 'var(--fg-4)' }} />}
                </div>
              </div>

              {isExpanded && tpl.tasks?.length > 0 && (
                <div style={{ padding: '12px 14px 14px', borderTop: '1px solid var(--line-2)' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {tpl.tasks.map((task, i) => {
                      const rt = RESPONSIBLE_TYPES.find((r) => r.value === task.responsibleType);
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap',
                          padding: '8px 12px', borderRadius: 'var(--r-1, 8px)', background: 'var(--surface-2)',
                        }}>
                          <span style={{ width: 20, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{i + 1}.</span>
                          <span style={{ flex: 1, minWidth: 120, font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{task.title}</span>
                          <Chip tone="neutral">{rt?.label || task.responsibleType}</Chip>
                          {task.assignedToName && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                              <User size={10} /> {task.assignedToName}
                            </span>
                          )}
                          <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Day {task.relativeDays}</span>
                          {task.isMandatory && <Chip tone="danger">Required</Chip>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
