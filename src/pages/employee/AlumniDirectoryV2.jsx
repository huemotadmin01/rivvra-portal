import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import alumniApi from '../../utils/alumniApi';
import { DataTable, EmptyState, Button, Chip } from '../../components/ds';
import { PageHeaderV2 } from '../../components/platform/v2/listkit';
import { Users, RotateCcw, XCircle, AlertCircle, Shield, Clock } from 'lucide-react';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

function phaseChip(row) {
  if (row.status === 'archived') return <Chip tone="danger">Archived</Chip>;
  if (row.phase === 'a') return <Chip tone="warn">Phase A</Chip>;
  if (row.phase === 'b') return <Chip tone="warn">Phase B (Tax)</Chip>;
  if (row.phase === 'archived') return <Chip tone="danger">Pending archive</Chip>;
  return <Chip>Unknown</Chip>;
}

/* v2 Alumni Directory (Slice 2) — same data + actions as
   AlumniDirectory.jsx, rendered on ds DataTable. */
export default function AlumniDirectoryV2() {
  const { orgSlug } = usePlatform();
  const { isOrgAdmin, currentOrg } = useOrg();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [busyUserId, setBusyUserId] = useState(null);

  const load = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setLoading(true);
      setError(null);
      const res = await alumniApi.list(orgSlug);
      setRows(res?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load alumni directory');
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    if (isOrgAdmin) load();
  }, [isOrgAdmin, load]);

  const reactivate = async (row) => {
    if (!confirm(`Reactivate ${row.fullName} for 7 days?`)) return;
    try {
      setBusyUserId(row.userId);
      await alumniApi.reactivate(orgSlug, row.userId);
      showToast('Alumnus reactivated', 'success');
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to reactivate', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const revoke = async (row) => {
    if (!confirm(`Revoke access for ${row.fullName} immediately? They will be archived.`)) return;
    try {
      setBusyUserId(row.userId);
      await alumniApi.revoke(orgSlug, row.userId);
      showToast('Access revoked', 'success');
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to revoke', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  if (!isOrgAdmin) {
    return (
      <EmptyState icon={<AlertCircle size={22} />} tone="danger" title="Admin access required" compact />
    );
  }

  const columns = [
    {
      key: 'fullName', header: 'Name', width: 220,
      render: (r) => (
        <span style={{ minWidth: 0, display: 'block' }}>
          <span style={{ display: 'block', color: 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fullName}</span>
          <span style={{ display: 'block', font: '450 11.5px/1.3 var(--font)', color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</span>
        </span>
      ),
    },
    { key: 'phase', header: 'Phase', width: 130, render: (r) => phaseChip(r) },
    { key: 'lastWorkingDate', header: 'LWD', muted: true, width: 110, render: (r) => fmtDate(r.lastWorkingDate) },
    { key: 'alumniCutoffAt', header: 'Cutoff', muted: true, width: 110, render: (r) => fmtDate(r.alumniCutoffAt) },
    {
      key: 'daysRemaining', header: 'Days left', width: 90,
      render: (r) => r.daysRemaining !== null ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fg-2)' }}>
          <Clock size={12} style={{ color: 'var(--fg-4)' }} /> {r.daysRemaining}
        </span>
      ) : null,
    },
    {
      key: 'privateEmailOnFile', header: 'Personal email', width: 120,
      render: (r) => r.privateEmailOnFile ? <Chip tone="brand">On file</Chip> : <Chip tone="warn">Missing</Chip>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right', width: 270,
      render: (r) => {
        const busy = busyUserId === r.userId;
        return (
          <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <Button variant="secondary" size="sm" disabled={busy} iconLeft={<RotateCcw size={12} />} onClick={() => reactivate(r)}>
              Reactivate 7d
            </Button>
            {r.status !== 'archived' && (
              <Button variant="secondary" size="sm" disabled={busy} iconLeft={<XCircle size={12} />} style={{ color: 'var(--danger)' }} onClick={() => revoke(r)}>
                Revoke
              </Button>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeaderV2
        title="Alumni Directory"
        sub={`Former employees of ${currentOrg?.name || 'your organization'} with active read-only access. Alumni don't count against your billing seats.`}
        actions={(
          <Link to={`/org/${orgSlug}/settings/alumni-policy`} style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="sm" iconLeft={<Shield size={13} />}>Policy</Button>
          </Link>
        )}
      />

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, font: '450 13px/1.4 var(--font)', color: 'var(--danger)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey="userId"
        loading={loading}
        empty={(
          <EmptyState icon={<Users size={22} />} title="No alumni yet">
            Separated employees will appear here during their read-only access window.
          </EmptyState>
        )}
      />
    </div>
  );
}
