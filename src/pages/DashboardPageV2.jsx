// ============================================================================
// DashboardPageV2.jsx — Outreach dashboard + lead/company search, on ds
// ============================================================================
//
// Route: /org/:slug/outreach/dashboard. The name is a leftover from before
// the platform grew other apps — this is the Outreach home, not a global one.
//
// Spliced in byte-identically: every fetch, the debounced search, the save /
// add-to-list / create-list handlers, the `?lead=<id>` URL sync, and the
// extension storage+focus listeners.
//
// Two computations are carried across verbatim because they gate what the user
// is told, not just how it looks:
//
//   • The daily email quota block. `effectiveLimit` is the MIN of the user's
//     limit and the org's, `orgBound` decides which `sent` counter is shown,
//     and `atLimit` is what tells a user their queued sequence emails have
//     stopped going out. Getting this wrong either hides a stopped campaign or
//     invents one. It lives inside the render, so it was copied to its own
//     cell rather than spliced.
//   • `isPro` / `canExportCrm`. `canExportCrm` deliberately mirrors the
//     backend's `requireAppAccess('crm')` gate so the UI never offers an
//     export the API will 403.
//
// ── Deliberate render-layer change ─────────────────────────────────────────
// The local `Pagination` (numbered page buttons with a 5-wide sliding window)
// is replaced by ds `Pagination`, which is a range readout plus prev/next.
// That loses "jump straight to page 7". It is the right trade here because
// this page's three siblings — LeadsPageV2, MyListsPageV2, TeamContactsPageV2
// — already use the ds one, and a search results list that paginates
// differently from the contacts list it feeds is worse than losing the jump.
// `searchTotalPages` still gates whether the control renders at all, matching
// the legacy `if (totalPages <= 1) return null;`.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { usePlatform } from '../context/PlatformContext';
import {
  Search, Users, Mail, MessageSquare, Building2,
  Lock, Check, ChevronRight, Chrome, ExternalLink,
  Sparkles, ArrowRight, Plus, MapPin, X, Filter,
  Loader2, Download, UserPlus, List, CheckCircle2,
} from 'lucide-react';
import LeadDetailPanel from '../components/LeadDetailPanel';
import api from '../utils/api';
import { exportLeadsToCSV } from '../utils/csvExport';
import ComingSoonModal from '../components/ComingSoonModal';
import { useExtensionDetector } from '../hooks/useExtensionDetector';
import HiringSignalsCard from '../components/outreach/HiringSignalsCard';
import { useGettingStarted } from '../components/WorkspaceGetStarted';
import OnboardingHubTeaser from '../components/OnboardingHubTeaser';
import {
  Panel, Chip, Button, Input, Select, Field, Modal,
  EmptyState, Meter, Pagination, Avatar, Stat, Callout,
} from '../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const h2Style = { font: "650 17px/1.28 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 };
const h3Style = { font: "600 14px/1.36 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 };
const bodyStyle = { font: "450 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 };
const metaStyle = { font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 };
const truncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const rowLine = { display: 'flex', alignItems: 'center', gap: 8, ...bodyStyle, color: 'var(--fg-4)', minWidth: 0 };

// ==================== Outreach Get Started Checklist ====================
function OutreachGetStarted({ gmailConnected, contactsCount, sequencesCount, orgPath }) {
  const steps = [
    {
      label: 'Connect your Gmail',
      desc: 'Send sequences from your own email address',
      done: gmailConnected,
      to: orgPath('/outreach/engage'),
      cta: 'Connect',
    },
    {
      label: 'Add your first contacts',
      desc: 'Use the Chrome extension on LinkedIn, or add contacts manually',
      done: contactsCount > 0,
      to: orgPath('/outreach/leads'),
      cta: 'Add contacts',
    },
    {
      label: 'Create your first sequence',
      desc: 'Build a multi-step email campaign and enroll contacts',
      done: sequencesCount > 0,
      to: orgPath('/outreach/engage'),
      cta: 'Create sequence',
    },
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Panel style={{ marginBottom: 32 }}>
      <div style={{ padding: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 'var(--r-2, 12px)', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--brand-soft)', color: 'var(--brand-ink)',
          }}>
            <Sparkles size={20} />
          </span>
          <div>
            <h3 style={h3Style}>Get started with Outreach</h3>
            <p style={{ ...metaStyle, marginTop: 2 }}>{doneCount} of {steps.length} steps complete</p>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 'var(--r-2, 12px)',
                background: step.done ? 'var(--brand-soft)' : 'var(--surface-2)',
                boxShadow: `inset 0 0 0 1px ${step.done ? 'var(--brand-line)' : 'var(--line-2)'}`,
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 99, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: step.done ? 'var(--brand)' : 'var(--surface-3)',
                color: step.done ? 'var(--brand-on)' : 'var(--fg)',
                boxShadow: step.done ? 'none' : 'inset 0 0 0 1px var(--line-strong)',
                font: "700 11px/1 'Inter', system-ui, sans-serif",
              }}>
                {step.done ? <CheckCircle2 size={16} /> : i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...bodyStyle, fontWeight: 550, color: step.done ? 'var(--brand-ink)' : 'var(--fg)' }}>{step.label}</p>
                {!step.done && <p style={{ ...metaStyle, marginTop: 2 }}>{step.desc}</p>}
              </div>
              {!step.done && (
                <Button as="a" href={step.to} variant="secondary" size="sm" iconRight={<ArrowRight size={14} />} style={{ flexShrink: 0 }}>
                  {step.cta}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ==================== Lead Search Card ====================
function LeadSearchCard({ lead, onClick, onSave, onAddToList, isSaved, saving }) {
  const hasEmail = lead.email && lead.email !== 'noemail@domain.com' && lead.email !== 'No email found' && lead.email !== '';
  const displayTitle = lead.title || lead.currentTitle || lead.headline || '';
  const displayCompany = lead.company || lead.companyName || '';
  const initials = (lead.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <Panel
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ display: 'grid', gap: 12, padding: 4 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* ds Avatar collapses the photo/initials branch: `src` wins, and
              `initials` keeps the legacy derivation rather than Avatar's own. */}
          <Avatar size="md" src={lead.profilePicture || undefined} name={lead.name} initials={initials} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ ...bodyStyle, fontWeight: 550, color: 'var(--fg)', ...truncate }}>{lead.name || 'Unknown'}</p>
            <p style={{ ...metaStyle, ...truncate }}>{displayTitle || '—'}</p>
          </div>
          {lead.profileType && (
            <Chip tone={lead.profileType === 'client' ? 'info' : 'purple'} style={{ flexShrink: 0 }}>
              {lead.profileType === 'client' ? 'Client' : 'Candidate'}
            </Chip>
          )}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          {displayCompany && (
            <div style={rowLine}>
              <Building2 size={14} style={{ flexShrink: 0 }} />
              <span style={truncate}>{displayCompany}</span>
            </div>
          )}
          {lead.location && (
            <div style={rowLine}>
              <MapPin size={14} style={{ flexShrink: 0 }} />
              <span style={truncate}>{lead.location}</span>
            </div>
          )}
          <div style={rowLine}>
            <Mail size={14} style={{ flexShrink: 0 }} />
            {hasEmail ? (
              <>
                <span style={{ ...truncate, color: 'var(--brand-ink)' }}>{lead.email}</span>
                {lead.emailVerified && <Check size={12} style={{ flexShrink: 0, color: 'var(--brand-ink)' }} />}
              </>
            ) : (
              <span style={{ color: 'var(--fg-4)' }}>No email</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
          <Button
            size="sm"
            variant={isSaved ? 'ghost' : 'secondary'}
            onClick={(e) => { e.stopPropagation(); onSave(lead); }}
            disabled={isSaved || saving}
            style={isSaved ? { color: 'var(--brand-ink)' } : undefined}
            iconLeft={
              isSaved ? <CheckCircle2 size={14} />
                : saving ? <Loader2 size={14} className="animate-spin" />
                : <UserPlus size={14} />
            }
          >
            {isSaved ? 'Saved' : saving ? 'Saving...' : 'Save Contact'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => { e.stopPropagation(); onAddToList(lead); }}
            iconLeft={<List size={14} />}
          >
            Add to List
          </Button>
        </div>
      </div>
    </Panel>
  );
}

// ==================== Filters Panel ====================
function FiltersPanel({ filters, setFilters, lists, onClear }) {
  const activeCount = Object.values(filters).filter(v => v !== '').length;
  return (
    <Panel
      icon={<Filter size={14} />}
      title="Filters"
      actions={
        activeCount > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Chip tone="brand">{activeCount}</Chip>
            <Button variant="ghost" size="sm" onClick={onClear}>Clear all</Button>
          </div>
        ) : null
      }
      style={{ position: 'sticky', top: 32 }}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <Field label="Company" htmlFor="fp-company">
          <Input
            id="fp-company"
            type="text"
            value={filters.company}
            onChange={(e) => setFilters(f => ({ ...f, company: e.target.value }))}
            placeholder="e.g. Google, TCS"
          />
        </Field>

        <Field label="Location" htmlFor="fp-location">
          <Input
            id="fp-location"
            type="text"
            value={filters.location}
            onChange={(e) => setFilters(f => ({ ...f, location: e.target.value }))}
            placeholder="e.g. Mumbai, India"
          />
        </Field>

        <Field label="Job Title" htmlFor="fp-title">
          <Input
            id="fp-title"
            type="text"
            value={filters.title}
            onChange={(e) => setFilters(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. HR Manager, CTO"
          />
        </Field>

        <Field label="Profile Type" htmlFor="fp-type">
          <Select id="fp-type" value={filters.profileType} onChange={(e) => setFilters(f => ({ ...f, profileType: e.target.value }))}>
            <option value="">All Types</option>
            <option value="client">Client</option>
            <option value="candidate">Candidate</option>
          </Select>
        </Field>

        <Field label="Email Status" htmlFor="fp-email">
          <Select id="fp-email" value={filters.emailStatus} onChange={(e) => setFilters(f => ({ ...f, emailStatus: e.target.value }))}>
            <option value="">Any</option>
            <option value="has_email">Has Email</option>
            <option value="verified">Verified Email</option>
            <option value="no_email">No Email</option>
          </Select>
        </Field>

        {lists.length > 0 && (
          <Field label="List" htmlFor="fp-list">
            <Select id="fp-list" value={filters.listName} onChange={(e) => setFilters(f => ({ ...f, listName: e.target.value }))}>
              <option value="">All Lists</option>
              {lists.map(l => (
                <option key={l.name} value={l.name}>{l.name} ({l.count || 0})</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Panel>
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
    <Modal
      open
      size="sm"
      onClose={onClose}
      icon={<List size={18} />}
      title="Add to List"
      sub={lead.name}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ maxHeight: 240, overflowY: 'auto', margin: '0 -4px' }}>
          {lists.length === 0 ? (
            <p style={{ ...metaStyle, textAlign: 'center', padding: '16px 0' }}>No lists yet. Create one below.</p>
          ) : (
            <div style={{ display: 'grid', gap: 2 }}>
              {lists.map((list) => (
                <button
                  key={list.name}
                  onClick={() => onSelect(list.name)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '10px 12px', cursor: 'pointer',
                    borderRadius: 'var(--r-2, 12px)', background: 'none', border: 0,
                    ...bodyStyle, color: 'var(--fg-2)',
                  }}
                >
                  <span style={truncate}>{list.name}</span>
                  <span style={{ ...metaStyle, flexShrink: 0, marginLeft: 8 }}>{list.count || 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid var(--line-2)' }}>
          <Input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Create new list..."
            style={{ flex: 1 }}
            aria-label="New list name"
          />
          <Button
            onClick={handleCreate}
            disabled={!newListName.trim() || creating}
            aria-label="Create list"
            iconLeft={creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          />
        </div>
      </div>
    </Modal>
  );
}

// ==================== Main Dashboard Page ====================
function DashboardPageV2() {
  const { user, isAuthenticated } = useAuth();
  const { hasAppAccess, currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { installed: extInstalled, dismiss: dismissExt, isDismissed: isExtDismissed, chromeStoreUrl } = useExtensionDetector();
  const [extBannerDismissed, setExtBannerDismissed] = useState(false);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState('');
  const [savedLeadsCount, setSavedLeadsCount] = useState(0);
  const [lists, setLists] = useState([]);
  const [gmailStatus, setGmailStatus] = useState(null);
  const [sequencesCount, setSequencesCount] = useState(null);
  const [emailsToday, setEmailsToday] = useState(null);

  // First-run checklist for new workspaces (shared with the home launcher).
  const { data: gettingStarted, dismissed: gsDismissed, dismiss: dismissGettingStarted } = useGettingStarted(currentOrg?.slug);

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

  // Detail panel — synced with ?lead=<id> query param for shareable URLs
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedLead, setSelectedLead] = useState(null);
  const leadIdParam = searchParams.get('lead');

  const openLead = useCallback((lead) => {
    setSelectedLead(lead);
    const next = new URLSearchParams(searchParams);
    next.set('lead', lead._id);
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const closeLead = useCallback(() => {
    setSelectedLead(null);
    const next = new URLSearchParams(searchParams);
    next.delete('lead');
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  // Sync ?lead=<id> with selectedLead. If the leadId points to a record
  // not in any currently-loaded section, fetch it standalone.
  useEffect(() => {
    if (!leadIdParam) {
      if (selectedLead) setSelectedLead(null);
      return;
    }
    if (selectedLead?._id === leadIdParam) return;
    let cancelled = false;
    api.getLead(leadIdParam)
      .then(res => {
        if (cancelled) return;
        const lead = res?.lead || res?.data || (res?._id ? res : null);
        if (lead) setSelectedLead(lead);
        else {
          const next = new URLSearchParams(searchParams);
          next.delete('lead');
          setSearchParams(next, { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams);
        next.delete('lead');
        setSearchParams(next, { replace: true });
      });
    return () => { cancelled = true; };
  }, [leadIdParam, selectedLead, searchParams, setSearchParams]);

  // Save & Add to List
  const [savedLeadIds, setSavedLeadIds] = useState(new Set());
  const [savingLeadId, setSavingLeadId] = useState(null);
  const [listModalLead, setListModalLead] = useState(null);

  // ---- Dashboard data fetch ----
  const fetchData = useCallback(async () => {
    try {
      const [featuresRes, leadsRes, listsRes, gmailRes, seqRes, emailsRes] = await Promise.all([
        api.getFeatures(),
        api.getLeads({ limit: 1 }).catch(() => ({ total: 0 })),
        api.getLists().catch(() => ({ lists: [] })),
        api.getGmailStatus().catch(() => null),
        api.getSequences().catch(() => null),
        api.getEmailsSentToday().catch(() => null),
      ]);

      if (featuresRes.success) setFeatures(featuresRes);
      setSavedLeadsCount(leadsRes.total || 0);
      setLists(listsRes.lists || []);
      setGmailStatus(gmailRes);
      setSequencesCount(seqRes?.sequences ? seqRes.sequences.length : null);
      setEmailsToday(emailsRes?.success ? emailsRes : null);
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

  // Paid access is granted at the org level (enabledApps → membership appAccess),
  // so org-provisioned users have no legacy user.plan. isPro covers outreach AI
  // features; canExportCrm mirrors the backend's requireAppAccess('crm') gate on
  // the convert-lead endpoint so the UI never offers an export the API will 403.
  const isPro = hasAppAccess('outreach') || user?.plan === 'pro' || user?.plan === 'premium';
  const canExportCrm = hasAppAccess('crm') || user?.plan === 'pro' || user?.plan === 'premium';

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
      <div style={{ minHeight: '100vh' }}>
        <div style={{ padding: 'clamp(12px, 2vw, 24px)' }}>
          {/* ======== WELCOME SECTION ======== */}
          <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 32 }}>
            <h1 style={{ font: "700 26px/1.16 'Inter', system-ui, sans-serif", letterSpacing: '-0.02em', color: 'var(--fg)', margin: '0 0 8px' }}>
              Welcome, {user?.name?.split(' ')[0] || 'there'}
            </h1>
            <p style={bodyStyle}>
              Search and explore contacts and companies to get smarter recommendations as you go
            </p>
          </div>

          {/* ======== SEARCH BAR ======== */}
          <div style={{ maxWidth: 672, margin: '0 auto 32px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 12,
              borderRadius: 'var(--r-3, 14px)', background: 'var(--surface-2)',
              boxShadow: '0 0 0 1px var(--line)',
            }}>
              <Select
                value={searchMode}
                onChange={(e) => { setSearchMode(e.target.value); setSearchResults([]); }}
                aria-label="Search mode"
                style={{ width: 'auto', height: 32, background: 'transparent', boxShadow: 'none', paddingLeft: 0 }}
              >
                <option value="contacts">Contacts</option>
                <option value="companies">Companies</option>
              </Select>
              <span style={{ width: 1, height: 20, background: 'var(--line-2)', flexShrink: 0 }} />
              <Search size={20} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder={searchMode === 'contacts' ? 'Search by name, email, company, title...' : 'Search companies by name...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && performSearch(1)}
                style={{
                  flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none',
                  color: 'var(--fg)', font: "450 14px/1.4 'Inter', system-ui, sans-serif",
                }}
              />
              {(searchQuery || isSearchActive) && (
                <Button variant="ghost" size="sm" onClick={clearSearch} aria-label="Clear search" iconLeft={<X size={16} />} />
              )}
            </div>
          </div>

          {/* ======== CONDITIONAL CONTENT ======== */}
          {isSearchActive ? (
            /* ==================== SEARCH RESULTS VIEW ==================== */
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              {/* LEFT: Filters Panel (contacts only) */}
              {searchMode === 'contacts' && (
                <div className="hidden lg:block" style={{ width: 288, flexShrink: 0 }}>
                  <FiltersPanel
                    filters={filters}
                    setFilters={setFilters}
                    lists={lists}
                    onClear={() => setFilters({ location: '', title: '', profileType: '', company: '', emailStatus: '', listName: '' })}
                  />
                </div>
              )}

              {/* RIGHT: Results */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Results Header */}
                <div style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                  justifyContent: 'space-between', gap: 8, marginBottom: 24,
                }}>
                  <p style={bodyStyle}>
                    {searchLoading ? 'Searching...' : (
                      <>
                        <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{searchTotal.toLocaleString()}</span>
                        {' '}{searchMode === 'contacts' ? 'contacts' : 'companies'} found
                      </>
                    )}
                  </p>
                  {searchMode === 'contacts' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (searchResults.length > 0) exportLeadsToCSV(searchResults, 'rivvra-search');
                        }}
                        disabled={searchResults.length === 0 || searchLoading}
                        iconLeft={<Download size={16} />}
                      >
                        Export
                      </Button>
                      <Select
                        value={`${sortBy}_${sortDir}`}
                        aria-label="Sort results"
                        onChange={(e) => {
                          const [s, d] = e.target.value.split('_');
                          setSortBy(s);
                          setSortDir(d);
                        }}
                        style={{ width: 'auto', height: 30 }}
                      >
                        <option value="createdAt_desc">Newest First</option>
                        <option value="createdAt_asc">Oldest First</option>
                        <option value="name_asc">Name A-Z</option>
                        <option value="name_desc">Name Z-A</option>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Results Grid */}
                {searchLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
                    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--brand-ink)' }} />
                    <p style={metaStyle}>Searching contacts...</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <EmptyState icon={<Search size={28} />} title="No results found">
                    Try adjusting your search or filters
                  </EmptyState>
                ) : searchMode === 'contacts' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {searchResults.map(lead => (
                      <LeadSearchCard
                        key={lead._id}
                        lead={lead}
                        onClick={() => openLead(lead)}
                        onSave={handleSaveContact}
                        onAddToList={(lead) => setListModalLead(lead)}
                        isSaved={savedLeadIds.has(lead._id)}
                        saving={savingLeadId === lead._id}
                      />
                    ))}
                  </div>
                ) : (
                  /* Companies results */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {searchResults.map(company => (
                      <Panel key={company._id}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 4 }}>
                          {company.logo ? (
                            <img src={company.logo} alt="" style={{ width: 40, height: 40, borderRadius: 'var(--r-2, 12px)', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <span style={{
                              width: 40, height: 40, borderRadius: 'var(--r-2, 12px)', flexShrink: 0,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--surface-3)', color: 'var(--fg-4)',
                            }}>
                              <Building2 size={20} />
                            </span>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ ...bodyStyle, fontWeight: 550, color: 'var(--fg)', ...truncate }}>{company.name}</p>
                            {company.industry && <p style={{ ...metaStyle, ...truncate }}>{company.industry}</p>}
                            {company.employeeCount && <p style={metaStyle}>{company.employeeCount} employees</p>}
                            {company.domain && (
                              <p style={{ ...metaStyle, color: 'var(--brand-ink)', marginTop: 4, ...truncate }}>{company.domain}</p>
                            )}
                          </div>
                        </div>
                      </Panel>
                    ))}
                  </div>
                )}

                {/* Pagination — ds range + prev/next. `searchTotalPages` keeps
                    the legacy `if (totalPages <= 1) return null;` gate. */}
                {searchMode === 'contacts' && searchTotalPages > 1 && (
                  <div style={{ marginTop: 32 }}>
                    <Pagination
                      page={searchPage}
                      pageSize={25}
                      total={searchTotal}
                      onPageChange={handlePageChange}
                      noun="contact"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ==================== DEFAULT DASHBOARD VIEW ==================== */
            <>
              {/* Gmail disconnected while sequences exist: enrollments pause
                  SILENTLY server-side (no Resend fallback for outreach) — this
                  banner is the only user-visible signal that sending stopped. */}
              {!loading && gmailStatus && !gmailStatus.connected && (sequencesCount || 0) > 0 && (
                <Callout tone="warn" style={{ marginBottom: 16 }} title="Gmail is not connected — your sequences are paused">
                  <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: '0 0 8px' }}>
                    Enrollments won't send any emails until Gmail is reconnected. They resume automatically once connected.
                  </p>
                  <Button as="a" href={orgPath('/outreach/engage')} variant="secondary" size="sm">
                    Connect Gmail
                  </Button>
                </Callout>
              )}

              {/* Onboarding hub teaser — the task list itself lives on
                  /getting-started, reachable from the sidebar rail. */}
              {gettingStarted && !gsDismissed && (
                <OnboardingHubTeaser
                  data={gettingStarted}
                  orgPath={orgPath}
                  enabledApps={currentOrg?.enabledApps}
                  onDismiss={dismissGettingStarted}
                />
              )}

              {/* Outreach Get Started Checklist — narrower; hidden while the
                  platform-wide first-run card above is showing */}
              {!gettingStarted && !loading && gmailStatus && sequencesCount !== null && (
                <OutreachGetStarted
                  gmailConnected={!!gmailStatus.connected}
                  contactsCount={savedLeadsCount}
                  sequencesCount={sequencesCount}
                  orgPath={orgPath}
                />
              )}

              {/* Hiring Signals (2026-08-20) — fresh postings at watched companies.
                  Ported from the legacy dashboard 2026-08-22. The card is still
                  legacy Tailwind, and stays that way on purpose: this page renders
                  inside PlatformLayoutV2's `.ds-shell`, where legacy-bridge.css
                  remaps the dark-* scale onto ds tokens. Forking it to ds would
                  duplicate a component `main` is still actively changing. */}
              {currentOrg?.slug && <HiringSignalsCard orgSlug={currentOrg.slug} />}

              {/* Extension Install Banner */}
              {!extInstalled && !extBannerDismissed && !isExtDismissed() && (
                <div style={{ marginBottom: 32 }}>
                  <Panel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: 4 }}>
                      <span style={{
                        width: 56, height: 56, borderRadius: 'var(--r-3, 14px)', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--acc-blue-soft, var(--surface-3))', color: 'var(--acc-blue, var(--fg-2))',
                      }}>
                        <Chrome size={28} />
                      </span>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <h3 style={h3Style}>Install the Rivvra Chrome Extension</h3>
                        <p style={{ ...bodyStyle, marginTop: 4 }}>
                          Extract contacts directly from LinkedIn profiles, searches, and Sales Navigator. The extension is required for the Outreach app.
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                        <Button variant="ghost" onClick={() => { dismissExt(); setExtBannerDismissed(true); }}>
                          Remind Me Later
                        </Button>
                        <Button
                          as="a" href={chromeStoreUrl} target="_blank" rel="noopener noreferrer"
                          iconLeft={<Chrome size={16} />} iconRight={<ExternalLink size={14} />}
                        >
                          Install Extension
                        </Button>
                      </div>
                    </div>
                  </Panel>
                </div>
              )}

              {/* Recommended Leads Section */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                  <Sparkles size={20} style={{ color: 'var(--warn-ink)' }} />
                  <h2 style={h2Style}>Recommended contacts tailored just for you</h2>
                  <Chip tone="brand">Beta</Chip>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
                  {/* Similar to your reveals — Contacts / Companies. Both are
                      placeholders; the copy says Coming Soon on purpose. */}
                  {[
                    { title: 'Similar to your reveals', kind: 'Contacts', icon: <Users size={28} />, line1: 'AI-powered contact recommendations', line2: 'Based on your saved contacts' },
                    { title: 'Similar to your reveals', kind: 'Companies', icon: <Building2 size={28} />, line1: 'AI-powered company recommendations', line2: 'Based on your extracted companies' },
                  ].map((card) => (
                    <Panel key={card.kind}>
                      <div style={{ padding: 4 }}>
                        <div style={{ marginBottom: 16 }}>
                          <h3 style={h3Style}>{card.title}</h3>
                          <p style={{ ...metaStyle, marginTop: 2 }}>
                            {card.kind} &bull; <span style={{ color: 'var(--warn-ink)' }}>Coming Soon</span>
                          </p>
                        </div>
                        <div style={{ textAlign: 'center', padding: '32px 0' }}>
                          <span style={{
                            width: 56, height: 56, borderRadius: 99, margin: '0 auto 12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--surface-3)', color: 'var(--fg-4)',
                          }}>
                            {card.icon}
                          </span>
                          <p style={{ ...bodyStyle, marginBottom: 4 }}>{card.line1}</p>
                          <p style={metaStyle}>{card.line2}</p>
                        </div>
                      </div>
                    </Panel>
                  ))}

                  {/* Suggested based on CRM */}
                  <Panel>
                    <div style={{ padding: 4 }}>
                      <div style={{ marginBottom: 16 }}>
                        <h3 style={h3Style}>Suggested based on your CRM</h3>
                      </div>
                      <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <span style={{
                          width: 64, height: 64, borderRadius: 99, margin: '0 auto 16px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--surface-3)', color: 'var(--fg-4)',
                        }}>
                          <Building2 size={32} />
                        </span>
                        <p style={{ ...bodyStyle, marginBottom: 8 }}>Connect your CRM to enable AI recommendations</p>
                        <p style={{ ...metaStyle, marginBottom: 16 }}>Supports HubSpot, Salesforce, Odoo &amp; more</p>
                        <Button onClick={() => handleFeatureClick('CRM Integration')}>Connect CRM</Button>
                      </div>
                    </div>
                  </Panel>
                </div>
              </div>

              {/* Daily email quota (only once Gmail is connected).
                  The arithmetic below is carried across from legacy unchanged —
                  it decides whether a user is told their queued sequence emails
                  have stopped going out. */}
              {emailsToday && gmailStatus?.connected && (() => {
                const userLimit = emailsToday.limit || 0;
                const orgLimit = emailsToday.org?.limit ?? null;
                const effectiveLimit = orgLimit !== null ? Math.min(userLimit, orgLimit) : userLimit;
                const orgBound = orgLimit !== null && orgLimit < userLimit;
                const sent = orgBound ? (emailsToday.org?.sent || 0) : (emailsToday.sent || 0);
                const pct = effectiveLimit > 0 ? Math.min(100, Math.round((sent / effectiveLimit) * 100)) : 0;
                const atLimit = effectiveLimit > 0 && sent >= effectiveLimit;
                const nearLimit = !atLimit && pct >= 80;
                const ink = atLimit ? 'var(--danger)' : nearLimit ? 'var(--warn-ink)' : 'var(--fg-3)';
                return (
                  <div style={{
                    marginBottom: 32, padding: '16px 20px', borderRadius: 'var(--r-3, 14px)',
                    background: atLimit ? 'var(--danger-soft)' : nearLimit ? 'var(--warn-soft)' : 'var(--surface-2)',
                    boxShadow: `inset 0 0 0 1px ${atLimit ? 'var(--danger-line, var(--line-2))' : nearLimit ? 'var(--warn-line, var(--line-2))' : 'var(--line-2)'}`,
                  }}>
                    <Meter
                      value={pct}
                      color={atLimit ? 'var(--danger)' : nearLimit ? 'var(--warn-ink)' : undefined}
                      label={
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Mail size={16} style={{ color: ink }} />
                          <span style={{ font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>Emails sent today</span>
                          {orgBound && <span style={metaStyle}>(org-wide plan limit)</span>}
                        </span>
                      }
                      readout={<span style={{ font: "600 13px/1.4 'Inter', system-ui, sans-serif", color: ink }}>{sent} / {effectiveLimit}</span>}
                    />
                    {atLimit && (
                      <p style={{ ...metaStyle, color: 'var(--danger)', marginTop: 8 }}>
                        Daily email limit reached — queued sequence emails will resume sending tomorrow.{orgBound ? ' Upgrade your plan to raise the org-wide limit.' : ' You can raise your personal limit in Outreach settings.'}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Quick Stats Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
                {[
                  { label: 'Contacts Saved', value: savedLeadsCount || 0, icon: Users, color: 'var(--brand)', cta: 'Extract your first contact →' },
                  { label: 'Emails Generated', value: features?.usage?.emailsGenerated || 0, icon: Mail, color: 'var(--acc-blue, var(--brand))', locked: !isPro, cta: 'Generate your first email →' },
                  { label: 'DMs Generated', value: features?.usage?.dmsGenerated || 0, icon: MessageSquare, color: 'var(--acc-purple, var(--brand))', locked: !isPro, cta: 'Generate your first DM →' },
                  { label: 'CRM Exports', value: features?.usage?.crmExports || 0, icon: Building2, color: 'var(--warn-ink)', locked: !canExportCrm, cta: 'Export to your CRM →' },
                ].map((stat, i) => (
                  <Stat
                    key={i}
                    icon={<stat.icon size={16} />}
                    color={stat.color}
                    value={stat.value}
                    label={
                      stat.locked ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {stat.label}
                          <Lock size={12} style={{ color: 'var(--fg-4)' }} />
                        </span>
                      ) : stat.label
                    }
                    note={stat.value === 0 && !stat.locked ? stat.cta : undefined}
                  />
                ))}
              </div>

              {/* Bottom Row - Lists and Getting Started */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                {/* My Lists */}
                <Panel
                  title="My Lists"
                  actions={
                    <Button as="a" href={orgPath('/outreach/lists')} variant="ghost" size="sm" iconRight={<ChevronRight size={16} />}>
                      View all
                    </Button>
                  }
                >
                  {lists.length === 0 ? (
                    <EmptyState
                      compact
                      icon={<List size={24} />}
                      title="No lists yet"
                      actions={
                        <Button as="a" href={orgPath('/outreach/lists')} variant="secondary" iconLeft={<Plus size={16} />}>
                          Create List
                        </Button>
                      }
                    />
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {lists.slice(0, 4).map((list, idx) => (
                        <Link
                          key={idx}
                          to={orgPath(`/outreach/lists?list=${encodeURIComponent(list.name)}`)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                            padding: 12, borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)',
                            ...bodyStyle, color: 'var(--fg)',
                          }}
                        >
                          <span style={truncate}>{list.name}</span>
                          <span style={{ ...metaStyle, flexShrink: 0 }}>{list.count || 0} contacts</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </Panel>

                {/* Chrome Extension CTA */}
                {extInstalled ? (
                  <Panel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 4 }}>
                      <span style={{
                        width: 48, height: 48, borderRadius: 'var(--r-3, 14px)', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--brand-soft)', color: 'var(--brand-ink)',
                      }}>
                        <CheckCircle2 size={24} />
                      </span>
                      <div>
                        <h3 style={h3Style}>Extension Connected</h3>
                        <p style={{ ...metaStyle, marginTop: 2 }}>Rivvra Chrome Extension is active</p>
                      </div>
                    </div>
                  </Panel>
                ) : (
                  <Panel>
                    <div style={{ padding: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                        <span style={{
                          width: 48, height: 48, borderRadius: 'var(--r-3, 14px)', flexShrink: 0,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--brand-soft)', color: 'var(--brand-ink)',
                        }}>
                          <Chrome size={24} />
                        </span>
                        <div>
                          <h3 style={h3Style}>Chrome Extension</h3>
                          <p style={{ ...metaStyle, marginTop: 2 }}>Extract contacts directly from LinkedIn</p>
                        </div>
                      </div>
                      <p style={{ ...bodyStyle, marginBottom: 16 }}>
                        Install our Chrome extension to start extracting contacts from LinkedIn profiles, searches, and Sales Navigator.
                      </p>
                      <Button
                        as="a" href={chromeStoreUrl} target="_blank" rel="noopener noreferrer"
                        iconRight={<ExternalLink size={16} />}
                      >
                        Install Extension
                      </Button>
                    </div>
                  </Panel>
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
          onClose={closeLead}
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

export default DashboardPageV2;
