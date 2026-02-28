import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import SequenceDetailPage from '../components/SequenceDetailPage';
import EngageSettings from '../components/EngageSettings';
import EngageSetupGuide from '../components/EngageSetupGuide';
import ToggleSwitch from '../components/ToggleSwitch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePlatform } from '../context/PlatformContext';
import ConfirmModal from '../components/ConfirmModal';
import api from '../utils/api';
import {
  Plus,
  Send,
  Mail,
  Search,
  AlertCircle,
  MoreVertical,
  Edit3,
  Trash2,
  Pause,
  Play,
  Info,
  Loader2,
  Link2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  Download,
  ArrowUpDown,
  Share2,
  Users,
  ShieldAlert,
} from 'lucide-react';

function EngagePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();

  // View state
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [mainTab, setMainTab] = useState('sequences'); // 'sequences' | 'settings'
  const [selectedSequenceId, setSelectedSequenceId] = useState(null);

  // Gmail connection state
  const [gmailStatus, setGmailStatus] = useState({ connected: false, email: null });
  const [gmailLoading, setGmailLoading] = useState(true);

  // Setup status (for guide)
  const [setupStatus, setSetupStatus] = useState(null);
  const [setupLoading, setSetupLoading] = useState(true);

  // Email stats
  const [emailsSentToday, setEmailsSentToday] = useState({ sent: 0, limit: 50 });

  // Sequences
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Modals
  const [actionMenuId, setActionMenuId] = useState(null);
  const [activateConfirm, setActivateConfirm] = useState(null); // { id, name }
  const [deleteConfirmId, setDeleteConfirmId] = useState(null); // sequence id to confirm delete
  const [disconnectConfirm, setDisconnectConfirm] = useState(false); // confirm Gmail disconnect

  // Ref for menu button rect (replaces window._menuBtnRect global)
  const menuBtnRectRef = useRef(null);

  // Load data on mount
  useEffect(() => {
    let cancelled = false;

    loadGmailStatus();
    loadEmailsSentToday();
    loadSequences();
    loadSetupStatus();

    return () => { cancelled = true; };
  }, []);

  // Handle redirect-back from Gmail OAuth (separate effect to avoid race conditions)
  // After Google callback → backend → /#/engage?gmail_code=xxx → OrgRedirect → here
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const gmailCode = searchParams.get('gmail_code');
    if (!gmailCode) return;

    // Clean up URL first (remove query params) — use window.history to avoid re-render
    const cleanHash = window.location.hash.split('?')[0];
    window.history.replaceState(null, '', window.location.pathname + cleanHash);

    // Exchange the auth code for tokens
    let active = true;
    (async () => {
      try {
        const connectRes = await api.connectGmail(gmailCode);
        if (!active) return;
        if (connectRes.success) {
          setGmailStatus({ connected: true, email: connectRes.gmailEmail });
          setGmailLoading(false);
          loadSetupStatus();
          showToast('Gmail connected successfully!', 'success');
        } else {
          showToast(connectRes.error || 'Failed to connect Gmail.', 'error');
        }
      } catch (err) {
        if (!active) return;
        console.error('Gmail connect from redirect error:', err);
        showToast('Failed to connect Gmail. Please try again.', 'error');
      }
    })();

    return () => { active = false; };
  }, [location.search]);

  async function loadGmailStatus() {
    try {
      const res = await api.getGmailStatus();
      if (res.success) setGmailStatus(res);
    } catch (err) {
      console.error('Gmail status error:', err);
    } finally {
      setGmailLoading(false);
    }
  }

  async function loadSetupStatus() {
    try {
      const res = await api.getSetupStatus();
      if (res.success) {
        setSetupStatus(res);
      } else {
        // API returned but not successful — fallback to incomplete
        setSetupStatus({ gmailConnected: false, profileComplete: false, allComplete: false, missingFields: ['senderTitle', 'companyName'] });
      }
    } catch (err) {
      console.error('Setup status error:', err);
      // If endpoint not available yet, fallback to incomplete so guide still shows
      setSetupStatus({ gmailConnected: false, profileComplete: false, allComplete: false, missingFields: ['senderTitle', 'companyName'] });
    } finally {
      setSetupLoading(false);
    }
  }

  async function loadEmailsSentToday() {
    try {
      const res = await api.getEmailsSentToday();
      if (res.success) setEmailsSentToday(res);
    } catch (err) {
      console.error('Email stats error:', err);
    }
  }

  async function loadSequences() {
    try {
      const res = await api.getSequences();
      if (res.success) setSequences(res.sequences);
    } catch (err) {
      console.error('Load sequences error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Gmail connect flow — redirect in same window (works reliably on all OS)
  async function handleConnectGmail() {
    try {
      const res = await api.getGmailOAuthUrl();
      if (!res.success) return;

      // Redirect in same window — callback will redirect back to /#/engage?gmail_code=xxx
      window.location.href = res.url;
    } catch (err) {
      console.error('Connect Gmail error:', err);
      showToast('Failed to connect Gmail. Please try again.', 'error');
    }
  }

  function handleDisconnectGmail() {
    setDisconnectConfirm(true);
  }

  async function confirmDisconnectGmail() {
    setDisconnectConfirm(false);
    try {
      const res = await api.disconnectGmail();
      if (res.success) {
        setGmailStatus({ connected: false, email: null });
        loadSetupStatus(); // Refresh setup status
        showToast('Gmail disconnected');
      }
    } catch (err) {
      console.error('Disconnect Gmail error:', err);
      showToast('Failed to disconnect Gmail', 'error');
    }
  }

  // Sequence actions
  async function handleDuplicateSequence(id) {
    try {
      const res = await api.duplicateSequence(id);
      if (res.success) {
        setActionMenuId(null);
        loadSequences();
        showToast('Sequence duplicated');
      }
    } catch (err) {
      showToast(err.message || 'Failed to duplicate sequence', 'error');
    }
  }

  function handleDeleteSequence(id) {
    setActionMenuId(null);
    setDeleteConfirmId(id);
  }

  async function confirmDeleteSequence() {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      await api.deleteSequence(id);
      loadSequences();
      showToast('Sequence deleted');
    } catch (err) {
      showToast(err.message || 'Failed to delete sequence', 'error');
    }
  }

  async function handleShareSequence(id) {
    try {
      const res = await api.shareSequence(id);
      if (res.success) {
        setActionMenuId(null);
        loadSequences();
        showToast(res.shared ? 'Sequence shared with team' : 'Sequence unshared from team');
      }
    } catch (err) {
      showToast(err.message || 'Failed to share sequence', 'error');
    }
  }

  async function handleToggleSequence(id, currentStatus) {
    // Block activation if setup is not complete
    if (currentStatus !== 'active' && setupStatus && !setupStatus.allComplete) {
      showToast('Complete the setup guide above to activate sequences', 'error');
      return;
    }

    if (currentStatus !== 'active') {
      // Activating — show confirmation
      const seq = sequences.find(s => s._id === id);
      setActivateConfirm({ id, name: seq?.name || 'this sequence', enrolled: seq?.stats?.enrolled || 0 });
      return;
    }
    // Pausing — optimistic update (no full reload)
    const previousSequences = [...sequences];
    setSequences(prev => prev.map(s => s._id === id ? { ...s, status: 'paused' } : s));
    try {
      await api.pauseSequence(id);
      showToast('Sequence paused');
    } catch (err) {
      setSequences(previousSequences); // Revert on failure
      showToast(err.message || 'Failed to pause sequence', 'error');
    }
  }

  async function confirmActivation() {
    if (!activateConfirm) return;
    const { id } = activateConfirm;
    // Optimistic update (no full reload)
    const previousSequences = [...sequences];
    setSequences(prev => prev.map(s => s._id === id ? { ...s, status: 'active' } : s));
    setActivateConfirm(null);
    try {
      await api.resumeSequence(id);
      showToast('Sequence activated');
    } catch (err) {
      setSequences(previousSequences); // Revert on failure
      showToast(err.message || 'Failed to activate sequence', 'error');
    }
  }

  function handleNewSequence() {
    // Block creation if setup is not complete
    if (setupStatus && !setupStatus.allComplete) {
      showToast('Complete the setup guide to create sequences', 'error');
      return;
    }
    navigate(orgPath('/outreach/engage/new-sequence'));
  }

  function handleOpenDetail(seq) {
    setSelectedSequenceId(seq._id);
    setView('detail');
  }

  function handleBackToList() {
    setView('list');
    setSelectedSequenceId(null);
    loadSequences(); // Refresh after detail view
  }

  // Filter sequences
  const filteredSequences = sequences.filter(seq => {
    const matchesSearch = !searchQuery ||
      seq.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || seq.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  // Whether to show the setup guide (hide gmail banners when guide is visible)
  const showSetupGuide = !setupLoading && setupStatus && !setupStatus.allComplete;

  // Detail view
  if (view === 'detail' && selectedSequenceId) {
    return (
      <>
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <SequenceDetailPage
            sequenceId={selectedSequenceId}
            onBack={handleBackToList}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Setup Guide (replaces gmail banners when active) */}
        {showSetupGuide && (
          <EngageSetupGuide
            setupStatus={setupStatus}
            onConnectGmail={handleConnectGmail}
            onSetupComplete={() => {
              loadSetupStatus();
              loadGmailStatus();
            }}
            onRefresh={loadSetupStatus}
          />
        )}

        {/* Gmail Connection Banner - Only show when setup is complete */}
        {!showSetupGuide && !gmailLoading && !gmailStatus.connected && !gmailStatus.wasConnected && (
          <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-rivvra-500/5 border border-rivvra-500/20 rounded-xl">
            <Mail className="w-5 h-5 text-rivvra-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm text-white font-medium">Connect your email to start sending. </span>
              <span className="text-sm text-dark-400">Link your Gmail account to send personalized emails from your own address.</span>
            </div>
            <button
              onClick={handleConnectGmail}
              className="px-4 py-1.5 text-sm font-medium text-rivvra-400 border border-rivvra-500/30 rounded-lg hover:bg-rivvra-500/10 transition-colors whitespace-nowrap"
            >
              Connect email
            </button>
          </div>
        )}

        {/* Gmail Connection Banner - Was connected, now disconnected */}
        {!showSetupGuide && !gmailLoading && !gmailStatus.connected && gmailStatus.wasConnected && (
          <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-red-500/10 border border-red-500/20 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm text-white font-medium">Your email has been disconnected. </span>
              <span className="text-sm text-dark-400">Reconnect to resume sending emails to your contacts.</span>
            </div>
            <button
              onClick={handleConnectGmail}
              className="px-4 py-1.5 text-sm font-medium text-red-400 border border-red-400/30 rounded-lg hover:bg-red-500/10 transition-colors whitespace-nowrap"
            >
              Reconnect email
            </button>
          </div>
        )}

        {!showSetupGuide && !gmailLoading && gmailStatus.connected && (
          <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-rivvra-500/5 border border-rivvra-500/20 rounded-xl">
            <Link2 className="w-5 h-5 text-rivvra-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm text-white font-medium">Email connected: </span>
              <span className="text-sm text-rivvra-400">{gmailStatus.email}</span>
            </div>
            <button
              onClick={handleDisconnectGmail}
              className="px-4 py-1.5 text-sm font-medium text-dark-400 border border-dark-600 rounded-lg hover:text-white hover:border-dark-500 transition-colors whitespace-nowrap"
            >
              Disconnect
            </button>
          </div>
        )}

        {/* Tabs: Sequences | Settings */}
        <div className="border-b border-dark-800 mb-6">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setMainTab('sequences')}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                mainTab === 'sequences' ? 'text-white' : 'text-dark-500 hover:text-dark-300'
              }`}
            >
              Sequences
              {mainTab === 'sequences' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rivvra-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setMainTab('settings')}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                mainTab === 'settings' ? 'text-white' : 'text-dark-500 hover:text-dark-300'
              }`}
            >
              Settings
              {mainTab === 'settings' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rivvra-500 rounded-full" />
              )}
            </button>
            <a
              href="https://docs.rivvra.com/engage"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto pb-3 text-xs text-dark-500 hover:text-rivvra-400 flex items-center gap-1 transition-colors"
            >
              See how it works <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Tab content */}
        {mainTab === 'sequences' ? (
          <SequencesTab
            sequences={filteredSequences}
            totalCount={sequences.length}
            loading={loading}
            emailsSentToday={emailsSentToday}
            searchQuery={searchQuery}
            filterStatus={filterStatus}
            actionMenuId={actionMenuId}
            user={user}
            setupComplete={setupStatus?.allComplete}
            menuBtnRectRef={menuBtnRectRef}
            onSearch={setSearchQuery}
            onFilter={setFilterStatus}
            onNewSequence={handleNewSequence}
            onOpenDetail={handleOpenDetail}
            onEdit={(seq) => { navigate(`/outreach/engage/edit-sequence/${seq._id}`); setActionMenuId(null); }}
            onDuplicate={handleDuplicateSequence}
            onDelete={handleDeleteSequence}
            onShare={handleShareSequence}
            onToggle={handleToggleSequence}
            onPause={(id) => handleToggleSequence(id, 'active')}
            onResume={(id) => handleToggleSequence(id, 'paused')}
            onToggleMenu={(id) => setActionMenuId(actionMenuId === id ? null : id)}
          />
        ) : (
          <EngageSettings gmailStatus={gmailStatus} />
        )}

        {/* Activation confirmation modal */}
        {activateConfirm && (
          <ConfirmModal
            title="Activate Sequence"
            message={`Activate "${activateConfirm.name}"? ${activateConfirm.enrolled > 0 ? `${activateConfirm.enrolled} contacts will start receiving emails based on the schedule.` : 'No contacts are enrolled yet.'}`}
            confirmLabel="Activate"
            onConfirm={confirmActivation}
            onCancel={() => setActivateConfirm(null)}
          />
        )}

        {/* Delete sequence confirmation modal */}
        {deleteConfirmId && (
          <ConfirmModal
            title="Delete Sequence"
            message="Are you sure you want to delete this sequence? This action cannot be undone."
            confirmLabel="Delete"
            danger
            onConfirm={confirmDeleteSequence}
            onCancel={() => setDeleteConfirmId(null)}
          />
        )}

        {/* Disconnect Gmail confirmation modal */}
        {disconnectConfirm && (
          <ConfirmModal
            title="Disconnect Gmail"
            message="Are you sure you want to disconnect your Gmail? Active sequences will stop sending emails."
            confirmLabel="Disconnect"
            danger
            onConfirm={confirmDisconnectGmail}
            onCancel={() => setDisconnectConfirm(false)}
          />
        )}
      </div>
    </>
  );
}

// ========================== SEQUENCES TAB ==========================

function SortableHeader({ label, sortKey, currentSort, onSort }) {
  const isActive = currentSort.key === sortKey;
  const isAsc = currentSort.dir === 'asc';

  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-left font-medium group"
    >
      {label}
      <span className={`transition-colors ${isActive ? 'text-rivvra-400' : 'text-dark-600 group-hover:text-dark-400'}`}>
        {isActive ? (
          isAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3" />
        )}
      </span>
    </button>
  );
}

function SequencesTab({
  sequences, totalCount, loading, emailsSentToday, searchQuery, filterStatus,
  actionMenuId, user, setupComplete, menuBtnRectRef,
  onSearch, onFilter, onNewSequence, onOpenDetail,
  onEdit, onDuplicate, onDelete, onShare, onToggle, onPause, onResume, onToggleMenu,
}) {
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [sort, setSort] = useState({ key: 'updatedAt', dir: 'desc' });

  function handleSort(key) {
    setSort(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc'
    }));
  }

  // Sort sequences
  const sortedSequences = [...sequences].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const k = sort.key;
    if (k === 'name') return (a.name || '').localeCompare(b.name || '') * dir;
    if (k === 'contacts') return ((a.stats?.enrolled || 0) - (b.stats?.enrolled || 0)) * dir;
    if (k === 'delivered') return ((a.stats?.sent || 0) - (b.stats?.sent || 0)) * dir;
    if (k === 'opened') return ((a.stats?.opened || 0) - (b.stats?.opened || 0)) * dir;
    if (k === 'replied') return ((a.stats?.replied || 0) - (b.stats?.replied || 0)) * dir;
    if (k === 'bounced') return ((a.stats?.bounced || 0) - (b.stats?.bounced || 0)) * dir;
    if (k === 'updatedAt') return (new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0)) * dir;
    return 0;
  });

  async function handleExportCsv(seqId) {
    try {
      await api.exportSequenceCsv(seqId);
      onToggleMenu(null);
    } catch (err) {
      console.error('Export CSV error:', err);
    }
  }

  const filterLabel = filterStatus === 'all' ? 'All sequences'
    : filterStatus === 'active' ? 'Active'
    : filterStatus === 'paused' ? 'Paused'
    : 'Draft';

  return (
    <>
      {/* Stats bar + Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 text-sm text-dark-400">
          <span>Emails sent today</span>
          <span className="font-semibold text-white">{emailsSentToday.sent}/{emailsSentToday.limit}</span>
          <div className="w-24 h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                emailsSentToday.limit > 0 && (emailsSentToday.sent / emailsSentToday.limit) >= 0.9
                  ? 'bg-red-500'
                  : emailsSentToday.limit > 0 && (emailsSentToday.sent / emailsSentToday.limit) >= 0.7
                  ? 'bg-amber-500'
                  : 'bg-rivvra-500'
              }`}
              style={{ width: `${emailsSentToday.limit > 0 ? Math.min((emailsSentToday.sent / emailsSentToday.limit) * 100, 100) : 0}%` }}
            />
          </div>
          <div className="group relative">
            <Info className="w-3.5 h-3.5 text-dark-500 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-dark-700 text-xs text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              Emails sent today vs your daily limit
            </div>
          </div>
        </div>
        <div className="relative group">
          <button
            onClick={onNewSequence}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              setupComplete === false
                ? 'bg-dark-700 text-dark-400 cursor-not-allowed'
                : 'bg-rivvra-500 text-dark-950 hover:bg-rivvra-400'
            }`}
          >
            <Plus className="w-4 h-4" />
            New sequence
          </button>
          {setupComplete === false && (
            <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-dark-700 border border-dark-600 text-xs text-dark-300 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              <ShieldAlert className="w-3 h-3 inline mr-1 text-amber-400" />
              Complete setup to create sequences
            </div>
          )}
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 mb-4">
        {/* Filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 hover:border-dark-600 transition-colors"
          >
            {filterLabel}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showFilterDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFilterDropdown(false)} />
              <div className="absolute left-0 top-full mt-1 w-44 bg-dark-800 border border-dark-600 rounded-xl shadow-xl py-1 z-20">
                {[
                  { value: 'all', label: 'All sequences' },
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                  { value: 'draft', label: 'Draft' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { onFilter(opt.value); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-dark-700 transition-colors ${
                      filterStatus === opt.value ? 'text-rivvra-400' : 'text-dark-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-rivvra-500"
          />
        </div>

        <div className="text-xs text-dark-500 ml-auto">
          {sequences.length !== totalCount
            ? `${sequences.length} of ${totalCount} Sequence${totalCount !== 1 ? 's' : ''}`
            : `${sequences.length} Sequence${sequences.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-6 h-6 text-dark-500 animate-spin mx-auto mb-3" />
          <p className="text-dark-400 text-sm">Loading sequences...</p>
        </div>
      ) : sequences.length === 0 ? (
        <EmptyState onNewSequence={onNewSequence} setupComplete={setupComplete} />
      ) : (
        <div className="card overflow-visible">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-500 text-xs uppercase tracking-wider border-b border-dark-700">
                  <th className="text-left py-3 px-4">
                    <SortableHeader label="Sequence" sortKey="name" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left py-3 px-4 font-medium">Owner</th>
                  <th className="text-left py-3 px-4">
                    <SortableHeader label="Contacts" sortKey="contacts" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left py-3 px-4 font-medium whitespace-nowrap">Active/Finished</th>
                  <th className="text-left py-3 px-4">
                    <SortableHeader label="Delivered" sortKey="delivered" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left py-3 px-4">
                    <SortableHeader label="Opened" sortKey="opened" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left py-3 px-4">
                    <SortableHeader label="Interested" sortKey="replied" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-left py-3 px-4">
                    <SortableHeader label="Bounced" sortKey="bounced" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th className="text-center py-3 px-4 font-medium w-24"></th>
                  <th className="text-right py-3 px-4 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {sortedSequences.map(seq => {
                  const stats = seq.stats || {};
                  const emailSteps = (seq.steps || []).filter(s => s.type === 'email').length;
                  const isActive = seq.status === 'active';

                  // Calculate rates
                  const openRate = stats.sent > 0
                    ? `${Math.min((stats.opened / stats.sent) * 100, 100).toFixed(0)}%`
                    : '0%';
                  const replyRate = stats.sent > 0
                    ? `${Math.min(((stats.replied || 0) / stats.sent) * 100, 100).toFixed(0)}%`
                    : '0%';
                  const bounceRate = stats.sent > 0
                    ? `${Math.min(((stats.bounced || 0) / stats.sent) * 100, 100).toFixed(0)}%`
                    : '0%';
                  const deliveredRate = stats.sent > 0
                    ? `${Math.min(((stats.sent - (stats.bounced || 0)) / stats.sent) * 100, 100).toFixed(0)}%`
                    : '0%';

                  // Active vs finished
                  const finished = (stats.replied || 0) + (stats.repliedNotInterested || 0) + (stats.lostNoResponse || 0) + (stats.bounced || 0);
                  const active = (stats.enrolled || 0) - finished;

                  return (
                    <tr
                      key={seq._id}
                      className="border-b border-dark-800 last:border-0 hover:bg-dark-800/30 cursor-pointer transition-colors"
                      onClick={() => onOpenDetail(seq)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-white font-medium truncate max-w-[200px]" title={seq.name}>{seq.name}</span>
                          {seq.sharedWithCompany && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded">
                              <Users className="w-2.5 h-2.5" />
                              Shared
                            </span>
                          )}
                        </div>
                        <div className="text-dark-500 text-xs">{emailSteps} Email{emailSteps !== 1 ? 's' : ''}</div>
                      </td>
                      <td className="py-3 px-4 text-dark-300 text-xs">
                        {seq.isOwner === false
                          ? <span className="text-blue-400">{seq.ownerName || 'Teammate'}</span>
                          : user?.name ? `${user.name.split(' ')[0]} ${user.name.split(' ')[1]?.charAt(0) || ''}.`.trim() : '—'}
                      </td>
                      <td className="py-3 px-4 text-dark-300">{stats.enrolled || 0}</td>
                      <td className="py-3 px-4 text-dark-300">{Math.max(active, 0)}/{finished}</td>
                      <td className="py-3 px-4 text-dark-300">{stats.sent || 0}</td>
                      <td className="py-3 px-4 text-dark-300">{openRate}</td>
                      <td className="py-3 px-4">
                        <span className={`${(stats.replied || 0) > 0 ? 'text-rivvra-400' : 'text-dark-300'}`}>
                          {replyRate}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-dark-300">{bounceRate}</td>
                      <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                        {seq.isOwner === false ? (
                          <span className="text-dark-500 text-xs italic">View only</span>
                        ) : seq.status === 'completed' ? (
                          <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-full">
                            Completed
                          </span>
                        ) : (
                          <ToggleSwitch
                            checked={isActive}
                            onChange={() => onToggle(seq._id, seq.status)}
                            size="small"
                          />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="relative">
                          <button
                            ref={el => { if (actionMenuId === seq._id && el) menuBtnRectRef.current = el.getBoundingClientRect(); }}
                            onClick={(e) => { menuBtnRectRef.current = e.currentTarget.getBoundingClientRect(); onToggleMenu(seq._id); }}
                            className="p-1.5 text-dark-500 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {actionMenuId === seq._id && createPortal(
                            <>
                              <div className="fixed inset-0 z-[9998]" onClick={() => onToggleMenu(null)} />
                              <div className="fixed w-48 bg-dark-800 border border-dark-600 rounded-xl shadow-xl py-1 z-[9999]" style={{ top: (menuBtnRectRef.current?.bottom || 0) + 4, right: window.innerWidth - (menuBtnRectRef.current?.right || 0) }}>
                                <button
                                  onClick={() => handleExportCsv(seq._id)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark-200 hover:bg-dark-700 hover:text-white transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Export to CSV
                                </button>
                                <button
                                  onClick={() => onDuplicate(seq._id)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark-200 hover:bg-dark-700 hover:text-white transition-colors"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  Duplicate
                                </button>
                                {(seq.isOwner !== false || user?.role === 'admin') && user?.companyId && (
                                  <button
                                    onClick={() => onShare(seq._id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-blue-400 hover:bg-dark-700 transition-colors"
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                    {seq.sharedWithCompany ? 'Unshare from team' : 'Share with team'}
                                  </button>
                                )}
                                {seq.isOwner !== false && (
                                  <button
                                    onClick={() => onEdit(seq)}
                                    disabled={seq.status === 'active'}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark-200 hover:bg-dark-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                )}
                                {seq.isOwner !== false && seq.status === 'active' && (
                                  <button
                                    onClick={() => onPause(seq._id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-amber-400 hover:bg-dark-700 transition-colors"
                                  >
                                    <Pause className="w-3.5 h-3.5" />
                                    Pause
                                  </button>
                                )}
                                {seq.isOwner !== false && (seq.status === 'paused' || seq.status === 'draft') && (
                                  <button
                                    onClick={() => onResume(seq._id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-400 hover:bg-dark-700 transition-colors"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                    Activate
                                  </button>
                                )}
                                {seq.isOwner !== false && (
                                  <button
                                    onClick={() => onDelete(seq._id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-dark-700 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                  </button>
                                )}
                              </div>
                            </>,
                            document.body
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
      )}
    </>
  );
}

// ========================== EMPTY STATE ==========================

function EmptyState({ onNewSequence, setupComplete }) {
  return (
    <div className="card p-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rivvra-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-4">
        <Send className="w-8 h-8 text-rivvra-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">
        Create your first sequence
      </h3>
      <p className="text-dark-400 text-sm max-w-md mx-auto mb-6">
        Email sequences help you automatically follow up with leads through a series
        of personalized emails. Set up your steps, enroll leads, and let automation
        do the work.
      </p>
      {setupComplete === false && (
        <p className="text-amber-400/80 text-xs mb-4 flex items-center justify-center gap-1">
          <ShieldAlert className="w-3.5 h-3.5" />
          Complete the setup guide above first
        </p>
      )}
      <button
        onClick={onNewSequence}
        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
          setupComplete === false
            ? 'bg-dark-700 text-dark-400 cursor-not-allowed'
            : 'bg-rivvra-500 text-dark-950 hover:bg-rivvra-400'
        }`}
      >
        <Plus className="w-4 h-4" />
        New Sequence
      </button>
    </div>
  );
}

export default EngagePage;
