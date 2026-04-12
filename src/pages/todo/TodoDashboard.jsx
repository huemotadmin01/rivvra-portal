import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import TaskFormModal from '../../components/todo/TaskFormModal';
import SuggestionsBanner from '../../components/todo/SuggestionsBanner';
import ScanStatus from '../../components/todo/ScanStatus';
import TaskCard from '../../components/todo/TaskCard';
import {
  Loader2, Plus, CheckSquare, Clock, AlertTriangle,
  ListTodo, CheckCircle2, ArrowUpCircle,
} from 'lucide-react';

function StatCard({ label, value, icon: Icon, iconColor }) {
  return (
    <div className="bg-dark-900 rounded-xl p-5 border border-dark-800">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${iconColor}`}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-dark-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function TodoDashboard() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0, pending: 0, inProgress: 0, done: 0, overdue: 0,
    highPriority: 0, mediumPriority: 0, lowPriority: 0,
  });
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [lastScan, setLastScan] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [gmailStatus, setGmailStatus] = useState({ connected: false });

  useEffect(() => {
    if (orgSlug) loadDashboard();
  }, [orgSlug]);

  // Handle Gmail OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('todo_gmail_code');
    const state = params.get('gmail_state');
    const error = params.get('gmail_error');

    if (error) {
      showToast('Gmail connection failed: ' + error, 'error');
      navigate(orgPath('/todo/dashboard'), { replace: true });
      return;
    }

    if (code && orgSlug) {
      todoApi.connectGmail(orgSlug, code, state)
        .then(res => {
          if (res.success) {
            showToast('Gmail connected: ' + res.gmailEmail, 'success');
            setGmailStatus({ connected: true, email: res.gmailEmail });
          }
        })
        .catch(() => showToast('Failed to connect Gmail', 'error'))
        .finally(() => navigate(orgPath('/todo/dashboard'), { replace: true }));
    }
  }, [location.search, orgSlug]);

  async function loadDashboard() {
    try {
      setLoading(true);
      const [dashRes, gmailRes] = await Promise.all([
        todoApi.getDashboard(orgSlug),
        todoApi.getGmailStatus(orgSlug),
      ]);
      if (dashRes.success) {
        setStats(dashRes.stats);
        setAiSuggestions(dashRes.aiSuggestions || []);
        setRecentTasks(dashRes.recentTasks || []);
        setLastScan(dashRes.lastScan);
      }
      if (gmailRes.success) {
        setGmailStatus(gmailRes);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTask(taskData) {
    try {
      const res = await todoApi.createTask(orgSlug, taskData);
      if (res.success) {
        showToast('Task created', 'success');
        setShowCreateModal(false);
        loadDashboard();
      }
    } catch {
      showToast('Failed to create task', 'error');
    }
  }

  async function handleAcceptAiTask(taskId) {
    try {
      await todoApi.acceptAiTask(orgSlug, taskId);
      setAiSuggestions(prev => prev.filter(t => t._id !== taskId));
      setRecentTasks(prev => prev.map(t =>
        t._id === taskId ? { ...t, aiMeta: { ...t.aiMeta, accepted: true } } : t
      ));
      showToast('Task accepted', 'success');
    } catch {
      showToast('Failed to accept task', 'error');
    }
  }

  async function handleDismissAiTask(taskId) {
    try {
      await todoApi.dismissAiTask(orgSlug, taskId);
      setAiSuggestions(prev => prev.filter(t => t._id !== taskId));
      setRecentTasks(prev => prev.filter(t => t._id !== taskId));
    } catch {
      showToast('Failed to dismiss task', 'error');
    }
  }

  async function handleToggleStatus(task) {
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    // Optimistic update
    setRecentTasks(prev => prev.map(t =>
      t._id === task._id ? { ...t, status: newStatus } : t
    ));
    setStats(prev => {
      const delta = newStatus === 'done' ? 1 : -1;
      return {
        ...prev,
        done: prev.done + delta,
        pending: prev.pending - delta,
      };
    });
    try {
      await todoApi.updateTask(orgSlug, task._id, { status: newStatus });
    } catch {
      // Revert on failure
      setRecentTasks(prev => prev.map(t =>
        t._id === task._id ? { ...t, status: task.status } : t
      ));
      loadDashboard();
      showToast('Failed to update task', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-dark-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">To-Do Dashboard</h1>
          <p className="text-dark-400 mt-1">Manage your tasks and AI-extracted action items</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          <Plus size={18} />
          New Task
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Tasks" value={stats.total} icon={ListTodo} iconColor="bg-teal-500/10 text-teal-400" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} iconColor="bg-amber-500/10 text-amber-400" />
        <StatCard label="In Progress" value={stats.inProgress} icon={ArrowUpCircle} iconColor="bg-blue-500/10 text-blue-400" />
        <StatCard label="Done" value={stats.done} icon={CheckCircle2} iconColor="bg-emerald-500/10 text-emerald-400" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} iconColor="bg-red-500/10 text-red-400" />
      </div>

      {/* AI Suggestions Banner */}
      {aiSuggestions.length > 0 && (
        <SuggestionsBanner
          suggestions={aiSuggestions}
          onAccept={handleAcceptAiTask}
          onDismiss={handleDismissAiTask}
        />
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tasks (2/3 width) */}
        <div className="lg:col-span-2">
          <div className="bg-dark-900 rounded-xl border border-dark-800">
            <div className="flex items-center justify-between p-4 border-b border-dark-800">
              <h2 className="text-lg font-semibold text-white">Recent Tasks</h2>
              <button
                onClick={() => navigate(orgPath('/todo/tasks'))}
                className="text-sm text-teal-400 hover:text-teal-300"
              >
                View All
              </button>
            </div>
            <div className="divide-y divide-dark-800">
              {recentTasks.length === 0 ? (
                <div className="p-8 text-center text-dark-500">
                  <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No tasks yet. Create your first task or connect Gmail for AI suggestions.</p>
                </div>
              ) : (
                recentTasks.map(task => (
                  <TaskCard
                    key={task._id}
                    task={task}
                    onToggleStatus={() => handleToggleStatus(task)}
                    onAccept={task.source === 'ai' && !task.aiMeta?.accepted ? () => handleAcceptAiTask(task._id) : null}
                    onDismiss={task.source === 'ai' && !task.aiMeta?.accepted ? () => handleDismissAiTask(task._id) : null}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Scan Status (1/3 width) */}
        <div>
          <ScanStatus
            orgSlug={orgSlug}
            gmailStatus={gmailStatus}
            lastScan={lastScan}
            onScanComplete={loadDashboard}
          />
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <TaskFormModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateTask}
        />
      )}
    </div>
  );
}
