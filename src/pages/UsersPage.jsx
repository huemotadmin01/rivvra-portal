import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { UserPlus, Edit2, X } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', role: 'contractor',
    employeeId: '', phone: '', dailyRate: '', clientBillingRate: '',
    assignedClient: '', assignedProjects: []
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/auth/users').then(r => setUsers(r.data)),
      api.get('/projects').then(r => setProjects(r.data)),
      api.get('/clients').then(r => setClients(r.data)),
    ]).catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ fullName: '', email: '', password: '', role: 'contractor', employeeId: '', phone: '', dailyRate: '', clientBillingRate: '', assignedClient: '', assignedProjects: [] });
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (user) => {
    setForm({
      fullName: user.fullName,
      email: user.email,
      password: '',
      role: user.role,
      employeeId: user.employeeId || '',
      phone: user.phone || '',
      dailyRate: user.dailyRate || '',
      clientBillingRate: user.clientBillingRate || '',
      assignedClient: user.assignedClient?._id || user.assignedClient || '',
      assignedProjects: user.assignedProjects?.map(p => p._id || p) || []
    });
    setEditing(user._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form };
      if (data.dailyRate) data.dailyRate = Number(data.dailyRate);
      if (data.clientBillingRate) data.clientBillingRate = Number(data.clientBillingRate);
      if (!data.assignedClient) delete data.assignedClient;

      if (editing) {
        delete data.password;
        await api.put(`/auth/users/${editing}`, data);
        toast.success('User updated');
      } else {
        await api.post('/auth/register', data);
        toast.success('User created');
      }
      resetForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.put(`/auth/users/${user._id}`, { isActive: !user.isActive });
      toast.success(user.isActive ? 'User deactivated' : 'User activated');
      load();
    } catch (err) {
      toast.error('Failed to update');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 text-sm">{users.length} total users</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"
        >
          <UserPlus size={16} /> Add User
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Employee ID</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Daily Rate</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Billing Rate</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u._id} className={!u.isActive ? 'opacity-50' : ''}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.fullName}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.employeeId || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{u.dailyRate ? `₹${u.dailyRate.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{u.clientBillingRate ? `₹${u.clientBillingRate.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(u)} className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => startEdit(u)} className="text-accent hover:text-accent/80">
                      <Edit2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editing ? 'Edit User' : 'Add New User'}</h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input type="text" required value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
                </div>
              </div>
              {!editing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input type="password" required minLength={8} value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-accent">
                    <option value="contractor">Contractor</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                  <input type="text" value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Daily Rate (₹)</label>
                  <input type="number" value={form.dailyRate} onChange={e => setForm({...form, dailyRate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Billing Rate (₹)</label>
                  <input type="number" value={form.clientBillingRate} onChange={e => setForm({...form, clientBillingRate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Client</label>
                <select value={form.assignedClient} onChange={e => setForm({...form, assignedClient: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-accent">
                  <option value="">None</option>
                  {clients.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent" />
              </div>
              <button type="submit" className="w-full bg-accent text-white py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90">
                {editing ? 'Update User' : 'Create User'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
