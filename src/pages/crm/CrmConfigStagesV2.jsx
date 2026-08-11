import { useState, useEffect, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import crmApi from '../../utils/crmApi';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { GitBranch, RotateCcw } from 'lucide-react';
import { Button, Chip } from '../../components/ds';
import { ConfigListV2 } from '../../components/platform/v2/configkit';

/* v2 CRM Stages (Slice 4) — same CRUD as CrmConfigStages.jsx on the
   config kit. Reset-to-defaults keeps its destructive confirm (upgraded
   from native window.confirm to ConfirmDialog); the server blocks stage
   deletion while opportunities sit in the stage. */
export default function CrmConfigStagesV2() {
  const { orgSlug } = useOrg();
  const { addToast } = useToast();
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchStages = useCallback(async () => {
    try {
      const res = await crmApi.listStages(orgSlug);
      if (res.success) setStages(res.stages || []);
    } catch {
      addToast('Failed to load stages', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, addToast]);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await crmApi.resetStagesToDefaults(orgSlug);
      if (res.success) {
        setStages(res.stages || []);
        addToast('Stages reset to defaults', 'success');
      }
      setConfirmReset(false);
    } catch (err) {
      addToast(err.message || 'Failed to reset stages', 'error');
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <ConfigListV2
        icon={<GitBranch size={20} />}
        title="Pipeline Stages"
        sub="Manage the stages deals move through"
        noun="stage"
        items={stages}
        loading={loading}
        columns={[
          { key: 'sequence', header: '#', width: 50, muted: true, render: (s, i) => s.sequence ?? (i + 1) },
          { key: 'name', header: 'Stage Name', render: (s) => <span style={{ color: 'var(--fg)' }}>{s.name}</span> },
          { key: 'isWonStage', header: 'Won Stage', width: 110, render: (s) => s.isWonStage ? <Chip tone="warn">Won</Chip> : null },
        ]}
        fields={[
          { key: 'name', label: 'Stage Name', required: true, placeholder: 'e.g. Proposal Sent', autoFocus: true },
          { key: 'isWonStage', label: 'Is Won Stage', type: 'toggle', hint: 'Deals reaching this stage count as won.' },
        ]}
        onCreate={async (values) => {
          await crmApi.createStage(orgSlug, values);
          fetchStages();
          addToast('Stage created', 'success');
        }}
        onUpdate={async (item, values) => {
          await crmApi.updateStage(orgSlug, item._id, values);
          fetchStages();
          addToast('Stage updated', 'success');
        }}
        onDelete={async (item) => {
          try {
            await crmApi.deleteStage(orgSlug, item._id);
            fetchStages();
            addToast('Stage deleted', 'success');
          } catch (err) {
            addToast(err.message || 'Failed to delete', 'error');
          }
        }}
        deleteConfirm={(item) => ({
          title: 'Delete stage?',
          message: `Delete "${item.name}"? If any opportunities sit in this stage, the server will refuse the deletion until they're moved.`,
        })}
        headerActions={(
          <Button variant="secondary" size="sm" iconLeft={<RotateCcw size={13} />} onClick={() => setConfirmReset(true)}>
            Reset to Defaults
          </Button>
        )}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Reset stages to defaults?"
        message="This replaces all custom stages with the default pipeline (Initial Contact → Converted to Job). Existing opportunities will be moved onto the default stages."
        confirmLabel="Reset"
        danger
        busy={resetting}
        onCancel={() => { if (!resetting) setConfirmReset(false); }}
        onConfirm={handleReset}
      />
    </>
  );
}
