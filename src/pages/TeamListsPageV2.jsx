import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useToast } from '../context/ToastContext';
import { Users, RefreshCw, Download, Pencil, Lock, Layers } from 'lucide-react';
import api from '../utils/api';
import { exportLeadsToCSV } from '../utils/csvExport';
import LeadDetailPanel from '../components/LeadDetailPanel';
import ComingSoonModal from '../components/ComingSoonModal';
import AddToListModal from '../components/AddToListModal';
import ExportToCRMModal from '../components/ExportToCRMModal';
import AddToSequenceModal from '../components/AddToSequenceModal';
import EditContactModal from '../components/EditContactModal';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { Button, BulkActionBar, Pagination, Modal, Input } from '../components/ds';
import { PageHeaderV2 } from '../components/platform/v2/listkit';
import {
  LeadsFilterStrip, LeadsTableV2, LeadsEmptyState, ListsRailV2,
  useSetupStatus, useLeadPanelSync, sequenceEmailGuardOk,
} from '../components/outreach/v2/leadskit';

/* v2 Team Lists (Slice 3 Wave C) — same data flow as TeamListsPage.jsx:
   default/team lists rail (rename is admin-only), api.getTeamListLeads
   with owner filter (member _id key), per-row edit gated by canEditLead,
   single-row remove-from-list only (no bulk verbs — legacy parity). */
export default function TeamListsPageV2() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { getAppRole, currentOrg, hasAppAccess } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { orgPath } = usePlatform();

  const orgRole = currentOrg ? getAppRole('outreach') : null;
  const effectiveRole = orgRole || user?.role || 'member';
  const isAdminOrLead = effectiveRole === 'admin' || effectiveRole === 'team_lead';
  const uid = user?._id || user?.id;
  const canEditLead = (lead) => isAdminOrLead || lead.userId === uid || lead.visitorId === uid;

  const [lists, setLists] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedList, setSelectedList] = useState(searchParams.get('list') || null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [profileTypeFilter, setProfileTypeFilter] = useState('all');
  const [outreachStatusFilter, setOutreachStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');

  const [selectedLeads, setSelectedLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [renamingList, setRenamingList] = useState(null); // {id, name}
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState('');
  const [showAddToList, setShowAddToList] = useState(false);
  const [addToListTarget, setAddToListTarget] = useState(null);
  const [showExportCRM, setShowExportCRM] = useState(false);
  const [exportCRMTarget, setExportCRMTarget] = useState(null);
  const [showAddToSequence, setShowAddToSequence] = useState(false);
  const [sequenceTarget, setSequenceTarget] = useState(null);
  const [showEditContact, setShowEditContact] = useState(false);
  const [editContactTarget, setEditContactTarget] = useState(null);

  const setupComplete = useSetupStatus();
  const canExportCrm = hasAppAccess('crm') || user?.plan === 'pro' || user?.plan === 'premium';
  const leadsPerPage = 10;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadLists = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    try {
      const res = await api.getTeamLists();
      if (res.success) {
        setLists(res.lists || []);
        setTeamMembers(res.teamMembers || []);
        if (!selectedList && (res.lists || []).length > 0) setSelectedList(res.lists[0].name);
      }
    } catch (err) {
      console.error('Failed to load team lists:', err);
      setLists([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedList]);

  const loadLeads = useCallback(async (listName, pageNum = 1, search = '', filters = {}) => {
    if (!listName) return;
    try {
      setLeadsLoading(true);
      const res = await api.getTeamListLeads(listName, {
        page: pageNum,
        limit: leadsPerPage,
        search: search || undefined,
        profileType: filters.profileType,
        outreachStatus: filters.outreachStatus,
        owner: filters.owner !== 'all' ? filters.owner : undefined,
      });
      if (res.success) {
        setLeads(res.leads || []);
        setTotalPages(res.totalPages || 1);
        setTotalLeads(res.total || 0);
      }
    } catch (err) {
      console.error('Failed to load team list leads:', err);
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  useEffect(() => {
    if (!selectedList) return;
    setSelectedLeads([]);
    loadLeads(selectedList, page, debouncedSearch, {
      profileType: profileTypeFilter,
      outreachStatus: outreachStatusFilter,
      owner: ownerFilter,
    });
  }, [selectedList, page, debouncedSearch, profileTypeFilter, outreachStatusFilter, ownerFilter, loadLeads]);

  const selectList = (list) => {
    setSelectedList(list.name);
    setPage(1);
    setSearchParams({ list: list.name });
  };

  const { openLead, closePanel } = useLeadPanelSync({
    leadId, leads, selectedLead, setSelectedLead, navigate, orgPath,
    seg: 'team-lists', keepQs: true, searchParams,
  });

  const handleLeadUpdate = (updated) => {
    setLeads((prev) => prev.map((l) => (l._id === updated._id ? { ...l, ...updated, ownerName: updated.ownerName || l.ownerName } : l)));
    setSelectedLead((prev) => (prev && prev._id === updated._id ? { ...prev, ...updated, ownerName: updated.ownerName || prev.ownerName } : prev));
  };

  const handleRenameList = async () => {
    const name = renameValue.trim();
    if (!renamingList || !name) return;
    setRenaming(true);
    try {
      const res = await api.renameDefaultList(renamingList.id, name);
      if (res.success !== false) {
        setLists((prev) => prev.map((l) => (l._id === renamingList.id ? { ...l, name } : l)));
        if (selectedList === renamingList.name) {
          setSelectedList(name);
          setSearchParams({ list: name });
        }
        setRenamingList(null);
        setRenameValue('');
        showToast('List renamed', 'success');
      } else {
        showToast(res.error || 'Failed to rename list', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to rename list', 'error');
    } finally {
      setRenaming(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.removeLeadFromList(removeTarget._id, selectedList);
      setLeads((prev) => prev.filter((l) => l._id !== removeTarget._id));
      setTotalLeads((prev) => prev - 1);
      setLists((prev) => prev.map((l) => (l.name === selectedList ? { ...l, count: Math.max(0, (l.count || 1) - 1) } : l)));
      if (selectedLead?._id === removeTarget._id) closePanel();
      showToast('Removed from list', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to remove from list', 'error');
    } finally {
      setRemoving(false);
      setShowRemoveModal(false);
      setRemoveTarget(null);
    }
  };

  // ManageDropdown only renders on rows the caller can edit (legacy gating).
  const manageProps = (lead) => {
    if (!canEditLead(lead)) return null;
    return {
      onExportCRM: () => {
        if (!canExportCrm) { setComingSoonFeature('Export to CRM'); setShowComingSoon(true); return; }
        setExportCRMTarget(lead); setShowExportCRM(true);
      },
      onAddToSequence: () => {
        if (setupComplete === false) { showToast('Connect your email in Settings before adding to a sequence', 'error'); return; }
        if (!sequenceEmailGuardOk(lead)) { showToast('This contact has no valid email address', 'error'); return; }
        setSequenceTarget(lead); setShowAddToSequence(true);
      },
      onAddToList: () => { setAddToListTarget(lead); setShowAddToList(true); },
      onEditContact: () => { setEditContactTarget(lead); setShowEditContact(true); },
      onTagContact: () => { setComingSoonFeature('Tag Contact'); setShowComingSoon(true); },
      onRemoveContact: () => { setRemoveTarget(lead); setShowRemoveModal(true); },
      removeLabel: 'Remove from list',
    };
  };

  const handleExportCSV = () => {
    const rows = selectedLeads.length
      ? leads.filter((l) => selectedLeads.includes(l._id))
      : leads;
    exportLeadsToCSV(rows, `rivvra-team-${(selectedList || 'list').toLowerCase().replace(/\s+/g, '-')}`, { includeOwner: true });
  };

  const filtered = debouncedSearch || profileTypeFilter !== 'all' || outreachStatusFilter !== 'all' || ownerFilter !== 'all';

  return (
    <div style={{ marginRight: selectedLead ? 420 : 0, transition: 'margin-right var(--d-3) var(--e-out)' }}>
      <PageHeaderV2
        title={selectedList || 'Team Lists'}
        sub={selectedList ? `${totalLeads} ${totalLeads === 1 ? 'contact' : 'contacts'} · lists fill automatically from outreach status` : 'Select a team list'}
        actions={(
          <>
            <Button variant="secondary" size="sm" disabled={refreshing} iconLeft={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} onClick={() => { loadLists(true); if (selectedList) loadLeads(selectedList, page, debouncedSearch, { profileType: profileTypeFilter, outreachStatus: outreachStatusFilter, owner: ownerFilter }); }}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<Download size={14} />} onClick={handleExportCSV} disabled={!selectedList || totalLeads === 0}>
              Export CSV
            </Button>
          </>
        )}
      />

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <ListsRailV2
          title="Team Lists"
          lists={lists}
          selected={selectedList}
          onSelect={selectList}
          headerAction={<Layers size={13} style={{ color: 'var(--fg-4)' }} />}
          itemAction={(list) => isAdminOrLead ? (
            <button type="button" title="Rename list"
              onClick={(e) => { e.stopPropagation(); setRenamingList({ id: list._id, name: list.name }); setRenameValue(list.name); }}
              style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 'var(--r-1)', color: 'var(--fg-faint)', flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-faint)'; }}>
              <Pencil size={11} />
            </button>
          ) : (
            <Lock size={10} style={{ color: 'var(--fg-faint)', flexShrink: 0 }} />
          )}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {!loading && lists.length === 0 ? (
            <LeadsEmptyState icon={<Layers size={22} />} title="No team lists found">
              Team lists are created automatically as your team runs outreach.
            </LeadsEmptyState>
          ) : (
            <>
              <LeadsFilterStrip
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search in this list…"
                profileTypeFilter={profileTypeFilter}
                onProfileTypeChange={(v) => { setProfileTypeFilter(v); setPage(1); }}
                outreachStatusFilter={outreachStatusFilter}
                onStatusChange={(v) => { setOutreachStatusFilter(v); setPage(1); }}
                ownerFilter={ownerFilter}
                onOwnerChange={(v) => { setOwnerFilter(v); setPage(1); }}
                ownerOptions={teamMembers.map((m) => ({ value: m._id, label: m.name || m.email || m._id }))}
                resultCount={totalLeads}
                noun="contact"
              />
              <LeadsTableV2
                leads={leads}
                loading={loading || leadsLoading}
                selectedLeads={selectedLeads}
                onSelectionChange={setSelectedLeads}
                showOwnerCol
                onOpenLead={openLead}
                manageProps={manageProps}
                empty={(
                  <LeadsEmptyState
                    icon={<Users size={22} />}
                    title={filtered ? 'No results found' : 'No contacts in this list'}
                  >
                    {filtered
                      ? 'Try adjusting your search or filters.'
                      : 'Contacts are added automatically based on outreach status.'}
                  </LeadsEmptyState>
                )}
              />
              {totalLeads > 0 && (
                <Pagination page={page} pageSize={leadsPerPage} total={totalLeads} onPageChange={setPage} noun="contact" />
              )}
            </>
          )}
        </div>
      </div>

      {/* No bulk verbs on team lists (legacy parity) — selection only feeds CSV export. */}
      <BulkActionBar
        count={selectedLeads.length}
        noun="contact"
        onClear={() => setSelectedLeads([])}
        actions={[
          { label: 'Export CSV', icon: <Download size={13} />, onClick: handleExportCSV },
        ]}
      />

      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={closePanel}
          onUpdate={handleLeadUpdate}
          teamMode
          teamMembers={teamMembers}
        />
      )}

      <ConfirmDialog
        open={showRemoveModal}
        title="Remove from list?"
        message={`"${removeTarget?.name || 'This contact'}" will be removed from "${selectedList}". The contact record itself is kept.`}
        confirmLabel="Remove"
        danger
        busy={removing}
        onCancel={() => { if (!removing) { setShowRemoveModal(false); setRemoveTarget(null); } }}
        onConfirm={confirmRemove}
      />

      <Modal open={!!renamingList} onClose={() => { if (!renaming) { setRenamingList(null); setRenameValue(''); } }} title="Rename list" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="List name…"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameList(); }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => { setRenamingList(null); setRenameValue(''); }} disabled={renaming}>Cancel</Button>
            <Button size="sm" onClick={handleRenameList} disabled={renaming || !renameValue.trim()}>
              {renaming ? 'Renaming…' : 'Rename'}
            </Button>
          </div>
        </div>
      </Modal>

      <ComingSoonModal isOpen={showComingSoon} onClose={() => setShowComingSoon(false)} feature={comingSoonFeature} />
      <AddToListModal
        isOpen={showAddToList}
        onClose={() => { setShowAddToList(false); setAddToListTarget(null); }}
        lead={addToListTarget}
        onLeadUpdate={(u) => { handleLeadUpdate(u); loadLists(false); }}
      />
      <ExportToCRMModal
        isOpen={showExportCRM}
        onClose={() => { setShowExportCRM(false); setExportCRMTarget(null); }}
        lead={exportCRMTarget}
        onSuccess={(exportedLeadId) => {
          setLeads((prev) => prev.map((l) => (l._id === exportedLeadId ? { ...l, outreachStatus: 'converted' } : l)));
          if (selectedLead?._id === exportedLeadId) setSelectedLead((prev) => ({ ...prev, outreachStatus: 'converted' }));
          loadLists(false);
          loadLeads(selectedList, page, debouncedSearch, { profileType: profileTypeFilter, outreachStatus: outreachStatusFilter, owner: ownerFilter });
        }}
      />
      <AddToSequenceModal
        isOpen={showAddToSequence}
        onClose={() => { setShowAddToSequence(false); setSequenceTarget(null); }}
        onEnrolled={({ leadIds: enrolledIds }) => {
          setLeads((prev) => prev.map((l) => (enrolledIds.includes(l._id) ? { ...l, outreachStatus: 'in_sequence' } : l)));
          if (selectedLead && enrolledIds.includes(selectedLead._id)) {
            setSelectedLead((prev) => ({ ...prev, outreachStatus: 'in_sequence' }));
          }
        }}
        leadIds={sequenceTarget ? [sequenceTarget._id] : []}
        leadNames={sequenceTarget ? [sequenceTarget.name] : []}
      />
      <EditContactModal
        lead={editContactTarget}
        isOpen={showEditContact}
        onClose={() => { setShowEditContact(false); setEditContactTarget(null); }}
        onLeadUpdate={handleLeadUpdate}
      />
    </div>
  );
}
