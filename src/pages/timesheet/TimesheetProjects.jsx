import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import timesheetApi from '../../utils/timesheetApi';
import { Plus, Edit2, Trash2, X, Building2, FolderKanban, Loader2 } from 'lucide-react';

export default function TimesheetProjects() {
  const { showToast } = useToast();
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
    Promise.all([
      timesheetApi.get('/clients').then(r => setClients(r.data)),
      timesheetApi.get('/projects').then(r => setProjects(r.data)),
    ]).catch(() => showToast('Failed to load', 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const saveClient = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) { await timesheetApi.put(`/clients/${editingClient}`, clientForm); showToast('Client updated'); }
      else { await timesheetApi.post('/clients', clientForm); showToast('Client created'); }
      setShowClientForm(false); setEditingClient(null);
      setClientForm({ name: '', contactPerson: '', contactEmail: '', billingCurrency: 'INR' }); load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const deleteClient = async (id) => {
    if (!confirm('Delete this client?')) return;
    try { await timesheetApi.delete(`/clients/${id}`); showToast('Client deleted'); load(); }
    catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const saveProject = async (e) => {
    e.preventDefault();
    try {
      if (editingProject) { await timesheetApi.put(`/projects/${editingProject}`, projectForm); showToast('Project updated'); }
      else { await timesheetApi.post('/projects', projectForm); showToast('Project created'); }
      setShowProjectForm(false); setEditingProject(null);
      setProjectForm({ name: '', client: '', description: '' }); load();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const deleteProject = async (id) => {
    if (!confirm('Delete this project?')) return;
    try { await timesheetApi.delete(`/projects/${id}`); showToast('Project deleted'); load(); }
    catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-dark-400" /></div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Projects & Clients</h1>

      <div className="flex gap-2">
        <button onClick={() => setTab('clients')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${tab === 'clients' ? 'bg-rivvra-500 text-dark-950' : 'bg-dark-800 border border-dark-700 text-dark-300'}`}>
          <Building2 size={16} /> Clients ({clients.length})
        </button>
        <button onClick={() => setTab('projects')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${tab === 'projects' ? 'bg-rivvra-500 text-dark-950' : 'bg-dark-800 border border-dark-700 text-dark-300'}`}>
          <FolderKanban size={16} /> Projects ({projects.length})
        </button>
      </div>

      {tab === 'clients' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setClientForm({ name: '', contactPerson: '', contactEmail: '', billingCurrency: 'INR' }); setEditingClient(null); setShowClientForm(true); }}
              className="bg-rivvra-500 text-dark-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-2 transition-colors">
              <Plus size={16} /> Add Client
            </button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-dark-800">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-dark-400">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-dark-400">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-dark-400">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-dark-400">Currency</th>
                  <th className="text-center px-4 py-3 font-medium text-dark-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {clients.map(c => (
                  <tr key={c._id} className="hover:bg-dark-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                    <td className="px-4 py-3 text-dark-300">{c.contactPerson || '—'}</td>
                    <td className="px-4 py-3 text-dark-300">{c.contactEmail || '—'}</td>
                    <td className="px-4 py-3 text-dark-300">{c.billingCurrency}</td>
                    <td className="px-4 py-3 text-center space-x-2">
                      <button onClick={() => { setClientForm(c); setEditingClient(c._id); setShowClientForm(true); }} className="text-blue-400 hover:text-blue-300"><Edit2 size={15} /></button>
                      <button onClick={() => deleteClient(c._id)} className="text-red-400 hover:text-red-300"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'projects' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setProjectForm({ name: '', client: clients[0]?._id || '', description: '' }); setEditingProject(null); setShowProjectForm(true); }}
              className="bg-rivvra-500 text-dark-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rivvra-400 flex items-center gap-2 transition-colors">
              <Plus size={16} /> Add Project
            </button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-dark-800">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-dark-400">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-dark-400">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-dark-400">Description</th>
                  <th className="text-center px-4 py-3 font-medium text-dark-400">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-dark-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {projects.map(p => (
                  <tr key={p._id} className="hover:bg-dark-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                    <td className="px-4 py-3 text-dark-300">{p.client?.name || '—'}</td>
                    <td className="px-4 py-3 text-dark-300">{p.description || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-dark-700 text-dark-500'}`}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center space-x-2">
                      <button onClick={() => { setProjectForm({ name: p.name, client: p.client?._id || '', description: p.description || '' }); setEditingProject(p._id); setShowProjectForm(true); }} className="text-blue-400 hover:text-blue-300"><Edit2 size={15} /></button>
                      <button onClick={() => deleteProject(p._id)} className="text-red-400 hover:text-red-300"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showClientForm && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-dark-800">
              <h3 className="text-lg font-semibold text-white">{editingClient ? 'Edit Client' : 'Add Client'}</h3>
              <button onClick={() => setShowClientForm(false)} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={saveClient} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Name *</label>
                <input type="text" required value={clientForm.name} onChange={e => setClientForm({...clientForm, name: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Contact Person</label>
                <input type="text" value={clientForm.contactPerson || ''} onChange={e => setClientForm({...clientForm, contactPerson: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Contact Email</label>
                <input type="email" value={clientForm.contactEmail || ''} onChange={e => setClientForm({...clientForm, contactEmail: e.target.value})} className="input-field" />
              </div>
              <button type="submit" className="w-full btn-primary">{editingClient ? 'Update' : 'Create'} Client</button>
            </form>
          </div>
        </div>
      )}

      {showProjectForm && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-dark-800">
              <h3 className="text-lg font-semibold text-white">{editingProject ? 'Edit Project' : 'Add Project'}</h3>
              <button onClick={() => setShowProjectForm(false)} className="text-dark-400 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={saveProject} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Name *</label>
                <input type="text" required value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Client *</label>
                <select required value={projectForm.client} onChange={e => setProjectForm({...projectForm, client: e.target.value})} className="input-field">
                  <option value="">Select client</option>
                  {clients.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Description</label>
                <textarea value={projectForm.description} onChange={e => setProjectForm({...projectForm, description: e.target.value})}
                  className="input-field min-h-[80px]" rows="3" />
              </div>
              <button type="submit" className="w-full btn-primary">{editingProject ? 'Update' : 'Create'} Project</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
