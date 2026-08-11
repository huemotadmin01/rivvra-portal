import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useToast } from '../context/ToastContext';
import { Users, RefreshCw, Download, Trash2, UserCheck } from 'lucide-react';
import api from '../utils/api';
import { exportLeadsToCSV } from '../utils/csvExport';
import LeadDetailPanel from '../components/LeadDetailPanel';
import AddToListModal from '../components/AddToListModal';
import ExportToCRMModal from '../components/ExportToCRMModal';
import AddToSequenceModal from '../components/AddToSequenceModal';
import EditContactModal from '../components/EditContactModal';
import AssignOwnerModal from '../components/AssignOwnerModal';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { Button, BulkActionBar, Pagination } from '../components/ds';
import { PageHeaderV2 } from '../components/platform/v2/listkit';
import {
  LeadsFilterStrip, LeadsTableV2, LeadsEmptyState,
  useSetupStatus, useLeadPanelSync, sequenceEmailGuardOk,
} from '../components/outreach/v2/leadskit';

/* v2 Team Contacts (Slice 3 Wave C) — same data flow as
   TeamContactsPage.jsx (api.getTeamLeads, totalCount key, owner filter
   keyed on m.id, AssignOwnerModal, bulk assign + delete). */
export default function TeamContactsPageV2() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasAppAccess } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { orgPath } = usePlatform();

  const [leads, setLeads] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [profileTypeFilter, setProfileTypeFilter] = useState('all');
  const [outreachStatusFilter, setOutreachStatusFilter] = useState(searchParams.get('status') || 'all');
  const [ownerFilter, setOwnerFilter] = useState(searchParams.get('owner') || 'all');

  const [selectedLeads, setSelectedLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showAddToList, setShowAddToList] = useState(false);
  const [addToListTarget, setAddToListTarget] = useState(null);
  const [showExportCRM, setShowExportCRM] = useState(false);
  const [exportCRMTarget, setExportCRMTarget] = useState(null);
  const [showAddToSequence, setShowAddToSequence] = useState(false);
  const [sequenceTarget, setSequenceTarget] = useState(null);
  const [showEditContact, setShowEditContact] = useState(false);
  const [editContactTarget, setEditContactTarget] = useState(null);
  const [showAssignOwner, setShowAssignOwner] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);

  const setupComplete = useSetupStatus();
  const canExportCrm = hasAppAccess('crm') || user?.plan === 'pro' || user?.plan === 'premium';
  const leadsPerPage = 50;

  // ?status= / ?owner= deep-links: adopt once then clear (legacy contract).
  useEffect(() => {
    const statusParam = searchParams.get('status');
    const ownerParam = searchParams.get('owner');
    if ((statusParam && statusParam !== 'all') || (ownerParam && ownerParam !== 'all')) {
      if (statusParam) setOutreachStatusFilter(statusParam);
      if (ownerParam) setOwnerFilter(ownerParam);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchQuery); setCurrentPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadLeads = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true); else setLoading(true);
    try {
      const response = await api.getTeamLeads({
        page: currentPage,
        limit: leadsPerPage,
        search: debouncedSearch || undefined,
        owner: ownerFilter !== 'all' ? ownerFilter : undefined,
        profileType: profileTypeFilter,
        outreachStatus: outreachStatusFilter,
      });
      if (response.success) {
        setLeads(response.leads || []);
        setTotalCount(response.totalCount || 0);
        setTotalPages(response.totalPages || 1);
        if (Array.isArray(response.teamMembers)) setTeamMembers(response.teamMembers);
      }
    } catch (err) {
      console.error('Failed to load team leads:', err);
      setLeads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, debouncedSearch, ownerFilter, profileTypeFilter, outreachStatusFilter]);

  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { setSelectedLeads([]); }, [currentPage, debouncedSearch, ownerFilter, profileTypeFilter, outreachStatusFilter]);

  const { openLead, closePanel } = useLeadPanelSync({
    leadId, leads, selectedLead, setSelectedLead, navigate, orgPath,
    seg: 'team-contacts', keepQs: true, searchParams,
  });

  // ownerName is not on the server response — preserve it from prior state
  // (legacy behaviour).
  const handleLeadUpdate = (updated) => {
    setLeads((prev) => prev.map((l) => (l._id === updated._id ? { ...l, ...updated, ownerName: updated.ownerName || l.ownerName } : l)));
    setSelectedLead((prev) => (prev && prev._id === updated._id ? { ...prev, ...updated, ownerName: updated.ownerName || prev.ownerName } : prev));
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      if (deleteTarget) {
        await api.deleteLead(deleteTarget._id);
        setLeads((prev) => prev.filter((l) => l._id !== deleteTarget._id));
        setTotalCount((prev) => prev - 1);
        if (selectedLead?._id === deleteTarget._id) closePanel();
      } else {
        await Promise.all(selectedLeads.map((id) => api.deleteLead(id)));
        setLeads((prev) => prev.filter((l) => !selectedLeads.includes(l._id)));
        setTotalCount((prev) => prev - selectedLeads.length);
        if (selectedLead && selectedLeads.includes(selectedLead._id)) closePanel();
        setSelectedLeads([]);
      }
      showToast('Deleted', 'success');
    } catch (err) {
      console.error('Delete failed:', err);
      showToast(err?.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const handleAssignOwner = async (newOwnerId) => {
    try {
      if (assignTarget) {
        const res = await api.assignLeadOwner(assignTarget._id, newOwnerId);
        if (res.success) {
          setLeads((prev) => prev.map((l) => (l._id === assignTarget._id ? { ...l, ...res.lead } : l)));
          if (selectedLead?._id === assignTarget._id) setSelectedLead((prev) => ({ ...prev, ...res.lead }));
          showToast('Contact reassigned successfully', 'success');
        }
      } else if (selectedLeads.length > 0) {
        await Promise.all(selectedLeads.map((id) => api.assignLeadOwner(id, newOwnerId)));
        loadLeads(); // refresh to get correct owner names (legacy behaviour)
        setSelectedLeads([]);
        showToast('Contacts reassigned successfully', 'success');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to reassign', 'error');
    } finally {
      setShowAssignOwner(false);
      setAssignTarget(null);
    }
  };

  const handleArchive = async (lead, archived) => {
    try {
      if (archived) await api.archiveLead(lead._id); else await api.unarchiveLead(lead._id);
      setLeads((prev) => prev.map((l) => (l._id === lead._id ? { ...l, archived } : l)));
      if (selectedLead?._id === lead._id) setSelectedLead((prev) => ({ ...prev, archived }));
      showToast(archived ? 'Lead archived' : 'Lead unarchived', 'success');
    } catch (err) {
      showToast(err?.message || `Failed to ${archived ? 'archive' : 'unarchive'} lead`, 'error');
    }
  };

  const manageProps = (lead) => ({
    onExportCRM: () => {
      if (!canExportCrm) return; // legacy TeamContacts silently no-ops
      setExportCRMTarget(lead); setShowExportCRM(true);
    },
    onAddToSequence: () => {
      if (setupComplete === false) { showToast('Connect your email in Settings before adding to a sequence', 'error'); return; }
      if (!sequenceEmailGuardOk(lead)) { showToast('This contact has no valid email address', 'error'); return; }
      setSequenceTarget(lead); setShowAddToSequence(true);
    },
    onAddToList: () => { setAddToListTarget(lead); setShowAddToList(true); },
    onEditContact: () => { setEditContactTarget(lead); setShowEditContact(true); },
    onTagContact: () => {},
    onRemoveContact: () => { setDeleteTarget(lead); setShowDeleteModal(true); },
    onAssignOwner: () => { setAssignTarget(lead); setShowAssignOwner(true); },
    onArchive: !lead.archived ? () => handleArchive(lead, true) : undefined,
    onUnarchive: lead.archived ? () => handleArchive(lead, false) : undefined,
    removeLabel: 'Delete contact',
  });

  const handleExportCSV = () => {
    const rows = selectedLeads.length
      ? leads.filter((l) => selectedLeads.includes(l._id))
      : leads;
    exportLeadsToCSV(rows, 'team-contacts', { includeOwner: true });
  };

  const filtered = debouncedSearch || profileTypeFilter !== 'all' || outreachStatusFilter !== 'all' || ownerFilter !== 'all';

  return (
    <div style={{ marginRight: selectedLead ? 420 : 0, transition: 'margin-right var(--d-3) var(--e-out)' }}>
      <PageHeaderV2
        title="Team Contacts"
        sub={`${totalCount} ${totalCount === 1 ? 'contact' : 'contacts'} across the team`}
        actions={(
          <>
            <Button variant="secondary" size="sm" disabled={refreshing} iconLeft={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} onClick={() => loadLeads(true)}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<Download size={14} />} onClick={handleExportCSV} disabled={leads.length === 0}>
              Export CSV
            </Button>
          </>
        )}
      />

      <LeadsFilterStrip
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search team contacts…"
        profileTypeFilter={profileTypeFilter}
        onProfileTypeChange={(v) => { setProfileTypeFilter(v); setCurrentPage(1); }}
        outreachStatusFilter={outreachStatusFilter}
        onStatusChange={(v) => { setOutreachStatusFilter(v); setCurrentPage(1); }}
        ownerFilter={ownerFilter}
        onOwnerChange={(v) => { setOwnerFilter(v); setCurrentPage(1); }}
        ownerOptions={teamMembers.map((m) => ({ value: m.id, label: m.name || m.email || m.id }))}
        resultCount={totalCount}
        noun="contact"
      />

      <LeadsTableV2
        leads={leads}
        loading={loading}
        selectedLeads={selectedLeads}
        onSelectionChange={setSelectedLeads}
        showOwnerCol
        onOpenLead={openLead}
        manageProps={manageProps}
        empty={(
          <LeadsEmptyState
            icon={<Users size={22} />}
            title={filtered ? 'No results found' : 'No team contacts yet'}
          >
            {filtered
              ? 'Try adjusting your search or filters.'
              : 'Contacts saved by your team will appear here.'}
          </LeadsEmptyState>
        )}
      />
      {totalCount > 0 && (
        <Pagination page={currentPage} pageSize={leadsPerPage} total={totalCount} onPageChange={setCurrentPage} noun="contact" />
      )}

      <BulkActionBar
        count={selectedLeads.length}
        noun="contact"
        onClear={() => setSelectedLeads([])}
        actions={[
          { label: 'Assign owner', icon: <UserCheck size={13} />, onClick: () => { setAssignTarget(null); setShowAssignOwner(true); } },
          { label: 'Export CSV', icon: <Download size={13} />, onClick: handleExportCSV },
          { label: 'Delete', tone: 'danger', icon: <Trash2 size={13} />, onClick: () => { setDeleteTarget(null); setShowDeleteModal(true); } },
        ]}
      />

      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={closePanel}
          onUpdate={handleLeadUpdate}
          teamMode
          teamMembers={teamMembers}
          onAssign={(lead) => { setAssignTarget(lead); setShowAssignOwner(true); }}
        />
      )}

      <ConfirmDialog
        open={showDeleteModal}
        title={deleteTarget ? 'Delete contact?' : `Delete ${selectedLeads.length} contacts?`}
        message={deleteTarget
          ? `"${deleteTarget.name || 'This contact'}" will be permanently deleted. This cannot be undone.`
          : `${selectedLeads.length} contacts will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onCancel={() => { if (!deleting) { setShowDeleteModal(false); setDeleteTarget(null); } }}
        onConfirm={confirmDelete}
      />

      <AddToListModal
        isOpen={showAddToList}
        onClose={() => { setShowAddToList(false); setAddToListTarget(null); }}
        lead={addToListTarget}
        onLeadUpdate={handleLeadUpdate}
      />
      <ExportToCRMModal
        isOpen={showExportCRM}
        onClose={() => { setShowExportCRM(false); setExportCRMTarget(null); }}
        lead={exportCRMTarget}
        onSuccess={(exportedLeadId) => {
          setLeads((prev) => prev.map((l) => (l._id === exportedLeadId ? { ...l, outreachStatus: 'converted' } : l)));
          if (selectedLead?._id === exportedLeadId) setSelectedLead((prev) => ({ ...prev, outreachStatus: 'converted' }));
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
      <AssignOwnerModal
        isOpen={showAssignOwner}
        onClose={() => { setShowAssignOwner(false); setAssignTarget(null); }}
        teamMembers={teamMembers}
        selectedCount={assignTarget ? 1 : selectedLeads.length}
        onConfirm={handleAssignOwner}
      />
    </div>
  );
}
