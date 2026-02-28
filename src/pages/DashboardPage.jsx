import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlatform } from '../context/PlatformContext';
import {
  Search, Users, Mail, MessageSquare, Building2,
  Crown, Lock, Check, ChevronRight, Chrome, ExternalLink,
  Sparkles, ArrowRight, Plus, MapPin, X, Filter,
  ChevronLeft, Briefcase, Loader2, Download, UserPlus, List, CheckCircle2
} from 'lucide-react';
import LeadDetailPanel from '../components/LeadDetailPanel';
import api from '../utils/api';
import { exportLeadsToCSV } from '../utils/csvExport';
import ComingSoonModal from '../components/ComingSoonModal';

// ==================== Lead Search Card ====================
function LeadSearchCard({ lead, onClick, onSave, onAddToList, isSaved, saving }) {
  const hasEmail = lead.email && lead.email !== 'noemail@domain.com' && lead.email !== 'No email found' && lead.email !== '';
  const displayTitle = lead.title || lead.currentTitle || lead.headline || '';
  const displayCompany = lead.company || lead.companyName || '';
  const initials = (lead.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div
      onClick={onClick}
      className="card p-4 hover:border-rivvra-500/30 transition-all cursor-pointer group"
    >
      <div className="flex items-start gap-3 mb-3">
        {lead.profilePicture ? (
          <img src={lead.profilePicture} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center text-sm font-medium text-white flex-shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white truncate group-hover:text-rivvra-400 transition-colors">{lead.name || 'Unknown'}</p>
          <p className="text-xs text-dark-400 truncate">{displayTitle || '\u2014'}</p>
        </div>
        {lead.profileType && (
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${
            lead.profileType === 'client' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
          }`}>
            {lead.profileType === 'client' ? 'Client' : 'Candidate'}
          </span>
        )}
      </div>

      <div className="space-y-1.5 text-sm">
        {displayCompany && (
          <div className="flex items-center gap-2 text-dark-400">
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{displayCompany}</span>
          </div>
        )}
        {lead.location && (
          <div className="flex items-center gap-2 text-dark-400">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{lead.location}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
          {hasEmail ? (
            <>
              <span className="text-rivvra-400 truncate">{lead.email}</span>
              {lead.emailVerified && (
                <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
              )}
            </>
          ) : (
            <span className="text-dark-500">No email</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dark-800">
        <button
          onClick={(e) => { e.stopPropagation(); onSave(lead); }}
          disabled={isSaved || saving}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isSaved
              ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
              : saving
              ? 'bg-dark-700 text-dark-400 cursor-wait'
              : 'bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20 hover:bg-rivvra-500/20'
          }`}
        >
          {isSaved ? (
            <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>
          ) : saving ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
          ) : (
            <><UserPlus className="w-3.5 h-3.5" /> Save Contact</>
          )}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onAddToList(lead); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 text-dark-300 border border-dark-600 rounded-lg text-xs font-medium hover:bg-dark-600 hover:text-white transition-colors"
        >
          <List className="w-3.5 h-3.5" />
          Add to List
        </button>
      </div>
    </div>
  );
}

// ==================== Filters Panel ====================
function FiltersPanel({ filters, setFilters, lists, onClear }) {
  const activeCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="card p-5 sticky top-8 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-dark-400" />
          <h3 className="font-semibold text-white">Filters</h3>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-rivvra-500/20 text-rivvra-400">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={onClear} className="text-xs text-rivvra-400 hover:text-rivvra-300 transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* Company */}
      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wide">Company</label>
        <input
          type="text"
          value={filters.company}
          onChange={(e) => setFilters(f => ({ ...f, company: e.target.value }))}
          placeholder="e.g. Google, TCS"
          className="w-full px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500/50 transition-colors"
        />
      </div>

      {/* Location */}
      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wide">Location</label>
        <input
          type="text"
          value={filters.location}
          onChange={(e) => setFilters(f => ({ ...f, location: e.target.value }))}
          placeholder="e.g. Mumbai, India"
          className="w-full px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500/50 transition-colors"
        />
      </div>

      {/* Job Title */}
      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wide">Job Title</label>
        <input
          type="text"
          value={filters.title}
          onChange={(e) => setFilters(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. HR Manager, CTO"
          className="w-full px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500/50 transition-colors"
        />
      </div>

      {/* Profile Type */}
      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wide">Profile Type</label>
        <select
          value={filters.profileType}
          onChange={(e) => setFilters(f => ({ ...f, profileType: e.target.value }))}
          className="w-full px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500/50 transition-colors"
        >
          <option value="">All Types</option>
          <option value="client">Client</option>
          <option value="candidate">Candidate</option>
        </select>
      </div>

      {/* Email Status */}
      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wide">Email Status</label>
        <select
          value={filters.emailStatus}
          onChange={(e) => setFilters(f => ({ ...f, emailStatus: e.target.value }))}
          className="w-full px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500/50 transition-colors"
        >
          <option value="">Any</option>
          <option value="has_email">Has Email</option>
          <option value="verified">Verified Email</option>
          <option value="no_email">No Email</option>
        </select>
      </div>

      {/* Lists */}
      {lists.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1.5 uppercase tracking-wide">List</label>
          <select
            value={filters.listName}
            onChange={(e) => setFilters(f => ({ ...f, listName: e.target.value }))}
            className="w-full px-3 py-2 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500/50 transition-colors"
          >
            <option value="">All Lists</option>
            {lists.map(l => (
              <option key={l.name} value={l.name}>{l.name} ({l.count || 0})</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ==================== Pagination ====================
function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-2 rounded-lg text-sm text-dark-400 hover:text-white hover:bg-dark-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {start > 1 && (
        <>
          <button onClick={() => onPageChange(1)} className="px-3 py-2 rounded-lg text-sm text-dark-400 hover:text-white hover:bg-dark-800/50 transition-colors">1</button>
          {start > 2 && <span className="text-dark-500">...</span>}
        </>
      )}
      {pages.map(p => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-3 py-2 rounded-lg text-sm transition-colors ${
            p === page ? 'bg-rivvra-500 text-dark-950 font-medium' : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
          }`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-dark-500">...</span>}
          <button onClick={() => onPageChange(totalPages)} className="px-3 py-2 rounded-lg text-sm text-dark-400 hover:text-white hover:bg-dark-800/50 transition-colors">{totalPages}</button>
        </>
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-2 rounded-lg text-sm text-dark-400 hover:text-white hover:bg-dark-800/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ==================== Add to List Modal ====================
function AddToListModal({ isOpen, onClose, lists, onSelect, onCreateList, lead }) {
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);

  if (!isOpen || !lead) return null;

  const handleCreate = async () => {
    if (!newListName.trim()) return;
    setCreating(true);
    try {
      await onCreateList(newListName.trim());
      setNewListName('');
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-5 border-b border-dark-800">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Add to List</h3>
            <button onClick={onClose} className="p-1 text-dark-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-dark-400 mt-1 truncate">{lead.name}</p>
        </div>

        <div className="p-3 max-h-60 overflow-y-auto">
          {lists.length === 0 ? (
            <p className="text-dark-500 text-sm text-center py-4">No lists yet. Create one below.</p>
          ) : (
            <div className="space-y-1">
              {lists.map((list) => (
                <button
                  key={list.name}
                  onClick={() => onSelect(list.name)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-dark-200 hover:bg-dark-800 hover:text-white transition-colors"
                >
                  <span className="truncate">{list.name}</span>
                  <span className="text-xs text-dark-500 flex-shrink-0 ml-2">{list.count || 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-dark-800">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Create new list..."
              className="flex-1 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500"
            />
            <button
              onClick={handleCreate}
              disabled={!newListName.trim() || creating}
              className="px-3 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-medium hover:bg-rivvra-400 disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Main Dashboard Page ====================
function DashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const { orgPath } = usePlatform();
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState('');
  const [savedLeadsCount, setSavedLeadsCount] = useState(0);
  const [lists, setLists] = useState([]);

  // Search state
  const [searchMode, setSearchMode] = useState('contacts');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  // Filters
  const [filters, setFilters] = useState({
    location: '',
    title: '',
    profileType: '',
    company: '',
    emailStatus: '',
    listName: '',
  });

  // Detail panel
  const [selectedLead, setSelectedLead] = useState(null);

  // Save & Add to List
  const [savedLeadIds, setSavedLeadIds] = useState(new Set());
  const [savingLeadId, setSavingLeadId] = useState(null);
  const [listModalLead, setListModalLead] = useState(null);

  // ---- Dashboard data fetch ----
  const fetchData = useCallback(async () => {
    try {
      const [featuresRes, leadsRes, listsRes] = await Promise.all([
        api.getFeatures(),
        api.getLeads().catch(() => ({ leads: [] })),
        api.getLists().catch(() => ({ lists: [] }))
      ]);

      if (featuresRes.success) setFeatures(featuresRes);
      setSavedLeadsCount(leadsRes.leads?.length || 0);
      setLists(listsRes.lists || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [isAuthenticated, fetchData]);

  // Extension sync
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'rivvra_lead_saved') setTimeout(() => fetchData(), 500);
    };
    const handleFocus = () => {
      const lastSave = localStorage.getItem('rivvra_lead_saved');
      if (lastSave) {
        try {
          const data = JSON.parse(lastSave);
          if (Date.now() - data.timestamp < 30000) fetchData();
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchData]);

  const isPro = user?.plan === 'pro' || user?.plan === 'premium';

  const handleFeatureClick = (feature) => {
    if (!isPro) {
      setComingSoonFeature(feature);
      setShowComingSoon(true);
    }
  };

  // ---- Search ----
  const performSearch = useCallback(async (page = 1) => {
    const hasSearch = searchQuery.trim().length >= 2;
    const hasFilters = Object.values(filters).some(v => v !== '');

    if (!hasSearch && !hasFilters) {
      setIsSearchActive(false);
      setSearchResults([]);
      setSearchTotal(0);
      return;
    }

    setSearchLoading(true);
    setIsSearchActive(true);

    try {
      if (searchMode === 'contacts') {
        const params = { page, limit: 25, sort: sortBy, sortDir };
        if (searchQuery.trim().length >= 2) params.search = searchQuery.trim();
        Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });

        const response = await api.searchAllLeads(params);
        if (response.success) {
          setSearchResults(response.leads || []);
          setSearchTotal(response.total || 0);
          setSearchPage(response.page || 1);
          setSearchTotalPages(response.totalPages || 0);
        }
      } else {
        // Companies mode
        if (searchQuery.trim().length >= 2) {
          const response = await api.searchCompanies(searchQuery.trim());
          if (response.success) {
            setSearchResults(response.companies || []);
            setSearchTotal(response.companies?.length || 0);
            setSearchPage(1);
            setSearchTotalPages(1);
          }
        }
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, searchMode, filters, sortBy, sortDir]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasSearch = searchQuery.trim().length >= 2;
      const hasFilters = Object.values(filters).some(v => v !== '');
      if (hasSearch || hasFilters) {
        performSearch(1);
      } else {
        setIsSearchActive(false);
        setSearchResults([]);
        setSearchTotal(0);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, filters, searchMode, sortBy, sortDir]);

  const clearSearch = () => {
    setSearchQuery('');
    setFilters({ location: '', title: '', profileType: '', company: '', emailStatus: '', listName: '' });
    setIsSearchActive(false);
    setSearchResults([]);
    setSearchTotal(0);
  };

  const handlePageChange = (newPage) => {
    setSearchPage(newPage);
    performSearch(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save contact to My Contacts
  const handleSaveContact = async (lead) => {
    setSavingLeadId(lead._id);
    try {
      await api.saveLead({
        name: lead.name,
        title: lead.title || lead.currentTitle,
        headline: lead.headline,
        company: lead.company || lead.companyName,
        companyName: lead.company || lead.companyName,
        location: lead.location,
        linkedinUrl: lead.linkedinUrl,
        email: lead.email,
        phone: lead.phone,
        profilePicture: lead.profilePicture,
        about: lead.about,
        currentTitle: lead.currentTitle,
        profileType: lead.profileType,
        emailSource: lead.emailSource,
        emailConfidence: lead.emailConfidence,
        leadSource: 'portal_search',
      });
      setSavedLeadIds((prev) => new Set([...prev, lead._id]));
      setSavedLeadsCount((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to save contact:', err);
    } finally {
      setSavingLeadId(null);
    }
  };

  // Save contact + add to specific list
  const handleAddToList = async (listName) => {
    const lead = listModalLead;
    if (!lead) return;
    setSavingLeadId(lead._id);
    setListModalLead(null);
    try {
      await api.saveLead({
        name: lead.name,
        title: lead.title || lead.currentTitle,
        headline: lead.headline,
        company: lead.company || lead.companyName,
        companyName: lead.company || lead.companyName,
        location: lead.location,
        linkedinUrl: lead.linkedinUrl,
        email: lead.email,
        phone: lead.phone,
        profilePicture: lead.profilePicture,
        about: lead.about,
        currentTitle: lead.currentTitle,
        profileType: lead.profileType,
        emailSource: lead.emailSource,
        emailConfidence: lead.emailConfidence,
        leadSource: 'portal_search',
        lists: [listName],
      });
      setSavedLeadIds((prev) => new Set([...prev, lead._id]));
      setSavedLeadsCount((prev) => prev + 1);
      // Refresh lists to update counts
      try {
        const listsRes = await api.getLists();
        setLists(listsRes.lists || []);
      } catch (e) {}
    } catch (err) {
      console.error('Failed to add to list:', err);
    } finally {
      setSavingLeadId(null);
    }
  };

  // Create a new list and then add the lead to it
  const handleCreateListAndAdd = async (newListName) => {
    try {
      await api.createList(newListName);
      const listsRes = await api.getLists();
      setLists(listsRes.lists || []);
      await handleAddToList(newListName);
    } catch (err) {
      console.error('Failed to create list:', err);
    }
  };

  return (
    <>
      <div className="min-h-screen">
        <div className="p-8">
          {/* ======== WELCOME SECTION ======== */}
          <div className="text-center mb-8 pt-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome, {user?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-dark-400">
              Search and explore contacts and companies to get smarter recommendations as you go
            </p>
          </div>

          {/* ======== SEARCH BAR ======== */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="flex items-center gap-3 p-4 bg-dark-800/50 border border-dark-700 rounded-xl focus-within:border-rivvra-500/50 transition-colors">
              <select
                value={searchMode}
                onChange={(e) => { setSearchMode(e.target.value); setSearchResults([]); }}
                className="bg-transparent text-white text-sm border-r border-dark-600 pr-3 outline-none cursor-pointer"
              >
                <option value="contacts">Contacts</option>
                <option value="companies">Companies</option>
              </select>
              <Search className="w-5 h-5 text-dark-500 flex-shrink-0" />
              <input
                type="text"
                placeholder={searchMode === 'contacts' ? 'Search by name, email, company, title...' : 'Search companies by name...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && performSearch(1)}
                className="flex-1 bg-transparent text-white placeholder-dark-500 outline-none"
              />
              {(searchQuery || isSearchActive) && (
                <button onClick={clearSearch} className="p-1 text-dark-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* ======== CONDITIONAL CONTENT ======== */}
          {isSearchActive ? (
            /* ==================== SEARCH RESULTS VIEW ==================== */
            <div className="flex gap-6">
              {/* LEFT: Filters Panel (contacts only) */}
              {searchMode === 'contacts' && (
                <div className="w-72 flex-shrink-0 hidden lg:block">
                  <FiltersPanel
                    filters={filters}
                    setFilters={setFilters}
                    lists={lists}
                    onClear={() => setFilters({ location: '', title: '', profileType: '', company: '', emailStatus: '', listName: '' })}
                  />
                </div>
              )}

              {/* RIGHT: Results */}
              <div className="flex-1 min-w-0">
                {/* Results Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <p className="text-dark-300">
                      {searchLoading ? 'Searching...' : (
                        <>
                          <span className="font-semibold text-white">{searchTotal.toLocaleString()}</span>
                          {' '}{searchMode === 'contacts' ? 'contacts' : 'companies'} found
                        </>
                      )}
                    </p>
                  </div>
                  {searchMode === 'contacts' && (
                    <>
                      <button
                        onClick={() => {
                          if (searchResults.length > 0) exportLeadsToCSV(searchResults, 'rivvra-search');
                        }}
                        disabled={searchResults.length === 0 || searchLoading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-dark-300 hover:text-white hover:border-dark-600 disabled:opacity-50 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Export
                      </button>
                      <select
                        value={`${sortBy}_${sortDir}`}
                        onChange={(e) => {
                          const [s, d] = e.target.value.split('_');
                          setSortBy(s);
                          setSortDir(d);
                        }}
                        className="px-3 py-1.5 bg-dark-800/50 border border-dark-700 rounded-lg text-sm text-dark-300 outline-none cursor-pointer"
                      >
                        <option value="createdAt_desc">Newest First</option>
                        <option value="createdAt_asc">Oldest First</option>
                        <option value="name_asc">Name A-Z</option>
                        <option value="name_desc">Name Z-A</option>
                      </select>
                    </>
                  )}
                </div>

                {/* Results Grid */}
                {searchLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-rivvra-400 animate-spin mb-4" />
                    <p className="text-dark-400">Searching contacts...</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-20">
                    <Search className="w-12 h-12 text-dark-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">No results found</h3>
                    <p className="text-dark-400">Try adjusting your search or filters</p>
                  </div>
                ) : searchMode === 'contacts' ? (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {searchResults.map(lead => (
                      <LeadSearchCard
                        key={lead._id}
                        lead={lead}
                        onClick={() => setSelectedLead(lead)}
                        onSave={handleSaveContact}
                        onAddToList={(lead) => setListModalLead(lead)}
                        isSaved={savedLeadIds.has(lead._id)}
                        saving={savingLeadId === lead._id}
                      />
                    ))}
                  </div>
                ) : (
                  /* Companies results */
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {searchResults.map(company => (
                      <div key={company._id} className="card p-4 hover:border-rivvra-500/30 transition-all">
                        <div className="flex items-start gap-3">
                          {company.logo ? (
                            <img src={company.logo} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-dark-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white truncate">{company.name}</p>
                            {company.industry && <p className="text-xs text-dark-400 truncate">{company.industry}</p>}
                            {company.employeeCount && <p className="text-xs text-dark-500">{company.employeeCount} employees</p>}
                            {company.domain && (
                              <p className="text-xs text-rivvra-400 mt-1 truncate">{company.domain}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {searchMode === 'contacts' && (
                  <Pagination page={searchPage} totalPages={searchTotalPages} onPageChange={handlePageChange} />
                )}
              </div>
            </div>
          ) : (
            /* ==================== DEFAULT DASHBOARD VIEW ==================== */
            <>
              {/* Recommended Leads Section */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-semibold text-white">Recommended contacts tailored just for you</h2>
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-rivvra-500/20 text-rivvra-400">Beta</span>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  {/* Similar to your reveals - Contacts */}
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-white">Similar to your reveals</h3>
                        <p className="text-sm text-dark-400">Contacts &bull; <span className="text-amber-400">Coming Soon</span></p>
                      </div>
                    </div>
                    <div className="text-center py-8">
                      <div className="w-14 h-14 rounded-full bg-dark-800 mx-auto mb-3 flex items-center justify-center">
                        <Users className="w-7 h-7 text-dark-500" />
                      </div>
                      <p className="text-sm text-dark-400 mb-1">AI-powered contact recommendations</p>
                      <p className="text-xs text-dark-500">Based on your saved contacts</p>
                    </div>
                  </div>

                  {/* Similar to your reveals - Companies */}
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-white">Similar to your reveals</h3>
                        <p className="text-sm text-dark-400">Companies &bull; <span className="text-amber-400">Coming Soon</span></p>
                      </div>
                    </div>
                    <div className="text-center py-8">
                      <div className="w-14 h-14 rounded-full bg-dark-800 mx-auto mb-3 flex items-center justify-center">
                        <Building2 className="w-7 h-7 text-dark-500" />
                      </div>
                      <p className="text-sm text-dark-400 mb-1">AI-powered company recommendations</p>
                      <p className="text-xs text-dark-500">Based on your extracted companies</p>
                    </div>
                  </div>

                  {/* Suggested based on CRM */}
                  <div className="card p-5">
                    <div className="mb-4">
                      <h3 className="font-semibold text-white">Suggested based on your CRM</h3>
                    </div>
                    <div className="text-center py-6">
                      <div className="w-16 h-16 rounded-full bg-dark-800 mx-auto mb-4 flex items-center justify-center">
                        <Building2 className="w-8 h-8 text-dark-500" />
                      </div>
                      <p className="text-sm text-dark-400 mb-2">Connect your CRM to enable AI recommendations</p>
                      <p className="text-xs text-dark-500 mb-4">Supports HubSpot, Salesforce, Odoo & more</p>
                      <button
                        onClick={() => handleFeatureClick('CRM Integration')}
                        className="px-4 py-2 rounded-lg bg-rivvra-500 text-dark-950 font-medium text-sm hover:bg-rivvra-400 transition-colors"
                      >
                        Connect CRM
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Contacts Saved', value: savedLeadsCount || 0, icon: Users, color: 'rivvra', cta: 'Extract your first contact →' },
                  { label: 'Emails Generated', value: features?.usage?.emailsGenerated || 0, icon: Mail, color: 'blue', locked: !isPro, cta: 'Generate your first email →' },
                  { label: 'DMs Generated', value: features?.usage?.dmsGenerated || 0, icon: MessageSquare, color: 'purple', locked: !isPro, cta: 'Generate your first DM →' },
                  { label: 'CRM Exports', value: features?.usage?.crmExports || 0, icon: Building2, color: 'orange', locked: !isPro, cta: 'Export to your CRM →' },
                ].map((stat, i) => (
                  <div key={i} className="card p-5 relative">
                    {stat.locked && (
                      <div className="absolute top-3 right-3">
                        <Lock className="w-4 h-4 text-dark-500" />
                      </div>
                    )}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                      stat.color === 'rivvra' ? 'bg-rivvra-500/10' :
                      stat.color === 'blue' ? 'bg-blue-500/10' :
                      stat.color === 'purple' ? 'bg-purple-500/10' : 'bg-orange-500/10'
                    }`}>
                      <stat.icon className={`w-5 h-5 ${
                        stat.color === 'rivvra' ? 'text-rivvra-400' :
                        stat.color === 'blue' ? 'text-blue-400' :
                        stat.color === 'purple' ? 'text-purple-400' : 'text-orange-400'
                      }`} />
                    </div>
                    <p className="text-sm text-dark-400 mb-1">{stat.label}</p>
                    <span className="text-2xl font-bold text-white">{stat.value}</span>
                    {stat.value === 0 && !stat.locked && (
                      <p className="text-xs text-dark-500 mt-1">{stat.cta}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Bottom Row - Lists and Getting Started */}
              <div className="grid lg:grid-cols-2 gap-6">
                {/* My Lists */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white">My Lists</h3>
                    <Link to={orgPath('/outreach/lists')} className="text-sm text-rivvra-400 hover:text-rivvra-300 flex items-center gap-1">
                      View all <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                  {lists.length === 0 ? (
                    <div className="text-center py-8 bg-dark-800/30 rounded-xl">
                      <p className="text-dark-400 mb-3">No lists yet</p>
                      <Link to={orgPath('/outreach/lists')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500/10 text-rivvra-400 hover:bg-rivvra-500/20 transition-colors text-sm">
                        <Plus className="w-4 h-4" />
                        Create List
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lists.slice(0, 4).map((list, idx) => (
                        <Link
                          key={idx}
                          to={`/outreach/lists?list=${encodeURIComponent(list.name)}`}
                          className="flex items-center justify-between p-3 bg-dark-800/30 rounded-lg hover:bg-dark-800/50 transition-colors"
                        >
                          <span className="text-white">{list.name}</span>
                          <span className="text-sm text-dark-400">{list.count || 0} contacts</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chrome Extension CTA */}
                <div className="card p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-rivvra-500/20 flex items-center justify-center">
                      <Chrome className="w-6 h-6 text-rivvra-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Chrome Extension</h3>
                      <p className="text-sm text-dark-400">Extract contacts directly from LinkedIn</p>
                    </div>
                  </div>
                  <p className="text-dark-400 text-sm mb-4">
                    Install our Chrome extension to start extracting contacts from LinkedIn profiles, searches, and Sales Navigator.
                  </p>
                  <a
                    href="#"
                    target="_blank"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 text-dark-950 font-medium text-sm hover:bg-rivvra-400 transition-colors"
                  >
                    Install Extension
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
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
          onUpdate={(updated) => {
            setSearchResults(prev => prev.map(l => l._id === updated._id ? { ...l, ...updated } : l));
            setSelectedLead(updated);
          }}
        />
      )}

      {/* Add to List Modal */}
      <AddToListModal
        isOpen={!!listModalLead}
        onClose={() => setListModalLead(null)}
        lists={lists}
        lead={listModalLead}
        onSelect={handleAddToList}
        onCreateList={handleCreateListAndAdd}
      />

      <ComingSoonModal
        isOpen={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        feature={comingSoonFeature}
      />
    </>
  );
}

export default DashboardPage;
