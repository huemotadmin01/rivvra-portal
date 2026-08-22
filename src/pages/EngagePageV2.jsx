// ============================================================================
// EngagePageV2.jsx — Outreach sequences list + Gmail connection, on ds
// ============================================================================
//
// Route: /org/:slug/outreach/engage.
//
// Spliced in byte-identically: the whole 336-line logic layer — the Gmail OAuth
// redirect exchange (including the single-use-code dedupe and the optimistic
// `rivvra_gmail_connected` marker that survives the OrgRedirect remount), every
// sequence action with its optimistic-update-and-revert, and both
// setup-completion gates:
//
//   handleToggleSequence  — refuses to ACTIVATE while setupStatus.allComplete
//                           is false, and only ever pauses optimistically
//   handleNewSequence     — refuses to open the wizard on the same condition
//
// The per-sequence campaign metrics live inside the render, so that block was
// copied to its own cell rather than rewritten. `openRate`, `replyRate` and
// `bounceRate` each clamp at 100% and read 0% when nothing has been sent;
// `finished` sums replied + repliedNotInterested + lostNoResponse + bounced,
// and `active` is enrolled minus that. These are the numbers someone judges a
// campaign by.
//
// `deliveredRate` in that block is computed and never rendered — it is dead in
// legacy too, and carrying it across keeps the lint baseline identical. Left
// alone deliberately: deleting it is a silent decision about a metric someone
// may have meant to show.
//
// ── Deliberate render-layer changes ────────────────────────────────────────
// • The local `EmptyState` is dropped in favour of ds `EmptyState`; the name
//   collided with the ds export, and the local one was a plain card.
// • The row action menu keeps its `createPortal` + `menuBtnRectRef`
//   positioning verbatim — it is a fixed-position menu measured off the
//   trigger, and the eslint `Cannot access refs during render` it produces is
//   part of the legacy baseline.
// ============================================================================

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
import { CardListSkeleton } from '../components/Skeletons';
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
import {
  Panel, Chip, Button, Input, Field, Callout, EmptyState,
  Meter, Tabs, InlineSelect,
} from '../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const bodyStyle = { font: "450 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 };
const metaStyle = { font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 };
const truncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const thStyle = {
  textAlign: 'left', whiteSpace: 'nowrap', padding: '12px 16px',
  font: "500 10px/1.4 'Inter', system-ui, sans-serif",
  letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg-4)',
};
const tdStyle = { padding: '12px 16px', ...bodyStyle };
const menuItem = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '8px 16px', cursor: 'pointer', background: 'none', border: 0,
  textAlign: 'left', font: "450 13px/1.4 'Inter', system-ui, sans-serif",
};

function EngagePageV2() {
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

    // An OAuth authorization code is SINGLE-USE. The post-callback redirect
    // (/engage → OrgRedirect → /org/:slug/outreach/engage) can remount this
    // component with the same ?gmail_code, firing the exchange twice — the
    // first succeeds, the second fails with invalid_grant and shows a false
    // "Failed to connect Gmail" toast. Dedupe per code so it runs exactly once.
    if (sessionStorage.getItem('rivvra_gmail_code_used') === gmailCode) return;
    sessionStorage.setItem('rivvra_gmail_code_used', gmailCode);
    // Mark a connect as in-flight. The token write can lag the OrgRedirect
    // remount, so a status load on the remounted page retries until the server
    // reflects it — fixes "had to refresh to see Gmail connected".
    sessionStorage.setItem('rivvra_gmail_pending_connect', '1');

    // Clean up URL first (remove query params) — use window.history to avoid re-render
    const cleanHash = window.location.hash.split('?')[0];
    window.history.replaceState(null, '', window.location.pathname + cleanHash);

    // Exchange the auth code for tokens
    let active = true;
    (async () => {
      try {
        const connectRes = await api.connectGmail(gmailCode);
        if (connectRes.success) {
          // Persist success so the (possibly remounted) page shows connected even
          // before the server status read catches up — timing-independent.
          sessionStorage.setItem('rivvra_gmail_connected', connectRes.gmailEmail || '1');
          sessionStorage.removeItem('rivvra_gmail_pending_connect');
          if (!active) return; // remounted — the new mount's status load reflects it via the marker
          setGmailStatus({ connected: true, email: connectRes.gmailEmail });
          setGmailLoading(false);
          loadSetupStatus();
          showToast('Gmail connected successfully!', 'success');
        } else {
          sessionStorage.removeItem('rivvra_gmail_pending_connect');
          sessionStorage.removeItem('rivvra_gmail_connected');
          if (!active) return;
          showToast(connectRes.error || 'Failed to connect Gmail.', 'error');
        }
      } catch (err) {
        sessionStorage.removeItem('rivvra_gmail_pending_connect');
        sessionStorage.removeItem('rivvra_gmail_connected');
        if (!active) return;
        console.error('Gmail connect from redirect error:', err);
        showToast('Failed to connect Gmail. Please try again.', 'error');
      }
    })();

    return () => { active = false; };
  }, [location.search]);

  async function loadGmailStatus(retry = 0) {
    try {
      const res = await api.getGmailStatus();
      if (res.success) {
        const connectedMark = sessionStorage.getItem('rivvra_gmail_connected');
        if (res.connected) {
          // Server is the source of truth once it confirms — clear transient markers.
          sessionStorage.removeItem('rivvra_gmail_pending_connect');
          sessionStorage.removeItem('rivvra_gmail_connected');
          setGmailStatus(res);
          loadSetupStatus(); // refresh the (separate) setup-guide connection state
        } else if (connectedMark) {
          // A connect succeeded this session but the server read hasn't caught up
          // (the OrgRedirect remount can outrun the token write). Show connected
          // optimistically and re-confirm; stop trusting the marker after a while.
          setGmailStatus({ connected: true, email: connectedMark !== '1' ? connectedMark : (res.email || null) });
          loadSetupStatus(); // the setup guide reads a separate status — keep it in sync
          if (retry < 8) setTimeout(() => loadGmailStatus(retry + 1), 1000);
          else sessionStorage.removeItem('rivvra_gmail_connected');
        } else if (sessionStorage.getItem('rivvra_gmail_pending_connect') && retry < 12) {
          // Exchange still in flight — keep the spinner and retry.
          setTimeout(() => loadGmailStatus(retry + 1), 800);
          return;
        } else {
          setGmailStatus(res);
        }
      }
      setGmailLoading(false);
    } catch (err) {
      console.error('Gmail status error:', err);
      setGmailLoading(false);
    }
  }

  async function loadSetupStatus() {
    try {
      const res = await api.getSetupStatus();
      if (res.success) {
        // A connect just succeeded this session but the server read hasn't caught
        // up (the setup guide reads a SEPARATE getSetupStatus, so it must honor the
        // same optimistic marker as gmail-status — otherwise the guide shows "Gmail
        // not connected" until a manual refresh). Server value wins once it catches
        // up (the marker is cleared by loadGmailStatus on confirmation).
        if (!res.gmailConnected && sessionStorage.getItem('rivvra_gmail_connected')) {
          setSetupStatus({ ...res, gmailConnected: true, allComplete: res.profileComplete === true });
        } else {
          setSetupStatus(res);
        }
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
      <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1280, margin: '0 auto' }}>
        <SequenceDetailPage
          sequenceId={selectedSequenceId}
          onBack={handleBackToList}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1280, margin: '0 auto' }}>
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

      {/* Gmail Connection Banner — never connected */}
      {!showSetupGuide && !gmailLoading && !gmailStatus.connected && !gmailStatus.wasConnected && (
        <div style={{ marginBottom: 24 }}>
          <Callout tone="brand" icon={<Mail size={18} />}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, minWidth: 240 }}>
                <span style={{ fontWeight: 550, color: 'var(--fg)' }}>Connect your email to start sending. </span>
                <span style={{ color: 'var(--fg-4)' }}>Link your Gmail account to send personalized emails from your own address.</span>
              </span>
              <Button variant="secondary" size="sm" onClick={handleConnectGmail} style={{ flexShrink: 0 }}>
                Connect email
              </Button>
            </div>
          </Callout>
        </div>
      )}

      {/* Gmail Connection Banner — was connected, now disconnected */}
      {!showSetupGuide && !gmailLoading && !gmailStatus.connected && gmailStatus.wasConnected && (
        <div style={{ marginBottom: 24 }}>
          <Callout tone="danger" icon={<AlertCircle size={18} />}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, minWidth: 240 }}>
                <span style={{ fontWeight: 550, color: 'var(--fg)' }}>Your email has been disconnected. </span>
                <span style={{ color: 'var(--fg-4)' }}>Reconnect to resume sending emails to your contacts.</span>
              </span>
              <Button variant="secondary" size="sm" onClick={handleConnectGmail} style={{ flexShrink: 0, color: 'var(--danger)' }}>
                Reconnect email
              </Button>
            </div>
          </Callout>
        </div>
      )}

      {/* Gmail connected */}
      {!showSetupGuide && !gmailLoading && gmailStatus.connected && (
        <div style={{ marginBottom: 24 }}>
          <Callout tone="brand" icon={<Link2 size={18} />}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, minWidth: 240 }}>
                <span style={{ fontWeight: 550, color: 'var(--fg)' }}>Email connected: </span>
                <span style={{ color: 'var(--brand-ink)' }}>{gmailStatus.email}</span>
              </span>
              <Button variant="secondary" size="sm" onClick={handleDisconnectGmail} style={{ flexShrink: 0 }}>
                Disconnect
              </Button>
            </div>
          </Callout>
        </div>
      )}

      {/* Tabs: Sequences | Settings */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs
            value={mainTab}
            onChange={setMainTab}
            tabs={[
              { key: 'sequences', label: 'Sequences' },
              { key: 'settings', label: 'Settings' },
            ]}
          />
        </div>
        <a
          href="https://docs.rivvra.com/engage"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingBottom: 12,
            font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
          }}
        >
          See how it works <ExternalLink size={12} />
        </a>
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
          onEdit={(seq) => { navigate(orgPath(`/outreach/engage/edit-sequence/${seq._id}`)); setActionMenuId(null); }}
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
  );
}

// ========================== SEQUENCES TAB ==========================

function SortableHeader({ label, sortKey, currentSort, onSort }) {
  const isActive = currentSort.key === sortKey;
  const isAsc = currentSort.dir === 'asc';
  return (
    <button
      onClick={() => onSort(sortKey)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
        background: 'none', border: 0, padding: 0, textAlign: 'left',
        font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
      }}
    >
      {label}
      <span style={{ color: isActive ? 'var(--brand-ink)' : 'var(--fg-4)', display: 'inline-flex' }}>
        {isActive ? (
          isAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ArrowUpDown size={12} />
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
  return (
    <>
      {/* Stats bar + Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260, flex: 1, maxWidth: 420 }}>
          <Meter
            style={{ flex: 1 }}
            value={emailsSentToday.sent}
            max={emailsSentToday.limit || 1}
            label={<span style={metaStyle}>Emails sent today</span>}
            readout={
              <span style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
                {emailsSentToday.sent}/{emailsSentToday.limit}
              </span>
            }
            color={
              emailsSentToday.limit > 0 && (emailsSentToday.sent / emailsSentToday.limit) >= 0.9
                ? 'var(--danger)'
                : emailsSentToday.limit > 0 && (emailsSentToday.sent / emailsSentToday.limit) >= 0.7
                ? 'var(--warn-ink)'
                : undefined
            }
          />
          <span title="Emails sent today vs your daily limit" style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--fg-4)', cursor: 'help' }}>
            <Info size={14} />
          </span>
        </div>
        <span title={setupComplete === false ? 'Complete setup to create sequences' : undefined} style={{ display: 'inline-flex' }}>
          <Button
            onClick={onNewSequence}
            disabled={setupComplete === false}
            iconLeft={setupComplete === false ? <ShieldAlert size={16} /> : <Plus size={16} />}
          >
            New sequence
          </Button>
        </span>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <InlineSelect
          value={filterStatus}
          onChange={(e) => onFilter(e.target.value)}
          aria-label="Filter sequences by status"
        >
          <option value="all">All sequences</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="draft">Draft</option>
        </InlineSelect>

        <div style={{ position: 'relative', flex: 1, maxWidth: 384, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search sequences"
            style={{ paddingLeft: 36 }}
          />
        </div>

        <div style={{ ...metaStyle, marginLeft: 'auto' }}>
          {sequences.length !== totalCount
            ? `${sequences.length} of ${totalCount} Sequence${totalCount !== 1 ? 's' : ''}`
            : `${sequences.length} Sequence${sequences.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="animate-pulse" style={{ padding: '8px 0' }}><CardListSkeleton count={4} /></div>
      ) : sequences.length === 0 ? (
        <EmptyState
          icon={<Send size={28} />}
          title="Create your first sequence"
          actions={
            <span title={setupComplete === false ? 'Complete the setup guide above first' : undefined} style={{ display: 'inline-flex' }}>
              <Button onClick={onNewSequence} disabled={setupComplete === false} iconLeft={<Plus size={16} />}>
                New Sequence
              </Button>
            </span>
          }
        >
          Email sequences help you automatically follow up with leads through a series
          of personalized emails. Set up your steps, enroll leads, and let automation
          do the work.
          {setupComplete === false && (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, color: 'var(--warn-ink)' }}>
              <ShieldAlert size={14} />
              Complete the setup guide above first
            </span>
          )}
        </EmptyState>
      ) : (
        <Panel flush style={{ overflow: 'visible' }}>
          <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
            <table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
                  <th style={thStyle}>
                    <SortableHeader label="Sequence" sortKey="name" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th style={thStyle}>Owner</th>
                  <th style={thStyle}>
                    <SortableHeader label="Contacts" sortKey="contacts" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th style={thStyle}>Active/Finished</th>
                  <th style={thStyle}>
                    <SortableHeader label="Delivered" sortKey="delivered" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th style={thStyle}>
                    <SortableHeader label="Opened" sortKey="opened" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th style={thStyle}>
                    <SortableHeader label="Interested" sortKey="replied" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th style={thStyle}>
                    <SortableHeader label="Bounced" sortKey="bounced" currentSort={sort} onSort={handleSort} />
                  </th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 96 }} />
                  <th style={{ ...thStyle, textAlign: 'right', width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {sortedSequences.map(seq => {
                  const stats = seq.stats || {};
                  const emailSteps = (seq.steps || []).filter(s => s.type === 'email').length;
                  const isActive = seq.status === 'active';

                  // ── Campaign metrics — carried across from legacy unchanged.
                  //    Each rate clamps at 100% and reads 0% before anything is
                  //    sent; `finished` is every terminal outcome, and `active`
                  //    is what is left of the enrolled set.
                  //    `deliveredRate` is dead in legacy too — see the header note.
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
                      style={{ borderBottom: '1px solid var(--line-2)', cursor: 'pointer' }}
                      onClick={() => onOpenDetail(seq)}
                    >
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ ...truncate, maxWidth: 200, fontWeight: 550, color: 'var(--fg)' }} title={seq.name}>{seq.name}</span>
                          {seq.sharedWithCompany && (
                            <Chip tone="info"><Users size={11} /> Shared</Chip>
                          )}
                        </div>
                        <div style={metaStyle}>{emailSteps} Email{emailSteps !== 1 ? 's' : ''}</div>
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12 }}>
                        {seq.isOwner === false
                          ? <span style={{ color: 'var(--acc-blue, var(--brand-ink))' }}>{seq.ownerName || 'Teammate'}</span>
                          : user?.name ? `${user.name.split(' ')[0]} ${user.name.split(' ')[1]?.charAt(0) || ''}.`.trim() : '—'}
                      </td>
                      <td style={tdStyle}>{stats.enrolled || 0}</td>
                      <td style={tdStyle}>{Math.max(active, 0)}/{finished}</td>
                      <td style={tdStyle}>{stats.sent || 0}</td>
                      <td style={tdStyle}>{openRate}</td>
                      <td style={tdStyle}>
                        <span style={{ color: (stats.replied || 0) > 0 ? 'var(--brand-ink)' : 'var(--fg-3)' }}>
                          {replyRate}
                        </span>
                      </td>
                      <td style={tdStyle}>{bounceRate}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        {seq.isOwner === false ? (
                          <span style={{ ...metaStyle, fontStyle: 'italic' }}>View only</span>
                        ) : seq.status === 'completed' ? (
                          <Chip tone="brand">Completed</Chip>
                        ) : (
                          <ToggleSwitch
                            checked={isActive}
                            onChange={() => onToggle(seq._id, seq.status)}
                            size="small"
                          />
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div style={{ position: 'relative' }}>
                          {/* Plain <button>, not ds Button: the portalled menu is
                              positioned from this node's getBoundingClientRect(),
                              and ds Button does not forward its ref. */}
                          <button
                            type="button"
                            aria-label="Sequence actions"
                            aria-haspopup="menu"
                            aria-expanded={actionMenuId === seq._id}
                            ref={el => { if (actionMenuId === seq._id && el) menuBtnRectRef.current = el.getBoundingClientRect(); }}
                            onClick={(e) => { menuBtnRectRef.current = e.currentTarget.getBoundingClientRect(); onToggleMenu(seq._id); }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              padding: 6, borderRadius: 8, cursor: 'pointer',
                              background: 'none', border: 0, color: 'var(--fg-4)',
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {actionMenuId === seq._id && createPortal(
                            <>
                              <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => onToggleMenu(null)} />
                              <div
                                style={{
                                  position: 'fixed', width: 192, zIndex: 9999, padding: '4px 0',
                                  borderRadius: 'var(--r-3, 14px)', background: 'var(--surface-2)',
                                  boxShadow: '0 0 0 1px var(--line-2), var(--sh-4)',
                                  top: (menuBtnRectRef.current?.bottom || 0) + 4,
                                  right: window.innerWidth - (menuBtnRectRef.current?.right || 0),
                                }}
                              >
                                <button onClick={() => handleExportCsv(seq._id)} style={{ ...menuItem, color: 'var(--fg-2)' }}>
                                  <Download size={14} />
                                  Export to CSV
                                </button>
                                <button onClick={() => onDuplicate(seq._id)} style={{ ...menuItem, color: 'var(--fg-2)' }}>
                                  <Copy size={14} />
                                  Duplicate
                                </button>
                                {(seq.isOwner !== false || user?.role === 'admin') && user?.companyId && (
                                  <button onClick={() => onShare(seq._id)} style={{ ...menuItem, color: 'var(--acc-blue, var(--brand-ink))' }}>
                                    <Share2 size={14} />
                                    {seq.sharedWithCompany ? 'Unshare from team' : 'Share with team'}
                                  </button>
                                )}
                                {seq.isOwner !== false && (
                                  <button
                                    onClick={() => onEdit(seq)}
                                    disabled={seq.status === 'active'}
                                    style={{ ...menuItem, color: 'var(--fg-2)', opacity: seq.status === 'active' ? 0.4 : 1, cursor: seq.status === 'active' ? 'not-allowed' : 'pointer' }}
                                  >
                                    <Edit3 size={14} />
                                    Edit
                                  </button>
                                )}
                                {seq.isOwner !== false && seq.status === 'active' && (
                                  <button onClick={() => onPause(seq._id)} style={{ ...menuItem, color: 'var(--warn-ink)' }}>
                                    <Pause size={14} />
                                    Pause
                                  </button>
                                )}
                                {seq.isOwner !== false && (seq.status === 'paused' || seq.status === 'draft') && (
                                  <button onClick={() => onResume(seq._id)} style={{ ...menuItem, color: 'var(--brand-ink)' }}>
                                    <Play size={14} />
                                    Activate
                                  </button>
                                )}
                                {seq.isOwner !== false && (
                                  <button onClick={() => onDelete(seq._id)} style={{ ...menuItem, color: 'var(--danger)' }}>
                                    <Trash2 size={14} />
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
        </Panel>
      )}
    </>
  );
}

export default EngagePageV2;
