import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { Plus, Edit2, Trash2, X, Building2, FolderKanban } from 'lucide-react';

export default function ProjectsPage() {
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('clients');

  // Client form
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [clientForm, setClientForm] = useState({ name: '', contactPerson: '', contactEmail: '', billingCurrency: 'INR' });

  // Project form
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectForm, setProjectForm] = useState({ name: '', client: '', description: '' });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/clients').then(r => setClients(r.data)),
      api.get('/projects').then(r => setProjects(r.data)),
    ]).catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Client CRUD
  const saveClient = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await api.put(`/clients/${editingClient}`, clientForm);
        toast.success('Client updated');
      } else {
        await api.post('/clients', clientForm);
        toast.success('Client created');
      }
      setShowClientForm(false);
      setEditingClient(null);
      setClientForm({ name: '', contactPerson: '', contactEmail: '', billingCurrency: 'INR' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const deleteClient = async (id) => {
    if (!confirm('Delete this client?')) return;
    try {
      await api.delete(`/clients/${id}`);
      toast.success('Client deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  // Project CRUD
  const saveProject = async (e) => {
    e.preventDefault();
    try {
      if (editingProject) {
        await api.put(`/projects/${editingProject}`, projectForm);
        toast.success('Project updated');
      } else {
        await api.post('/projects', projectForm);
        toast.success('Project created');
      }
      setShowProjectForm(false);
      setEditingProject(null);
      setProjectForm({ name: '', client: '', description: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const deleteProject = async (id) => {
    if (!confirm('Delete this project?')) return;
    try {
      await api.delete(`/projects/${id}`);
      toast.success('Project deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Projects & Clients</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('clients')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${tab === 'clients' ? 'bg-accent text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          <Building2 size={16} /> Clients ({clients.length})
        </button>
        <button onClick={() => setTab('projects')} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${tab === 'projects' ? 'bg-accent text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          <FolderKanban size={16} /> Projects ({projects.length})
        </button>
      </div>

      {/* Clients Tab */}
      {tab === 'clients' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setClientForm({ name: '', contactPerson: '', contactEmail: '', billingCurrency: 'INR' }); setEditingClient(null); setShowClientForm(true); }}
              className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2">
              <Plus size={16} /> Add Client
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Currency</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map(c => (
                  <tr key={c._id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.contactPerson || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.contactEmail || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.billingCurrency}</td>
                    <td className="px-4 py-3 text-center space-x-2">
                      <button onClick={() => { setClientForm(c); setEditingClient(c._id); setShowClientForm(true); }} className="text-accent hover:text-accent/80"><Edit2 size={15} /></button>
                      <button onClick={() => deleteClient(c._id)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Projects Tab */}
      {tab === 'projects' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setProjectForm({ name: '', client: clients[0]?._id || '', description: '' }); setEditingProject(null); setShowProjectForm(true); }}
              className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2">
              <Plus size={16} /> Add Project
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map(p => (
                  <tr key={p._id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.client?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.description || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center space-x-2">
                      <button onClick={() => { setProjectForm({ name: p.name, client: p.client?._id || '', description: p.description || '' }); setEditingProject(p._id); setShowProjectForm(true); }} className="text-accent hover:text-accent/80"><Edit2 size={15} /></button>
                      <button onClick={() => deleteProject(p._id)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Client Form Modal */}
      {showClientForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editingClient ? 'Edit Client' : 'Add Client'}</h3>
              <button onClick={() => setShowClientForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={saveClient} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" required value={clientForm.name} onChange={e => setClientForm({...clientForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                <input type="text" value={clientForm.contactPerson || ''} onChange={e => setClientForm({...clientForm, contactPerson: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                <input type="email" value={clientForm.contactEmail || ''} onChange={e => setClientForm({...clientForm, contactEmail: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <button type="submit" className="w-full bg-accent text-white py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90">
                {editingClient ? 'Update' : 'Create'} Client
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Project Form Modal */}
      {showProjectForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editingProject ? 'Edit Project' : 'Add Project'}</h3>
              <button onClick={() => setShowProjectForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={saveProject} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" required value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
                <select required value={projectForm.client} onChange={e => setProjectForm({...projectForm, client: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-accent">
                  <option value="">Select client</option>
                  {clients.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={projectForm.description} onChange={e => setProjectForm({...projectForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" rows="3" />
              </div>
              <button type="submit" className="w-full bg-accent text-white py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90">
                {editingProject ? 'Update' : 'Create'} Project
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
