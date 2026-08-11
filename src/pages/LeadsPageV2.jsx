import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useToast } from '../context/ToastContext';
import { Users, Plus, RefreshCw, Download, Trash2, Upload, AlertTriangle } from 'lucide-react';
import api from '../utils/api';
import { exportLeadsToCSV } from '../utils/csvExport';
import LeadDetailPanel from '../components/LeadDetailPanel';
import ComingSoonModal from '../components/ComingSoonModal';
import AddToListModal from '../components/AddToListModal';
import ExportToCRMModal from '../components/ExportToCRMModal';
import AddToSequenceModal from '../components/AddToSequenceModal';
import EditContactModal from '../components/EditContactModal';
import CreateContactModal from '../components/CreateContactModal';
import BulkImportModal from '../components/BulkImportModal';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { Button, BulkActionBar } from '../components/ds';
import { PageHeaderV2 } from '../components/platform/v2/listkit';
import { Pagination } from '../components/ds';
import {
  LeadsFilterStrip, LeadsTableV2, LeadsEmptyState,
  useSetupStatus, useLeadPanelSync, sequenceEmailGuardOk,
} from '../components/outreach/v2/leadskit';

const LEAD_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'full name', 'contact', 'contact name'] },
  { key: 'company', label: 'Company', required: true, aliases: ['company', 'company name', 'organization', 'employer'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'e-mail', 'email address', 'mail'] },
  { key: 'title', label: 'Title', required: false, aliases: ['title', 'job title', 'headline', 'designation', 'role', 'position'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['phone', 'phone number', 'mobile', 'tel'] },
  { key: 'location', label: 'Location', required: false, aliases: ['location', 'city', 'region', 'country'] },
  { key: 'linkedinUrl', label: 'LinkedIn URL', required: false, aliases: ['linkedin', 'linkedin url', 'linkedin profile', 'profile'] },
  { key: 'profileType', label: 'Type (candidate/client)', required: false, aliases: ['type', 'profile type', 'profiletype'] },
];

/* v2 Saved Contacts (Slice 3 Wave C) — same data flow as LeadsPage.jsx on
   the shared leadskit composition. Delete here is api.deleteLead
   (irreversible), unlike the list pages' remove-from-list. */
export default function LeadsPageV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const { user } = useAuth();
  const { hasAppAccess } = useOrg();
  const { showToast } = useToast();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [profileTypeFilter, setProfileTypeFilter] = useState('all');
  const [outreachStatusFilter, setOutreachStatusFilter] = useState(searchParams.get('status') || 'all');

  const [selectedLeads, setSelectedLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
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
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const setupComplete = useSetupStatus();
  const canExportCrm = hasAppAccess('crm') || user?.plan === 'pro' || user?.plan === 'premium';
  const leadsPerPage = 50;

  // ?status= deep-link: adopt once, then clear the param (legacy contract).
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && statusParam !== 'all') {
      setOutreachStatusFilter(statusParam);
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
      const response = await api.getLeads({
        page: currentPage,
        limit: leadsPerPage,
        search: debouncedSearch || undefined,
        profileType: profileTypeFilter,
        outreachStatus: outreachStatusFilter,
      });
      if (response.success) {
        setLeads(response.leads || []);
        setTotalCount(response.total || 0);
        setTotalPages(response.totalPages || 1);
        setLoadError(null);
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
      setLoadError(err?.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, debouncedSearch, profileTypeFilter, outreachStatusFilter]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Extension sync — event-driven (storage/focus/custom event, no polling).
  useEffect(() => {
    const refresh = () => loadLeads(true);
    const onStorage = (e) => { if (e.key === 'rivvra_lead_saved') refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener('rivvra_lead_saved', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('rivvra_lead_saved', refresh);
    };
  }, [loadLeads]);

  useEffect(() => { setSelectedLeads([]); }, [currentPage, debouncedSearch, profileTypeFilter, outreachStatusFilter]);

  const { openLead, closePanel } = useLeadPanelSync({
    leadId, leads, selectedLead, setSelectedLead, navigate, orgPath,
    seg: 'leads', keepQs: false, searchParams,
  });

  const handleLeadUpdate = (updated) => {
    setLeads((prev) => prev.map((l) => (l._id === updated._id ? { ...l, ...updated } : l)));
    setSelectedLead((prev) => (prev && prev._id === updated._id ? { ...prev, ...updated } : prev));
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
    onRemoveContact: () => { setDeleteTarget(lead); setShowDeleteModal(true); },
    onArchive: !lead.archived ? () => handleArchive(lead, true) : undefined,
    onUnarchive: lead.archived ? () => handleArchive(lead, false) : undefined,
    removeLabel: 'Delete contact',
  });

  const handleExportCSV = () => {
    const rows = selectedLeads.length
      ? leads.filter((l) => selectedLeads.includes(l._id))
      : leads;
    exportLeadsToCSV(rows, 'rivvra-contacts');
  };

  return (
    <div style={{ marginRight: selectedLead ? 420 : 0, transition: 'margin-right var(--d-3) var(--e-out)' }}>
      <PageHeaderV2
        title="Saved Contacts"
        sub={`${totalCount} ${totalCount === 1 ? 'contact' : 'contacts'} saved`}
        actions={(
          <>
            <Button variant="secondary" size="sm" disabled={refreshing} iconLeft={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} onClick={() => loadLeads(true)}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<Download size={14} />} onClick={handleExportCSV} disabled={leads.length === 0}>
              Export CSV
            </Button>
            <Button variant="secondary" size="sm" iconLeft={<Upload size={14} />} onClick={() => setShowImport(true)}>Import</Button>
            <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setShowCreateContact(true)}>New Contact</Button>
          </>
        )}
      />

      <LeadsFilterStrip
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name, company, title…"
        profileTypeFilter={profileTypeFilter}
        onProfileTypeChange={(v) => { setProfileTypeFilter(v); setCurrentPage(1); }}
        outreachStatusFilter={outreachStatusFilter}
        onStatusChange={(v) => { setOutreachStatusFilter(v); setCurrentPage(1); }}
        resultCount={totalCount}
        noun="contact"
      />

      {loadError && !loading && leads.length === 0 ? (
        <LeadsEmptyState
          icon={<AlertTriangle size={22} />}
          title="Couldn't load your contacts"
          actions={<Button variant="secondary" size="sm" onClick={() => loadLeads()}>Retry</Button>}
        >
          {loadError}
        </LeadsEmptyState>
      ) : (
        <>
          <LeadsTableV2
            leads={leads}
            loading={loading}
            selectedLeads={selectedLeads}
            onSelectionChange={setSelectedLeads}
            onOpenLead={openLead}
            manageProps={manageProps}
            empty={(
              <LeadsEmptyState
                icon={<Users size={22} />}
                title={debouncedSearch || profileTypeFilter !== 'all' || outreachStatusFilter !== 'all' ? 'No results found' : 'No saved contacts yet'}
              >
                {debouncedSearch || profileTypeFilter !== 'all' || outreachStatusFilter !== 'all'
                  ? 'Try adjusting your search or filters.'
                  : 'Save contacts with the Chrome extension, import a CSV, or create one manually.'}
              </LeadsEmptyState>
            )}
          />
          {totalCount > 0 && (
            <Pagination page={currentPage} pageSize={leadsPerPage} total={totalCount} onPageChange={setCurrentPage} noun="contact" />
          )}
        </>
      )}

      <BulkActionBar
        count={selectedLeads.length}
        noun="contact"
        onClear={() => setSelectedLeads([])}
        actions={[
          { label: 'Export CSV', icon: <Download size={13} />, onClick: handleExportCSV },
          { label: 'Delete', tone: 'danger', icon: <Trash2 size={13} />, onClick: () => { setDeleteTarget(null); setShowDeleteModal(true); } },
        ]}
      />

      {selectedLead && (
        <LeadDetailPanel lead={selectedLead} onClose={closePanel} onUpdate={handleLeadUpdate} />
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

      <ComingSoonModal isOpen={showComingSoon} onClose={() => setShowComingSoon(false)} feature={comingSoonFeature} />
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
          loadLeads(true);
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
      <CreateContactModal
        isOpen={showCreateContact}
        onClose={() => setShowCreateContact(false)}
        onCreated={(newLead) => {
          setLeads((prev) => [newLead, ...prev]);
          setTotalCount((prev) => prev + 1);
        }}
      />
      {showImport && (
        <BulkImportModal
          open={showImport}
          onClose={() => setShowImport(false)}
          title="Import Contacts"
          itemNoun="contact"
          templateName="leads-import-template.csv"
          fields={LEAD_IMPORT_FIELDS}
          onImport={(rows) => api.bulkImportLeads(rows)}
          onDone={() => loadLeads(true)}
        />
      )}
    </div>
  );
}
