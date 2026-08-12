// ============================================================================
// TodoDashboardV2.jsx — To-Do dashboard on ds (phase 7, dashboard archetype)
// ============================================================================
// Copied from TodoDashboard.jsx. Untouched: the Gmail OAuth callback and its
// single-use-code guard (the ref plus stripping the query BEFORE the async
// exchange, which is what stops a route remount double-exchanging), the
// accept/dismiss race guard, and the optimistic status toggle with its revert.
//
// The reference implementation for the dashboard archetype:
//
//   - KPI row: ds `Stat`, one per metric, each with `onClick` into the
//     filtered list behind the number. `Stat` renders a real <button> when
//     given onClick, so the row is keyboard-reachable — the legacy version
//     hand-rolled a <button> wrapper per tile.
//   - Body: a `Panel` per region in a responsive grid, the primary region
//     spanning two columns.
//   - Proportions use ds `Meter`, never a hand-rolled track.
//
// No chart component is involved, and none was needed. `REDESIGN.md` listed
// dashboards as blocked on "a ds chart component that does not exist"; in fact
// none of the ten dashboards imports recharts. They are stat tiles, meters and
// lists.
//
// SuggestionsBanner and ScanStatus stay legacy: they are To-Do-specific
// widgets with no ds equivalent, they carry no inline colours, and the palette
// bridge themes them correctly inside the v2 shell. Verified in both themes.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import todoApi from '../../utils/todoApi';
import useTodoAssign from '../../hooks/useTodoAssign';
import TaskFormModalV2 from '../../components/todo/v2/TaskFormModalV2';
import TaskCardV2 from '../../components/todo/v2/TaskCardV2';
import SuggestionsBanner from '../../components/todo/SuggestionsBanner';
import ScanStatus from '../../components/todo/ScanStatus';
import {
  Plus, CheckSquare, Clock, AlertTriangle,
  ListTodo, CheckCircle2, ArrowUpCircle,
} from 'lucide-react';
import { Button, EmptyState, PageHeader, Panel, Spinner, Stat } from '../../components/ds';

export default function TodoDashboardV2() {
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
  const { canAssign, assignableEmployees } = useTodoAssign(orgSlug);
  const processedGmailCode = useRef(null);

  useEffect(() => {
    if (orgSlug) loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // An OAuth code is single-use. The ref guards re-runs of this instance;
      // stripping the query BEFORE the async exchange guards route remounts
      // (org-context load) whose fresh ref would double-exchange the code and
      // toast a spurious failure over a successful connect.
      if (processedGmailCode.current === code) return;
      processedGmailCode.current = code;
      navigate(orgPath('/todo/dashboard'), { replace: true });
      todoApi.connectGmail(orgSlug, code, state)
        .then(res => {
          if (res.success) {
            showToast('Gmail connected: ' + res.gmailEmail, 'success');
            setGmailStatus(prev => ({ ...prev, connected: true, email: res.gmailEmail }));
            loadDashboard();
          }
        })
        .catch(() => showToast('Failed to connect Gmail', 'error'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, orgSlug]);

  async function loadDashboard(silent = false) {
    try {
      if (!silent) setLoading(true);
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

  // Guard against double-clicks / accept-then-dismiss races on the same
  // suggestion — the second action would hit an already-mutated task.
  const processingSuggestionIds = useRef(new Set());

  async function handleAcceptAiTask(taskId) {
    if (processingSuggestionIds.current.has(taskId)) return;
    processingSuggestionIds.current.add(taskId);
    try {
      await todoApi.acceptAiTask(orgSlug, taskId);
      setAiSuggestions(prev => prev.filter(t => t._id !== taskId));
      showToast('Task accepted', 'success');
      // Accepted suggestion becomes a real task — stats and Recent Tasks
      // change server-side, so refresh (silently, no full-page spinner).
      loadDashboard(true);
    } catch {
      showToast('Failed to accept task', 'error');
    } finally {
      processingSuggestionIds.current.delete(taskId);
    }
  }

  async function handleDismissAiTask(taskId) {
    if (processingSuggestionIds.current.has(taskId)) return;
    processingSuggestionIds.current.add(taskId);
    try {
      await todoApi.dismissAiTask(orgSlug, taskId);
      setAiSuggestions(prev => prev.filter(t => t._id !== taskId));
      loadDashboard(true);
    } catch {
      showToast('Failed to dismiss task', 'error');
    } finally {
      processingSuggestionIds.current.delete(taskId);
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
      <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
        <Spinner label="Loading dashboard…" />
      </div>
    );
  }

  const tiles = [
    { label: 'Total Tasks', value: stats.total, icon: <ListTodo size={14} />, color: 'var(--a-todo)', to: '/todo/tasks' },
    { label: 'Pending', value: stats.pending, icon: <Clock size={14} />, color: 'var(--warn)', to: '/todo/tasks?status=pending' },
    { label: 'In Progress', value: stats.inProgress, icon: <ArrowUpCircle size={14} />, color: 'var(--info)', to: '/todo/tasks?status=in-progress' },
    { label: 'Done', value: stats.done, icon: <CheckCircle2 size={14} />, color: 'var(--brand)', to: '/todo/tasks?status=done' },
    { label: 'Overdue', value: stats.overdue, icon: <AlertTriangle size={14} />, color: 'var(--danger)', to: '/todo/tasks?status=overdue' },
  ];

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1220 }}>
      <PageHeader
        title="To-Do Dashboard"
        sub="Manage your tasks and AI-extracted action items"
        actions={
          <Button iconLeft={<Plus size={15} />} onClick={() => setShowCreateModal(true)}>
            New Task
          </Button>
        }
        style={{ marginBottom: 16 }}
      />

      {/* KPI row — each tile links into the list it counts. */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
      }}>
        {tiles.map(t => (
          <Stat
            key={t.label}
            label={t.label}
            value={t.value}
            icon={t.icon}
            color={t.color}
            onClick={() => navigate(orgPath(t.to))}
            title={`View ${t.label.toLowerCase()} tasks`}
          />
        ))}
      </div>

      {/* AI Suggestions Banner */}
      {aiSuggestions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SuggestionsBanner
            suggestions={aiSuggestions}
            onAccept={handleAcceptAiTask}
            onDismiss={handleDismissAiTask}
          />
        </div>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        {/* Recent Tasks — the primary region, spanning where there is room. */}
        <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <Panel
            flush
            title="Recent Tasks"
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate(orgPath('/todo/tasks'))}>
                View All
              </Button>
            }
          >
            {recentTasks.length === 0 ? (
              <div style={{ padding: 16 }}>
                <EmptyState compact icon={<CheckSquare size={20} />} title="No tasks yet">
                  Create your first task, or connect Gmail for AI suggestions.
                </EmptyState>
              </div>
            ) : (
              recentTasks.map((task, i) => (
                <div key={task._id} style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}>
                  <TaskCardV2
                    task={task}
                    orgSlug={orgSlug}
                    onToggleStatus={() => handleToggleStatus(task)}
                    onAccept={task.source === 'ai' && !task.aiMeta?.accepted ? () => handleAcceptAiTask(task._id) : null}
                    onDismiss={task.source === 'ai' && !task.aiMeta?.accepted ? () => handleDismissAiTask(task._id) : null}
                  />
                </div>
              ))
            )}
          </Panel>
        </div>

        {/* Scan Status */}
        <div style={{ minWidth: 0 }}>
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
        <TaskFormModalV2
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateTask}
          canAssign={canAssign}
          assignableEmployees={assignableEmployees}
        />
      )}
    </div>
  );
}
