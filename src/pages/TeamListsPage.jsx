import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Users, ChevronRight, ChevronLeft, Linkedin,
  Search, List, FolderOpen, Layers,
  Building2, MapPin, RefreshCw,
  ArrowUpDown, StickyNote, Filter, Download, Lock,
  Edit3, Check, X, Loader2
} from 'lucide-react';

import LeadDetailPanel from '../components/LeadDetailPanel';
import ManageDropdown from '../components/ManageDropdown';
import api from '../utils/api';
import { exportLeadsToCSV } from '../utils/csvExport';
import ComingSoonModal from '../components/ComingSoonModal';
import AddToListModal from '../components/AddToListModal';
import ExportToCRMModal from '../components/ExportToCRMModal';
import AddToSequenceModal from '../components/AddToSequenceModal';
import EditContactModal from '../components/EditContactModal';
import { useToast } from '../context/ToastContext';

function TeamListsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const canEdit = user?.role === 'admin' || user?.role === 'team_lead';
  const [lists, setLists] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedList, setSelectedList] = useState(searchParams.get('list') || null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [selectedLeads, setSelectedLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
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
  const [showFilters, setShowFilters] = useState(false);
  const [setupComplete, setSetupComplete] = useState(null);
  const [profileTypeFilter, setProfileTypeFilter] = useState('all');
  const [outreachStatusFilter, setOutreachStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [renamingList, setRenamingList] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const filterRef = useRef(null);
  const filterDropdownRef = useRef(null);

  const isPro = user?.plan === 'pro' || user?.plan === 'premium';
  const leadsPerPage = 10;

  const loadLeads = useCallback(async (listName, pageNum = 1) => {
    if (!listName) return;
    try {
      setLeadsLoading(true);
      const res = await api.getTeamListLeads(listName, pageNum, leadsPerPage);
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

  const loadLists = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    try {
      const res = await api.getTeamLists();
      if (res.success) {
        setLists(res.lists || []);
        setTeamMembers(res.teamMembers || []);
        if (!selectedList && res.lists?.length > 0) {
          setSelectedList(res.lists[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to load team lists:', err);
      setLists([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedList]);

  useEffect(() => {
    if (isAuthenticated) {
      loadLists();
      api.getSetupStatus().then(res => {
        setSetupComplete(res.success ? res.allComplete : false);
      }).catch(() => setSetupComplete(false));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedList) {
      loadLeads(selectedList, page);
      setSearchParams({ list: selectedList });
      setSelectedLeads([]);
      setSelectedLead(null);
    } else {
      setLeads([]);
      setSearchParams({});
    }
  }, [selectedList, page, loadLeads, setSearchParams]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const inButton = filterRef.current && filterRef.current.contains(event.target);
      const inDropdown = filterDropdownRef.current && filterDropdownRef.current.contains(event.target);
      if (!inButton && !inDropdown) {
        setShowFilters(false);
      }
    };
    if (showFilters) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => { document.removeEventListener('mousedown', handleClickOutside); };
  }, [showFilters]);

  const handleManualRefresh = () => {
    loadLists(true);
    if (selectedList) {
      loadLeads(selectedList, page);
    }
  };

  const handleRenameList = async () => {
    if (!renamingList || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const res = await api.renameDefaultList(renamingList.id, renameValue.trim());
      if (res.success) {
        setLists(prev => prev.map(l =>
          l._id === renamingList.id ? { ...l, name: renameValue.trim() } : l
        ));
        if (selectedList === renamingList.name) {
          setSelectedList(renameValue.trim());
        }
        showToast('List renamed successfully');
      }
    } catch (err) {
      showToast(err.message || 'Failed to rename list', 'error');
    } finally {
      setRenaming(false);
      setRenamingList(null);
      setRenameValue('');
    }
  };

  const handleFeatureClick = (feature) => {
    if (!isPro) {
      setComingSoonFeature(feature);
      setShowComingSoon(true);
    }
  };

  const handleRowClick = (lead) => {
    setSelectedLead(lead);
  };

  const handleLeadUpdate = (updatedLead) => {
    setLeads(leads.map(l => l._id === updatedLead._id ? updatedLead : l));
    setSelectedLead(updatedLead);
  };

  const handleRemoveFromList = (lead) => {
    setDeleteTarget(lead);
    setShowDeleteModal(true);
  };

  const confirmRemoveFromList = async () => {
    if (!selectedList || !deleteTarget) return;
    setDeleting(true);
    try {
      await api.removeLeadFromList(deleteTarget._id, selectedList);
      setLeads(leads.filter(l => l._id !== deleteTarget._id));
      setTotalLeads(prev => prev - 1);
      if (selectedLead?._id === deleteTarget._id) setSelectedLead(null);
      setLists(lists.map(l =>
        l.name === selectedList ? { ...l, count: Math.max(0, (l.count || 0) - 1) } : l
      ));
      showToast(`Removed from "${selectedList}"`);
    } catch (err) {
      console.error('Failed to remove from list:', err);
      showToast('Failed to remove contact', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const toggleSelectAll = (e) => {
    e.stopPropagation();
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map(l => l._id));
    }
  };

  const toggleSelectLead = (e, id) => {
    e.stopPropagation();
    if (selectedLeads.includes(id)) {
      setSelectedLeads(selectedLeads.filter(i => i !== id));
    } else {
      setSelectedLeads([...selectedLeads, id]);
    }
  };

  const activeFilterCount = (profileTypeFilter !== 'all' ? 1 : 0) + (outreachStatusFilter !== 'all' ? 1 : 0) + (ownerFilter !== 'all' ? 1 : 0);

  const filteredLeads = leads.filter(lead => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery ||
      lead.name?.toLowerCase().includes(searchLower) ||
      lead.company?.toLowerCase().includes(searchLower) ||
      lead.email?.toLowerCase().includes(searchLower) ||
      lead.title?.toLowerCase().includes(searchLower);

    const matchesProfileType = profileTypeFilter === 'all' ||
      (profileTypeFilter === 'candidate' && lead.profileType === 'candidate') ||
      (profileTypeFilter === 'client' && lead.profileType === 'client');

    const leadStatus = lead.outreachStatus || 'not_contacted';
    const matchesOutreachStatus = outreachStatusFilter === 'all' || leadStatus === outreachStatusFilter;

    const matchesOwner = ownerFilter === 'all' || lead.userId === ownerFilter || lead.visitorId === ownerFilter;

    return matchesSearch && matchesProfileType && matchesOutreachStatus && matchesOwner;
  });

  return (
    <>
      <div className={`flex h-full transition-all duration-300 ${selectedLead ? 'mr-[420px]' : ''}`}>
        {/* Left Sidebar - Lists */}
        <div className="w-64 flex-shrink-0 border-r border-dark-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-rivvra-400" />
              <h2 className="text-lg font-semibold text-white">Team Lists</h2>
            </div>
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className={`p-1.5 rounded-lg text-dark-400 hover:text-rivvra-400 hover:bg-dark-700 transition-colors ${refreshing ? 'opacity-50' : ''}`}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="text-center py-4 text-dark-400">Loading...</div>
          ) : lists.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="w-10 h-10 text-dark-600 mx-auto mb-2" />
              <p className="text-dark-400 text-sm">No team lists found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {lists.map((list, idx) => (
                <div
                  key={idx}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    selectedList === list.name
                      ? 'bg-rivvra-500/20 text-rivvra-400'
                      : 'hover:bg-dark-700 text-dark-300'
                  }`}
                  onClick={() => { setSelectedList(list.name); setPage(1); }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <List className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-medium truncate max-w-[120px]">{list.name}</span>
                    {user?.role === 'admin' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingList({ id: list._id, name: list.name }); setRenameValue(list.name); }}
                        className="p-0.5 text-dark-500 hover:text-rivvra-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        title="Rename list"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    ) : (
                      <Lock className="w-3 h-3 text-dark-600 flex-shrink-0" title="Default list" />
                    )}
                  </div>
                  <span className="text-xs text-dark-500 flex-shrink-0">{list.count || 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main Content - Leads Table */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          {!selectedList ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FolderOpen className="w-16 h-16 text-dark-600 mx-auto mb-4" />
                <p className="text-dark-400 text-lg">Select a list to view contacts</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-white mb-1">{selectedList}</h1>
                  <p className="text-dark-400">
                    {totalLeads} contacts {selectedLeads.length > 0 && `• ${selectedLeads.length} selected`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleManualRefresh}
                    disabled={refreshing || leadsLoading}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 text-white hover:bg-dark-700 transition-colors ${(refreshing || leadsLoading) ? 'opacity-50' : ''}`}
                  >
                    <RefreshCw className={`w-4 h-4 ${(refreshing || leadsLoading) ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button
                    onClick={async () => {
                      let leadsToExport;
                      if (selectedLeads.length > 0) {
                        leadsToExport = filteredLeads.filter(l => selectedLeads.includes(l._id));
                      } else {
                        leadsToExport = filteredLeads;
                      }
                      if (leadsToExport.length > 0) {
                        const prefix = `rivvra-team-${(selectedList || 'list').replace(/\s+/g, '-').toLowerCase()}`;
                        exportLeadsToCSV(leadsToExport, prefix, { includeOwner: true });
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 text-white hover:bg-dark-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export{selectedLeads.length > 0 ? ` (${selectedLeads.length})` : ''}
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                  <input
                    type="text"
                    placeholder="Search contacts by name, company, or title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
                  />
                </div>
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-4 py-2.5 bg-dark-800 border rounded-xl transition-colors ${
                      activeFilterCount > 0
                        ? 'border-rivvra-500 text-rivvra-400'
                        : 'border-dark-700 text-dark-300 hover:text-white'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-rivvra-500 text-dark-950 rounded-full">{activeFilterCount}</span>
                    )}
                  </button>

                  {/* Filter Dropdown — fixed positioning to avoid overflow clipping */}
                  {showFilters && (() => {
                    const rect = filterRef.current?.getBoundingClientRect();
                    return (
                      <div
                        ref={filterDropdownRef}
                        className="fixed w-64 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-[9999]"
                        style={{
                          top: rect ? rect.bottom + 8 : 0,
                          right: rect ? window.innerWidth - rect.right : 0,
                        }}
                      >
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-white">Filters</span>
                            {activeFilterCount > 0 && (
                              <button
                                onClick={() => { setProfileTypeFilter('all'); setOutreachStatusFilter('all'); setOwnerFilter('all'); }}
                                className="text-xs text-rivvra-400 hover:text-rivvra-300"
                              >
                                Clear all
                              </button>
                            )}
                          </div>

                          {/* Owner Filter */}
                          <div className="mb-3">
                            <label className="block text-xs text-dark-400 mb-2">Contact Owner</label>
                            <select
                              value={ownerFilter}
                              onChange={(e) => setOwnerFilter(e.target.value)}
                              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500"
                            >
                              <option value="all">All Owners</option>
                              {teamMembers.map(m => (
                                <option key={m._id} value={m._id}>{m.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Profile Type Filter */}
                          <div className="mb-3">
                            <label className="block text-xs text-dark-400 mb-2">Profile Type</label>
                            <select
                              value={profileTypeFilter}
                              onChange={(e) => setProfileTypeFilter(e.target.value)}
                              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500"
                            >
                              <option value="all">All Types</option>
                              <option value="candidate">Candidate</option>
                              <option value="client">Client</option>
                            </select>
                          </div>

                          {/* Outreach Status Filter */}
                          <div className="mb-3">
                            <label className="block text-xs text-dark-400 mb-2">Outreach Status</label>
                            <select
                              value={outreachStatusFilter}
                              onChange={(e) => setOutreachStatusFilter(e.target.value)}
                              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500"
                            >
                              <option value="all">All Statuses</option>
                              <option value="not_contacted">Not Contacted</option>
                              <option value="in_sequence">In Sequence</option>
                              <option value="replied">Interested</option>
                              <option value="replied_not_interested">Not Interested</option>
                              <option value="no_response">No Response</option>
                              <option value="bounced">Bounced</option>
                            </select>
                          </div>

                          <button
                            onClick={() => setShowFilters(false)}
                            className="w-full py-2 px-4 bg-rivvra-500 text-dark-950 font-medium rounded-lg hover:bg-rivvra-400 transition-colors text-sm"
                          >
                            Apply Filters
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Table Container */}
              <div className="card flex-1 overflow-hidden flex flex-col">
                {leadsLoading ? (
                  <div className="p-12 text-center flex-1 flex items-center justify-center">
                    <div>
                      <div className="w-8 h-8 border-2 border-rivvra-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-dark-400">Loading contacts...</p>
                    </div>
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="p-12 text-center flex-1 flex items-center justify-center">
                    <div>
                      <Users className="w-16 h-16 text-dark-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">No Contacts in This List</h3>
                      <p className="text-dark-400">Contacts are automatically added to this list based on their outreach status.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Scrollable Table Wrapper */}
                    <div className="flex-1 overflow-auto relative">
                      <table className="w-full min-w-[1200px]">
                        <thead className="sticky top-0 z-20">
                          <tr className="border-b border-dark-700 bg-dark-800">
                            <th className="sticky left-0 z-30 bg-dark-800 px-4 py-3 text-left w-12">
                              <input
                                type="checkbox"
                                checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500"
                              />
                            </th>
                            <th className="sticky left-12 z-30 bg-dark-800 px-4 py-3 text-left w-[200px] min-w-[200px]">
                              <button className="flex items-center gap-1 text-sm font-medium text-dark-400 hover:text-white">
                                Contact <ArrowUpDown className="w-3 h-3" />
                              </button>
                            </th>
                            {canEdit && <th className="sticky left-[260px] z-30 bg-dark-800 px-4 py-3 text-left w-[110px] min-w-[110px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]"></th>}
                            <th className="px-4 py-3 text-left text-sm font-medium text-dark-400 min-w-[140px]">Contact Owner</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-dark-400 min-w-[120px]">Profile Type</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-dark-400 min-w-[150px]">Status</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-dark-400 min-w-[180px]">Company</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-dark-400 min-w-[150px]">Location</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-dark-400 min-w-[200px]">Email</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-dark-400 min-w-[80px]">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeads.map((lead) => (
                            <tr
                              key={lead._id}
                              onClick={() => handleRowClick(lead)}
                              className={`border-b border-dark-800 hover:bg-dark-800/50 transition-colors cursor-pointer ${
                                selectedLead?._id === lead._id ? 'bg-dark-800/70' : ''
                              }`}
                            >
                              <td className="sticky left-0 z-10 bg-dark-900 px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedLeads.includes(lead._id)}
                                  onChange={(e) => toggleSelectLead(e, lead._id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500"
                                />
                              </td>
                              <td className="sticky left-12 z-10 bg-dark-900 px-4 py-3 w-[200px] min-w-[200px]">
                                <div className="flex items-center gap-3">
                                  {lead.profilePicture ? (
                                    <img src={lead.profilePicture} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                                      <Users className="w-5 h-5 text-dark-500" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-medium text-white truncate">{lead.name || 'Unknown'}</p>
                                    <p className="text-xs text-dark-400 truncate">{lead.title || '-'}</p>
                                    {lead.linkedinUrl && (
                                      <a
                                        href={lead.linkedinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-xs text-rivvra-400 hover:underline flex items-center gap-1"
                                      >
                                        <Linkedin className="w-3 h-3" />
                                        Profile
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </td>
                              {canEdit && (
                              <td className="sticky left-[260px] z-10 bg-dark-900 px-4 py-3 w-[110px] min-w-[110px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]" onClick={(e) => e.stopPropagation()}>
                                <ManageDropdown
                                  lead={lead}
                                  onExportCRM={() => {
                                    if (!isPro) {
                                      setComingSoonFeature('Export to CRM');
                                      setShowComingSoon(true);
                                      return;
                                    }
                                    setExportCRMTarget(lead);
                                    setShowExportCRM(true);
                                  }}
                                  onAddToSequence={() => {
                                    if (setupComplete === false) {
                                      showToast('Complete your setup on the Engage page first (connect Gmail + complete profile)', 'error');
                                      return;
                                    }
                                    setSequenceTarget(lead);
                                    setShowAddToSequence(true);
                                  }}
                                  onAddToList={() => {
                                    setAddToListTarget(lead);
                                    setShowAddToList(true);
                                  }}
                                  onEditContact={() => {
                                    setEditContactTarget(lead);
                                    setShowEditContact(true);
                                  }}
                                  onTagContact={() => handleFeatureClick('Tag Contact')}
                                  onRemoveContact={() => handleRemoveFromList(lead)}
                                  removeLabel="Remove from list"
                                />
                              </td>
                              )}
                              {/* Contact Owner */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-bold text-dark-300">{lead.ownerName?.charAt(0)?.toUpperCase() || '?'}</span>
                                  </div>
                                  <span className="text-sm text-dark-300 truncate max-w-[100px]">{lead.ownerName || 'Unknown'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {lead.profileType ? (
                                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                    lead.profileType === 'client'
                                      ? 'bg-blue-500/10 text-blue-400'
                                      : 'bg-purple-500/10 text-purple-400'
                                  }`}>
                                    {lead.profileType === 'client' ? 'Client' : 'Candidate'}
                                  </span>
                                ) : (
                                  <span className="text-dark-500">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {(() => {
                                  const statusConfig = {
                                    in_sequence: { label: 'In Sequence', cls: 'bg-blue-500/10 text-blue-400' },
                                    replied: { label: 'Interested', cls: 'bg-emerald-500/10 text-emerald-400' },
                                    replied_not_interested: { label: 'Not Interested', cls: 'bg-purple-500/10 text-purple-400' },
                                    no_response: { label: 'No Response', cls: 'bg-orange-500/10 text-orange-400' },
                                    bounced: { label: 'Bounced', cls: 'bg-red-500/10 text-red-400' },
                                  };
                                  const cfg = statusConfig[lead.outreachStatus];
                                  return cfg ? (
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>
                                  ) : (
                                    <span className="px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap bg-dark-700 text-dark-400">Not Contacted</span>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 text-sm">
                                  <Building2 className="w-4 h-4 text-dark-500 flex-shrink-0" />
                                  <span className="text-dark-300 truncate max-w-[150px]">{lead.company || '-'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 text-sm">
                                  <MapPin className="w-4 h-4 text-dark-500 flex-shrink-0" />
                                  <span className="text-dark-300 truncate max-w-[120px]">{lead.location || '-'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {lead.email ? (
                                  <span className="text-rivvra-400 truncate block max-w-[180px]">{lead.email}</span>
                                ) : (
                                  <span className="text-dark-500">Not found</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {lead.notes && lead.notes.length > 0 ? (
                                  <div className="flex items-center gap-1 text-sm text-dark-300">
                                    <StickyNote className="w-4 h-4 text-rivvra-400" />
                                    <span>{lead.notes.length}</span>
                                  </div>
                                ) : (
                                  <span className="text-dark-600">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700 bg-dark-900">
                        <p className="text-sm text-dark-400">
                          Page {page} of {totalPages} ({totalLeads} total)
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-2 rounded-lg hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4 text-dark-400" />
                          </button>
                          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (page <= 3) {
                              pageNum = i + 1;
                            } else if (page >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = page - 2 + i;
                            }
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setPage(pageNum)}
                                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                  page === pageNum
                                    ? 'bg-rivvra-500 text-dark-950'
                                    : 'text-dark-400 hover:bg-dark-700'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-2 rounded-lg hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronRight className="w-4 h-4 text-dark-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lead Detail Panel */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
          teamMode={true}
          teamMembers={teamMembers}
        />
      )}

      {/* Rename Default List Modal (Admin only) */}
      {renamingList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => { setRenamingList(null); setRenameValue(''); }} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <button onClick={() => { setRenamingList(null); setRenameValue(''); }} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-white mb-4">Rename List</h3>
            <p className="text-dark-400 text-sm mb-3">Current name: <span className="text-dark-300">{renamingList.name}</span></p>
            <input
              type="text"
              defaultValue={renamingList.name}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameList(); }}
              autoFocus
              placeholder="New list name"
              className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 mb-4"
            />
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => { setRenamingList(null); setRenameValue(''); }} className="px-4 py-2 text-dark-400 text-sm hover:text-white">Cancel</button>
              <button
                onClick={handleRenameList}
                disabled={renaming || !renameValue.trim() || renameValue.trim() === renamingList.name}
                className="px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 flex items-center gap-2"
              >
                {renaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove from List Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <button onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-white mb-2">Remove from list</h3>
            <p className="text-dark-400 text-sm mb-5">
              Remove <span className="text-white font-medium">{deleteTarget.name}</span> from <span className="text-white font-medium">{selectedList}</span>? The contact will not be deleted.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }} className="px-4 py-2 text-dark-400 text-sm hover:text-white">Cancel</button>
              <button
                onClick={confirmRemoveFromList}
                disabled={deleting}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-400 disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      <ComingSoonModal
        isOpen={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        feature={comingSoonFeature}
      />

      <AddToListModal
        isOpen={showAddToList}
        onClose={() => {
          setShowAddToList(false);
          setAddToListTarget(null);
        }}
        lead={addToListTarget}
        onLeadUpdate={(updatedLead) => {
          handleLeadUpdate(updatedLead);
          loadLists(false);
        }}
      />

      <ExportToCRMModal
        isOpen={showExportCRM}
        onClose={() => {
          setShowExportCRM(false);
          setExportCRMTarget(null);
        }}
        lead={exportCRMTarget}
      />

      <AddToSequenceModal
        isOpen={showAddToSequence}
        onClose={() => {
          setShowAddToSequence(false);
          setSequenceTarget(null);
        }}
        onEnrolled={({ leadIds: enrolledIds }) => {
          setLeads(prev => prev.map(l =>
            enrolledIds.includes(l._id) ? { ...l, outreachStatus: 'in_sequence' } : l
          ));
          if (selectedLead && enrolledIds.includes(selectedLead._id)) {
            setSelectedLead(prev => ({ ...prev, outreachStatus: 'in_sequence' }));
          }
        }}
        leadIds={sequenceTarget ? [sequenceTarget._id] : []}
        leadNames={sequenceTarget ? [sequenceTarget.name] : []}
      />

      <EditContactModal
        lead={editContactTarget}
        isOpen={showEditContact}
        onClose={() => {
          setShowEditContact(false);
          setEditContactTarget(null);
        }}
        onLeadUpdate={handleLeadUpdate}
      />
    </>
  );
}

export default TeamListsPage;
