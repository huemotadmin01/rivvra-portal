import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useCompany } from '../../context/CompanyContext';
import timesheetApi from '../../utils/timesheetApi';
import { Plus, Edit2, Trash2, Building2, FolderKanban } from 'lucide-react';
import {
  PageHeader, Tabs, DataTable, Chip, Button, Modal, Field, Input, Select, Textarea,
  EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Clients and projects for the timesheet module. Everything above `return (` is
// spliced in verbatim — the four write handlers and both delete confirms.
//
// The finding here is a field that exists everywhere except where you'd set it:
// `billingCurrency` is initialised to 'INR' in three places, rendered as a
// read-only column, and bound to NO input. See REDESIGN-QA.md. Carried across
// exactly as-is, including the hardcoded 'INR'.
// ─────────────────────────────────────────────────────────────────────────────

export default function TimesheetProjectsV2() {
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('clients');
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [clientForm, setClientForm] = useState({ name: '', contactPerson: '', contactEmail: '', billingCurrency: 'INR' });
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectForm, setProjectForm] = useState({ name: '', client: '', description: '' });

  const load = () => {
    setLoading(true);
    setClients([]);
    setProjects([]);
    Promise.all([
      timesheetApi.get('/clients').then(r => setClients(r.data)),
      timesheetApi.get('/projects').then(r => setProjects(r.data)),
    ]).catch(() => showToast('Failed to load', 'error')).finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [currentCompany?._id]);

  const saveClient = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) { await timesheetApi.put(`/clients/${editingClient}`, clientForm); showToast('Client updated'); }
      else { await timesheetApi.post('/clients', clientForm); showToast('Client created'); }
      setShowClientForm(false); setEditingClient(null);
      setClientForm({ name: '', contactPerson: '', contactEmail: '', billingCurrency: 'INR' }); load();
    } catch (err) { showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed', 'error'); }
  };

  const deleteClient = async (id) => {
    if (!confirm('Delete this client?')) return;
    try { await timesheetApi.delete(`/clients/${id}`); showToast('Client deleted'); load(); }
    catch (err) { showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed', 'error'); }
  };

  const saveProject = async (e) => {
    e.preventDefault();
    try {
      if (editingProject) { await timesheetApi.put(`/projects/${editingProject}`, projectForm); showToast('Project updated'); }
      else { await timesheetApi.post('/projects', projectForm); showToast('Project created'); }
      setShowProjectForm(false); setEditingProject(null);
      setProjectForm({ name: '', client: '', description: '' }); load();
    } catch (err) { showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed', 'error'); }
  };

  const deleteProject = async (id) => {
    if (!confirm('Delete this project?')) return;
    try { await timesheetApi.delete(`/projects/${id}`); showToast('Project deleted'); load(); }
    catch (err) { showToast(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed', 'error'); }
  };

  if (loading) return <PageSpinner label="Loading clients & projects…" />;

  const rowActions = (onEdit, onDelete, label) => (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <Button variant="ghost" size="sm" aria-label={`Edit ${label}`} onClick={onEdit} iconLeft={<Edit2 size={15} />} />
      <Button variant="ghost" size="sm" aria-label={`Delete ${label}`} onClick={onDelete} iconLeft={<Trash2 size={15} />} />
    </span>
  );

  const clientColumns = [
    { key: 'name', header: 'Name', width: 220,
      render: (c) => <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{c.name}</span> },
    { key: 'contactPerson', header: 'Contact', width: 170, muted: true, render: (c) => c.contactPerson || '—' },
    { key: 'contactEmail', header: 'Email', width: 220, muted: true, render: (c) => c.contactEmail || '—' },
    // Read-only in practice: nothing in this page can set it. See the header.
    { key: 'billingCurrency', header: 'Currency', width: 100, muted: true },
    { key: 'actions', header: 'Actions', width: 100, align: 'center',
      render: (c) => rowActions(
        () => { setClientForm(c); setEditingClient(c._id); setShowClientForm(true); },
        () => deleteClient(c._id),
        c.name,
      ) },
  ];

  const projectColumns = [
    { key: 'name', header: 'Name', width: 220,
      render: (p) => <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{p.name}</span> },
    { key: 'client', header: 'Client', width: 200, muted: true, render: (p) => p.client?.name || '—' },
    { key: 'description', header: 'Description', width: 240, muted: true, wrap: true, render: (p) => p.description || '—' },
    { key: 'isActive', header: 'Status', width: 110, align: 'center',
      render: (p) => <Chip tone={p.isActive ? 'brand' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Chip> },
    { key: 'actions', header: 'Actions', width: 100, align: 'center',
      render: (p) => rowActions(
        () => { setProjectForm({ name: p.name, client: p.client?._id || '', description: p.description || '' }); setEditingProject(p._id); setShowProjectForm(true); },
        () => deleteProject(p._id),
        p.name,
      ) },
  ];

  const onClients = tab === 'clients';

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <PageHeader
        title="Projects & Clients"
        actions={onClients ? (
          <Button
            size="sm"
            iconLeft={<Plus size={14} />}
            onClick={() => { setClientForm({ name: '', contactPerson: '', contactEmail: '', billingCurrency: 'INR' }); setEditingClient(null); setShowClientForm(true); }}
          >
            Add Client
          </Button>
        ) : (
          <Button
            size="sm"
            iconLeft={<Plus size={14} />}
            onClick={() => { setProjectForm({ name: '', client: clients[0]?._id || '', description: '' }); setEditingProject(null); setShowProjectForm(true); }}
          >
            Add Project
          </Button>
        )}
      />

      <Tabs
        tabs={[
          { key: 'clients', label: 'Clients', icon: Building2, count: clients.length },
          { key: 'projects', label: 'Projects', icon: FolderKanban, count: projects.length },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginBottom: 14 }}
      />

      {onClients ? (
        <DataTable
          columns={clientColumns}
          rows={clients}
          rowKey="_id"
          stickyHeader
          empty={<EmptyState icon={<Building2 size={22} />} title="No clients yet" sub="Add a client before creating projects." />}
        />
      ) : (
        <DataTable
          columns={projectColumns}
          rows={projects}
          rowKey="_id"
          stickyHeader
          empty={<EmptyState icon={<FolderKanban size={22} />} title="No projects yet" />}
        />
      )}

      {/* ── Client form ── */}
      <Modal
        open={showClientForm}
        onClose={() => setShowClientForm(false)}
        size="sm"
        title={editingClient ? 'Edit Client' : 'Add Client'}
      >
        <form onSubmit={saveClient} style={{ display: 'grid', gap: 14 }}>
          <Field label="Name" required htmlFor="cl-name">
            <Input id="cl-name" type="text" required value={clientForm.name} onChange={e => setClientForm({...clientForm, name: e.target.value})} />
          </Field>
          <Field label="Contact Person" htmlFor="cl-person">
            <Input id="cl-person" type="text" value={clientForm.contactPerson || ''} onChange={e => setClientForm({...clientForm, contactPerson: e.target.value})} />
          </Field>
          <Field label="Contact Email" htmlFor="cl-email">
            <Input id="cl-email" type="email" value={clientForm.contactEmail || ''} onChange={e => setClientForm({...clientForm, contactEmail: e.target.value})} />
          </Field>
          <Button type="submit" block>{editingClient ? 'Update' : 'Create'} Client</Button>
        </form>
      </Modal>

      {/* ── Project form ── */}
      <Modal
        open={showProjectForm}
        onClose={() => setShowProjectForm(false)}
        size="sm"
        title={editingProject ? 'Edit Project' : 'Add Project'}
      >
        <form onSubmit={saveProject} style={{ display: 'grid', gap: 14 }}>
          <Field label="Name" required htmlFor="pj-name">
            <Input id="pj-name" type="text" required value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} />
          </Field>
          <Field label="Client" required htmlFor="pj-client">
            <Select id="pj-client" required value={projectForm.client} onChange={e => setProjectForm({...projectForm, client: e.target.value})}>
              <option value="">Select client</option>
              {clients.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Description" htmlFor="pj-desc">
            <Textarea id="pj-desc" value={projectForm.description} onChange={e => setProjectForm({...projectForm, description: e.target.value})} rows={3} style={{ minHeight: 80 }} />
          </Field>
          <Button type="submit" block>{editingProject ? 'Update' : 'Create'} Project</Button>
        </form>
      </Modal>
    </div>
  );
}
