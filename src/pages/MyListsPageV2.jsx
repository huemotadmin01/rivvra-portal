import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useToast } from '../context/ToastContext';
import { Users, RefreshCw, Download, Trash2, Plus, FolderOpen } from 'lucide-react';
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

/* v2 My Lists (Slice 3 Wave C) — same data flow as MyListsPage.jsx:
   custom lists rail (create/delete), api.getListLeads per list, bulk
   REMOVE-from-list (contact survives — deliberately not delete). The
   legacy 2s extension-sync poll is dropped; storage/focus/custom-event
   sync stays. */
export default function MyListsPageV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const { user } = useAuth();
  const { hasAppAccess } = useOrg();
  const { showToast } = useToast();

  const [lists, setLists] = useState([]);
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

  const [selectedLeads, setSelectedLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [deleteListTarget, setDeleteListTarget] = useState(null);
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

  const loadLeads = useCallback(async (listName, pageNum = 1, search = '', filters = {}) => {
    if (!listName) return;
    try {
      setLeadsLoading(true);
      const res = await api.getListLeads(listName, {
        page: pageNum,
        limit: leadsPerPage,
        search: search || undefined,
        profileType: filters.profileType,
        outreachStatus: filters.outreachStatus,
      });
      if (res.success) {
        setLeads(res.leads || []);
        setTotalPages(res.totalPages || 1);
        setTotalLeads(res.total || 0);
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  const loadLists = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    try {
      const res = await api.getLists();
      if (res.success) {
        // Default lists live on the Team Lists page.
        const customLists = (res.lists || []).filter((l) => !l.isDefault);
        setLists(customLists);
        if (!selectedList && customLists.length > 0) setSelectedList(customLists[0].name);
      }
    } catch (err) {
      console.error('Failed to load lists:', err);
      setLists([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedList]);

  useEffect(() => { loadLists(); }, [loadLists]);

  useEffect(() => {
    if (!selectedList) return;
    setSelectedLeads([]);
    loadLeads(selectedList, page, debouncedSearch, {
      profileType: profileTypeFilter,
      outreachStatus: outreachStatusFilter,
    });
  }, [selectedList, page, debouncedSearch, profileTypeFilter, outreachStatusFilter, loadLeads]);

  // Extension sync — event-driven (legacy also polled every 2s; dropped).
  useEffect(() => {
    const refresh = () => { loadLists(true); if (selectedList) loadLeads(selectedList, page, debouncedSearch, { profileType: profileTypeFilter, outreachStatus: outreachStatusFilter }); };
    const onStorage = (e) => { if (e.key === 'rivvra_lead_saved') refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('rivvra_lead_saved', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('rivvra_lead_saved', refresh);
    };
  }, [loadLists, loadLeads, selectedList, page, debouncedSearch, profileTypeFilter, outreachStatusFilter]);

  const selectList = (list) => {
    setSelectedList(list.name);
    setPage(1);
    setSearchParams({ list: list.name });
  };

  const { openLead, closePanel } = useLeadPanelSync({
    leadId, leads, selectedLead, setSelectedLead, navigate, orgPath,
    seg: 'lists', keepQs: true, searchParams,
  });

  const handleLeadUpdate = (updated) => {
    setLeads((prev) => prev.map((l) => (l._id === updated._id ? { ...l, ...updated } : l)));
    setSelectedLead((prev) => (prev && prev._id === updated._id ? { ...prev, ...updated } : prev));
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name) return;
    setCreatingList(true);
    try {
      const res = await api.createList(name);
      if (res.success) {
        setNewListName('');
        setShowCreateModal(false);
        await loadLists(true);
        setSelectedList(name);
        setSearchParams({ list: name });
        showToast('List created', 'success');
      } else {
        showToast(res.error || 'Failed to create list', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to create list', 'error');
    } finally {
      setCreatingList(false);
    }
  };

  const handleDeleteList = async () => {
    const listName = deleteListTarget;
    if (!listName) return;
    try {
      const res = await api.deleteList(listName);
      if (res.success !== false) {
        const remaining = lists.filter((l) => l.name !== listName);
        setLists(remaining);
        if (selectedList === listName) {
          const next = remaining[0]?.name || null;
          setSelectedList(next);
          setSearchParams(next ? { list: next } : {});
        }
        showToast('List deleted', 'success');
      } else {
        showToast(res.error || 'Failed to delete list', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to delete list', 'error');
    } finally {
      setDeleteListTarget(null);
    }
  };

  // Remove-from-list — the contact record survives (NOT deleteLead).
  const confirmRemove = async () => {
    setRemoving(true);
    try {
      if (removeTarget) {
        await api.removeLeadFromList(removeTarget._id, selectedList);
        setLeads((prev) => prev.filter((l) => l._id !== removeTarget._id));
        setTotalLeads((prev) => prev - 1);
        setLists((prev) => prev.map((l) => (l.name === selectedList ? { ...l, count: Math.max(0, (l.count || 1) - 1) } : l)));
        if (selectedLead?._id === removeTarget._id) closePanel();
      } else {
        await Promise.all(selectedLeads.map((id) => api.removeLeadFromList(id, selectedList)));
        setLeads((prev) => prev.filter((l) => !selectedLeads.includes(l._id)));
        setTotalLeads((prev) => prev - selectedLeads.length);
        setLists((prev) => prev.map((l) => (l.name === selectedList ? { ...l, count: Math.max(0, (l.count || selectedLeads.length) - selectedLeads.length) } : l)));
        if (selectedLead && selectedLeads.includes(selectedLead._id)) closePanel();
        setSelectedLeads([]);
      }
      showToast('Removed from list', 'success');
    } catch (err) {
      console.error('Remove failed:', err);
      showToast(err?.message || 'Failed to remove from list', 'error');
    } finally {
      setRemoving(false);
      setShowRemoveModal(false);
      setRemoveTarget(null);
    }
  };

  const manageProps = (lead) => ({
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
  });

  const handleExportCSV = async () => {
    let rows;
    if (selectedLeads.length) {
      rows = leads.filter((l) => selectedLeads.includes(l._id));
    } else {
      const res = await api.getLeads({ listName: selectedList, limit: 1000 }).catch(() => null);
      rows = res?.success ? (res.leads || []) : leads;
    }
    exportLeadsToCSV(rows, `rivvra-${(selectedList || 'list').toLowerCase().replace(/\s+/g, '-')}`);
  };

  const filtered = debouncedSearch || profileTypeFilter !== 'all' || outreachStatusFilter !== 'all';

  return (
    <div style={{ marginRight: selectedLead ? 420 : 0, transition: 'margin-right var(--d-3) var(--e-out)' }}>
      <PageHeaderV2
        title={selectedList || 'My Lists'}
        sub={selectedList ? `${totalLeads} ${totalLeads === 1 ? 'contact' : 'contacts'} in this list` : 'Select a list to view contacts'}
        actions={(
          <>
            <Button variant="secondary" size="sm" disabled={refreshing} iconLeft={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} onClick={() => { loadLists(true); if (selectedList) loadLeads(selectedList, page, debouncedSearch, { profileType: profileTypeFilter, outreachStatus: outreachStatusFilter }); }}>
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
          title="My Lists"
          lists={lists}
          selected={selectedList}
          onSelect={selectList}
          headerAction={(
            <button type="button" onClick={() => setShowCreateModal(true)} title="Create list"
              style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 'var(--r-1)', color: 'var(--fg-3)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <Plus size={13} />
            </button>
          )}
          itemAction={(list) => (
            <button type="button" title="Delete list"
              onClick={(e) => { e.stopPropagation(); setDeleteListTarget(list.name); }}
              style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 'var(--r-1)', color: 'var(--fg-faint)', flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-faint)'; }}>
              <Trash2 size={11} />
            </button>
          )}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {!loading && lists.length === 0 ? (
            <LeadsEmptyState
              icon={<FolderOpen size={22} />}
              title="No lists yet"
              actions={<Button size="sm" iconLeft={<Plus size={13} />} onClick={() => setShowCreateModal(true)}>Create your first list</Button>}
            >
              Create a list to organize your saved contacts.
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
                resultCount={totalLeads}
                noun="contact"
              />
              <LeadsTableV2
                leads={leads}
                loading={loading || leadsLoading}
                selectedLeads={selectedLeads}
                onSelectionChange={setSelectedLeads}
                onOpenLead={openLead}
                manageProps={manageProps}
                empty={(
                  <LeadsEmptyState
                    icon={<Users size={22} />}
                    title={filtered ? 'No results found' : 'No contacts in this list'}
                  >
                    {filtered
                      ? 'Try adjusting your search or filters.'
                      : 'Use the Chrome extension or Add to List to fill it.'}
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

      <BulkActionBar
        count={selectedLeads.length}
        noun="contact"
        onClear={() => setSelectedLeads([])}
        actions={[
          { label: 'Export CSV', icon: <Download size={13} />, onClick: handleExportCSV },
          { label: 'Remove from list', tone: 'danger', icon: <Trash2 size={13} />, onClick: () => { setRemoveTarget(null); setShowRemoveModal(true); } },
        ]}
      />

      {selectedLead && (
        <LeadDetailPanel lead={selectedLead} onClose={closePanel} onUpdate={handleLeadUpdate} />
      )}

      <ConfirmDialog
        open={showRemoveModal}
        title={removeTarget ? 'Remove from list?' : `Remove ${selectedLeads.length} contacts from list?`}
        message={`${removeTarget ? `"${removeTarget.name || 'This contact'}"` : `${selectedLeads.length} contacts`} will be removed from "${selectedList}". The contact record itself is kept.`}
        confirmLabel="Remove"
        danger
        busy={removing}
        onCancel={() => { if (!removing) { setShowRemoveModal(false); setRemoveTarget(null); } }}
        onConfirm={confirmRemove}
      />

      <ConfirmDialog
        open={!!deleteListTarget}
        title={`Delete list "${deleteListTarget}"?`}
        message="This will not delete the contacts — only the list."
        confirmLabel="Delete list"
        danger
        onCancel={() => setDeleteListTarget(null)}
        onConfirm={handleDeleteList}
      />

      <Modal open={showCreateModal} onClose={() => { if (!creatingList) setShowCreateModal(false); }} title="Create list" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="List name…"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateList(); }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => setShowCreateModal(false)} disabled={creatingList}>Cancel</Button>
            <Button size="sm" onClick={handleCreateList} disabled={creatingList || !newListName.trim()}>
              {creatingList ? 'Creating…' : 'Create'}
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
          loadLeads(selectedList, page, debouncedSearch, { profileType: profileTypeFilter, outreachStatus: outreachStatusFilter });
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
