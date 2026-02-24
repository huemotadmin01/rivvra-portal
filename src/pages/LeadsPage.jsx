import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Linkedin, Users, Search, Filter, Download,
  ExternalLink, Building2, MapPin,
  ChevronLeft, ChevronRight, Bookmark,
  ArrowUpDown, RefreshCw, Trash2, AlertTriangle,
  StickyNote, UserPlus
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
import CreateContactModal from '../components/CreateContactModal';
import { useToast } from '../context/ToastContext';

function LeadsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [profileTypeFilter, setProfileTypeFilter] = useState('all');
  const filterRef = useRef(null);
  const filterDropdownRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showAddToList, setShowAddToList] = useState(false);
  const [addToListTarget, setAddToListTarget] = useState(null);
  const [showExportCRM, setShowExportCRM] = useState(false);
  const [exportCRMTarget, setExportCRMTarget] = useState(null);
  const [showAddToSequence, setShowAddToSequence] = useState(false);
  const [sequenceTarget, setSequenceTarget] = useState(null);
  const [outreachStatusFilter, setOutreachStatusFilter] = useState(searchParams.get('status') || 'all');
  const [showEditContact, setShowEditContact] = useState(false);
  const [editContactTarget, setEditContactTarget] = useState(null);
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [setupComplete, setSetupComplete] = useState(null);

  const leadsPerPage = 10;
  const isPro = user?.plan === 'pro' || user?.plan === 'premium';

  const loadLeads = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    try {
      const response = await api.getLeads();
      console.log('📥 Loaded leads:', response.leads?.length, 'total:', response.total);
      const deletedLeads = response.leads?.filter(l => l.deleted);
      if (deletedLeads?.length > 0) {
        console.warn('⚠️ Found deleted leads in response:', deletedLeads.map(l => l.name));
      }
      if (response.success) {
        setLeads(response.leads || []);
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
      setLeads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-open filters and clear URL param when navigated with ?status=xxx
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && statusParam !== 'all') {
      setOutreachStatusFilter(statusParam);
      setShowFilters(true);
      // Clean the URL param so it doesn't persist on refresh/back
      setSearchParams({}, { replace: true });
    }
  }, []); // Run once on mount

  useEffect(() => {
    loadLeads();
    // Check setup status for sequence guard
    api.getSetupStatus().then(res => {
      setSetupComplete(res.success ? res.allComplete : false);
    }).catch(() => setSetupComplete(false));
  }, [loadLeads]);

  const [lastSeenTimestamp, setLastSeenTimestamp] = useState(0);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'rivvra_lead_saved') {
        console.log('Lead saved from extension (storage event), refreshing...');
        setTimeout(() => loadLeads(true), 500);
      }
    };

    const handleCustomEvent = (e) => {
      console.log('Lead saved from extension (custom event), refreshing...', e.detail);
      setTimeout(() => loadLeads(true), 500);
    };

    const handleFocus = () => checkForNewSaves();

    const checkForNewSaves = () => {
      const lastSave = localStorage.getItem('rivvra_lead_saved');
      if (lastSave) {
        try {
          const data = JSON.parse(lastSave);
          const saveTime = data.timestamp;
          if (saveTime > lastSeenTimestamp) {
            console.log('New lead detected, refreshing...');
            setLastSeenTimestamp(saveTime);
            loadLeads(true);
          }
        } catch (err) {}
      }
    };

    const pollInterval = setInterval(checkForNewSaves, 2000);

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('rivvra_lead_saved', handleCustomEvent);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('rivvra_lead_saved', handleCustomEvent);
    };
  }, [loadLeads, lastSeenTimestamp]);

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

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilters]);

  const handleFeatureClick = (feature) => {
    if (!isPro) {
      setComingSoonFeature(feature);
      setShowComingSoon(true);
    }
  };

  const handleManualRefresh = () => loadLeads(true);

  const handleDeleteLead = (lead) => {
    setDeleteTarget(lead);
    setShowDeleteModal(true);
  };

  const handleBulkDelete = () => {
    if (selectedLeads.length === 0) return;
    setDeleteTarget(null);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      if (deleteTarget) {
        console.log('🗑️ Deleting single lead:', deleteTarget._id);
        const response = await api.deleteLead(deleteTarget._id);
        console.log('🗑️ Delete response:', response);
        setLeads(leads.filter(l => l._id !== deleteTarget._id));
        if (selectedLead?._id === deleteTarget._id) {
          setSelectedLead(null);
        }
      } else {
        console.log('🗑️ Deleting multiple leads:', selectedLeads);
        const responses = await Promise.all(selectedLeads.map(id => api.deleteLead(id)));
        console.log('🗑️ Delete responses:', responses);
        setLeads(leads.filter(l => !selectedLeads.includes(l._id)));
        setSelectedLeads([]);
        if (selectedLead && selectedLeads.includes(selectedLead._id)) {
          setSelectedLead(null);
        }
      }
    } catch (err) {
      console.error('❌ Failed to delete:', err);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const handleRowClick = (lead) => {
    setSelectedLead(lead);
  };

  const handleLeadUpdate = (updatedLead) => {
    setLeads(leads.map(l => l._id === updatedLead._id ? updatedLead : l));
    setSelectedLead(updatedLead);
  };

  const activeFilterCount = (profileTypeFilter !== 'all' ? 1 : 0) + (outreachStatusFilter !== 'all' ? 1 : 0);

  const filteredLeads = leads.filter(lead => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery ||
      lead.name?.toLowerCase().includes(searchLower) ||
      lead.company?.toLowerCase().includes(searchLower) ||
      lead.title?.toLowerCase().includes(searchLower);

    const matchesProfileType = profileTypeFilter === 'all' ||
      (profileTypeFilter === 'candidate' && lead.profileType === 'candidate') ||
      (profileTypeFilter === 'client' && lead.profileType === 'client');

    const leadStatus = lead.outreachStatus || 'not_contacted';
    const matchesOutreachStatus = outreachStatusFilter === 'all' || leadStatus === outreachStatusFilter;

    return matchesSearch && matchesProfileType && matchesOutreachStatus;
  });

  const totalPages = Math.ceil(filteredLeads.length / leadsPerPage);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * leadsPerPage,
    currentPage * leadsPerPage
  );

  const toggleSelectAll = (e) => {
    e.stopPropagation();
    if (selectedLeads.length === paginatedLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(paginatedLeads.map(l => l._id));
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

  return (
    <>
      <div className={`flex h-full transition-all duration-300 ${selectedLead ? 'mr-[420px]' : ''}`}>
        <div className="flex-1 p-8 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Saved Contacts</h1>
              <p className="text-dark-400">
                {leads.length} contacts saved {selectedLeads.length > 0 && `• ${selectedLeads.length} selected`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {selectedLeads.length > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete ({selectedLeads.length})
                </button>
              )}
              <button
                onClick={() => setShowCreateContact(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 text-dark-950 font-medium hover:bg-rivvra-400 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add Contact
              </button>
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 text-white hover:bg-dark-700 transition-colors ${refreshing ? 'opacity-50' : ''}`}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => {
                  const leadsToExport = selectedLeads.length > 0
                    ? leads.filter(l => selectedLeads.includes(l._id))
                    : filteredLeads;
                  if (leadsToExport.length > 0) exportLeadsToCSV(leadsToExport, 'rivvra-contacts');
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
                placeholder="Search Contacts by name, company, title"
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
                            onClick={() => { setProfileTypeFilter('all'); setOutreachStatusFilter('all'); }}
                            className="text-xs text-rivvra-400 hover:text-rivvra-300"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

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
          <div className="bg-dark-900 rounded-2xl border border-dark-800/50 shadow-2xl flex-1 overflow-hidden flex flex-col">
            {loading ? (
              <div className="p-12 text-center flex-1 flex items-center justify-center">
                <div>
                  <div className="w-8 h-8 border-2 border-rivvra-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-dark-400">Loading contacts...</p>
                </div>
              </div>
            ) : leads.length === 0 ? (
              <div className="p-12 text-center flex-1 flex items-center justify-center">
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto mb-4">
                    <Bookmark className="w-8 h-8 text-dark-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">No Saved Contacts Yet</h3>
                  <p className="text-dark-400 mb-4">
                    Start extracting contacts from LinkedIn using the Chrome extension.
                  </p>
                  <a
                    href="#"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 text-dark-950 font-medium hover:bg-rivvra-400 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Install Extension
                  </a>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-auto">
                  <table style={{ minWidth: '1100px', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead className="sticky top-0 z-20">
                      <tr className="border-b border-dark-700 bg-dark-800">
                        <th className="sticky left-0 z-30 bg-dark-800 px-4 py-3 text-left" style={{ width: 48, minWidth: 48 }}>
                          <input
                            type="checkbox"
                            checked={selectedLeads.length === paginatedLeads.length && paginatedLeads.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500"
                          />
                        </th>
                        <th className="sticky z-30 bg-dark-800 px-4 py-3 text-left" style={{ left: 48, width: 220, minWidth: 220 }}>
                          <button className="flex items-center gap-1 text-sm font-medium text-dark-400 hover:text-white">
                            Contact <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="sticky z-30 bg-dark-800 px-4 py-3 text-left" style={{ left: 268, width: 110, minWidth: 110, boxShadow: '2px 0 5px -2px rgba(0,0,0,0.3)' }}></th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400" style={{ minWidth: 120 }}>Profile Type</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400" style={{ minWidth: 150 }}>Status</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400" style={{ minWidth: 180 }}>Company</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400" style={{ minWidth: 150 }}>Location</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400" style={{ minWidth: 200 }}>Email</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-dark-400" style={{ minWidth: 80 }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedLeads.map((lead) => (
                        <tr
                          key={lead._id}
                          onClick={() => handleRowClick(lead)}
                          className={`border-b border-dark-800 hover:bg-dark-800/50 transition-colors cursor-pointer ${
                            selectedLead?._id === lead._id ? 'bg-dark-800/70' : ''
                          }`}
                        >
                          <td className="sticky left-0 z-10 bg-dark-900 px-4 py-3" style={{ width: 48, minWidth: 48 }}>
                            <input
                              type="checkbox"
                              checked={selectedLeads.includes(lead._id)}
                              onChange={(e) => toggleSelectLead(e, lead._id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-rivvra-500 focus:ring-rivvra-500"
                            />
                          </td>
                          <td className="sticky z-10 bg-dark-900 px-4 py-3" style={{ left: 48, width: 220, minWidth: 220 }}>
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
                          <td className="sticky z-10 bg-dark-900 px-4 py-3" style={{ left: 268, width: 110, minWidth: 110, boxShadow: '2px 0 5px -2px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
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
                              onRemoveContact={() => handleDeleteLead(lead)}
                            />
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
                              <span className="text-dark-300 truncate" style={{ maxWidth: 150 }}>{lead.company || '-'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="w-4 h-4 text-dark-500 flex-shrink-0" />
                              <span className="text-dark-300 truncate" style={{ maxWidth: 200 }} title={lead.location || ''}>{lead.location || '-'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {lead.email ? (
                              <span className="text-rivvra-400 truncate block" style={{ maxWidth: 180 }}>{lead.email}</span>
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

                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700 bg-dark-900">
                    <p className="text-sm text-dark-400">
                      Showing {((currentPage - 1) * leadsPerPage) + 1} to {Math.min(currentPage * leadsPerPage, filteredLeads.length)} of {filteredLeads.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4 text-dark-400" />
                      </button>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                              currentPage === pageNum
                                ? 'bg-rivvra-500 text-dark-950'
                                : 'text-dark-400 hover:bg-dark-700'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
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
        </div>
      </div>

      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
        />
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteModal(false)}
          />

          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {deleteTarget ? 'Delete Contact' : `Delete ${selectedLeads.length} Contacts`}
                </h2>
                <p className="text-dark-400 text-sm">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-dark-300 mb-6">
              {deleteTarget
                ? `Are you sure you want to delete "${deleteTarget.name}"?`
                : `Are you sure you want to delete ${selectedLeads.length} selected leads?`
              }
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 text-white font-medium hover:bg-dark-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
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
        onLeadUpdate={handleLeadUpdate}
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
          // Instantly update local state so status reflects without waiting for API
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

      <CreateContactModal
        isOpen={showCreateContact}
        onClose={() => setShowCreateContact(false)}
        onCreated={(newLead) => {
          setLeads(prev => [newLead, ...prev]);
        }}
      />
    </>
  );
}

export default LeadsPage;
