// ============================================================================
// SignDashboardV2.jsx — Sign dashboard on ds (phase 7)
// ============================================================================
// Copied from SignDashboard.jsx. Unchanged: `deriveStatus`, which promotes a
// `sent` request to a virtual `in_progress` once any signer has completed —
// the same derivation the requests list uses, so a partially-signed request
// reads the same in both places.
//
// No send path is touched. The three header buttons navigate to the requests
// or templates page with a query flag; the actual send lives there.
//
// Presentation moves to ds: the local StatCard becomes `Stat`, the local
// StatusBadge becomes `Chip`, the hand-rolled signer progress bar becomes
// `Meter`, and the table becomes `DataTable`.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import {
  FileText, Send, CheckCircle2,
  LayoutTemplate, Plus, Upload, User, Zap,
} from 'lucide-react';
import { formatDateTime } from '../../utils/dateUtils';
import { useAuth } from '../../context/AuthContext';
import {
  Button, Chip, DataTable, EmptyState, Meter, PageHeader, Panel, Spinner, Stat,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

// Tone by meaning, matching the legacy colour choices: signed → brand,
// in-progress → warn, cancelled/refused → danger, sent → info.
const STATUS_TONES = {
  sent: 'info',
  in_progress: 'warn',
  signed: 'brand',
  cancelled: 'danger',
  expired: 'warn',
  draft: 'neutral',
  refused: 'danger',
};

// Derive a virtual `in_progress` for `sent` rows where some signers have
// already completed — same derivation the requests list uses, so a
// partially-signed request reads "In progress" here too.
function deriveStatus(req) {
  if (req?.state === 'sent') {
    const completed = (req.signers || []).filter((s) => s.state === 'completed').length;
    if (completed > 0) return 'in_progress';
  }
  return req?.state || 'draft';
}

function StatusBadge({ status }) {
  const label = status === 'in_progress'
    ? 'In progress'
    : status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft';
  return <Chip tone={STATUS_TONES[status] || 'neutral'}>{label}</Chip>;
}

export default function SignDashboardV2() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, sent: 0, signed: 0, cancelled: 0 });
  const [templateCount, setTemplateCount] = useState(0);
  const [recentRequests, setRecentRequests] = useState([]);

  const fetchDashboard = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    setStats({ total: 0, sent: 0, signed: 0, cancelled: 0 });
    setTemplateCount(0);
    setRecentRequests([]);
    try {
      const res = await signApi.getDashboard(orgSlug);
      if (res.success !== false) {
        setStats(res.stats || { total: 0, sent: 0, signed: 0, cancelled: 0 });
        setTemplateCount(res.templateCount || 0);
        setRecentRequests(res.recentRequests || []);
      } else {
        showToast('Failed to load dashboard data', 'error');
      }
    } catch {
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, showToast, currentCompany?._id]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const formatDate = (dateStr) => formatDateTime(dateStr, { user, dateOnly: true }) || '—';

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
        <Spinner label="Loading dashboard…" />
      </div>
    );
  }

  const columns = [
    {
      key: 'document',
      header: 'Document',
      width: 300,
      render: (req) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-1)', background: 'var(--surface-3)',
          }}>
            <FileText size={13} style={{ color: 'var(--a-sign)' }} />
          </span>
          <span
            title={req.reference || req.name || 'Untitled'}
            style={{
              font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {req.reference || req.name || 'Untitled'}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 140,
      render: (req) => <StatusBadge status={deriveStatus(req)} />,
    },
    {
      key: 'signers',
      header: 'Signers',
      width: 170,
      render: (req) => {
        const totalSigners = req.signers?.length || 0;
        const signedCount = req.signers?.filter((s) => s.state === 'completed').length || 0;
        return (
          <Meter
            value={signedCount}
            max={totalSigners}
            size="sm"
            readout={`${signedCount}/${totalSigners}`}
          />
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Created',
      width: 130,
      muted: true,
      render: (req) => formatDate(req.createdAt),
    },
    {
      key: 'createdBy',
      header: 'Created By',
      width: 190,
      render: (req) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{
            width: 22, height: 22, flexShrink: 0, display: 'grid', placeItems: 'center',
            borderRadius: 999, background: 'var(--surface-3)',
          }}>
            <User size={11} style={{ color: 'var(--fg-4)' }} />
          </span>
          <span
            title={req.createdByName || req.createdBy?.name || ''}
            style={{
              font: `450 12.5px/1.4 ${FONT}`, color: 'var(--fg-2)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {req.createdByName || req.createdBy?.name || '—'}
          </span>
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1220 }}>
      <PageHeader
        title="Sign Dashboard"
        sub="Overview of your electronic signature requests"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              iconLeft={<Upload size={15} />}
              onClick={() => navigate(orgPath('/sign/templates?upload=1'))}
            >
              Upload Template
            </Button>
            <Button
              variant="secondary"
              iconLeft={<Zap size={15} style={{ color: 'var(--warn)' }} />}
              onClick={() => navigate(orgPath('/sign/requests?quicksend=true'))}
            >
              Quick Send
            </Button>
            <Button
              iconLeft={<Plus size={15} />}
              onClick={() => navigate(orgPath('/sign/requests?create=true'))}
            >
              New Request
            </Button>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      <div style={{
        display: 'grid', gap: 12, marginBottom: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      }}>
        <Stat label="Total Requests" value={stats.total} icon={<FileText size={14} />} color="var(--a-sign)" />
        <Stat label="Pending (Sent)" value={stats.sent} icon={<Send size={14} />} color="var(--info)" />
        <Stat label="Signed" value={stats.signed} icon={<CheckCircle2 size={14} />} color="var(--brand)" />
        <Stat label="Templates" value={templateCount} icon={<LayoutTemplate size={14} />} color="var(--a-kb)" />
      </div>

      <Panel flush title="Recent Requests">
        <DataTable
          columns={columns}
          rows={recentRequests}
          rowKey="_id"
          onRowClick={(req) => navigate(orgPath(`/sign/requests/${req._id}`))}
          empty={
            <EmptyState icon={<FileText size={22} />} title="No requests yet">
              Create your first signature request to get started.
            </EmptyState>
          }
        />
      </Panel>
    </div>
  );
}
