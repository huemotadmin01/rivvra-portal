import { useState, useEffect } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { getPTMaster, seedPTMaster, updatePTMasterConfig, getPayrollSettings, updatePayrollSettings } from '../../utils/payrollApi';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/formatCurrency';
import { MapPin, Plus, Save, X, ChevronDown, ChevronRight, Settings2, Loader2, Search } from 'lucide-react';
import {
  PageHeader, Panel, Chip, Button, Select, Input, Callout, EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// Professional-tax slabs, per state, per financial year — the table payroll
// reads to decide how much PT to deduct. Statutory money config, so everything
// above `return (` is spliced in from the legacy file verbatim, including the
// slab-index bookkeeping whose comment explains why display sorting must not
// disturb the stored order.
//
// This page is DUAL-USE: a `/payroll/pt-master` route and the `pt` tab inside
// components/settings/SettingsPayroll. Both entry points are switched together
// via the shared PageSwitch, so the same feature can't render two different
// UIs depending on how you reached it. The `embedded` prop is preserved.
// ─────────────────────────────────────────────────────────────────────────────

// Show the state search box only once the list is long enough to be worth it.
const STATE_SEARCH_THRESHOLD = 8;

const fyLabel = (startYear) => `${startYear}-${String(startYear + 1).slice(2)}`;

// FY start year from local date parts (never toISOString — that shifts the
// day/year for viewers behind UTC). India FY starts in April.
const CURRENT_FY_START = (() => {
  const now = new Date();
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
})();

const CURRENT_FY = fyLabel(CURRENT_FY_START);

// Rolling window around the current FY instead of three hardcoded years, which
// silently went stale (and made older/newer FYs unreachable).
const FY_OPTIONS = (() => {
  const out = [];
  for (let y = CURRENT_FY_START - 3; y <= CURRENT_FY_START + 1; y++) out.push(fyLabel(y));
  return out;
})();

export default function PTMasterPageV2({ embedded = false }) {
  const { orgSlug } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [fy, setFy] = useState(CURRENT_FY);
  const [expandedState, setExpandedState] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [defaultPtState, setDefaultPtState] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Client-side filter over the states already loaded — no extra API calls.
  const [stateSearch, setStateSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setConfigs([]);
    setDefaultPtState('');
    setLoadError(null);
    try {
      const [res, settingsRes] = await Promise.all([
        getPTMaster(orgSlug, fy),
        getPayrollSettings(orgSlug),
      ]);
      setConfigs(res.configs || []);
      setDefaultPtState(settingsRes.settings?.defaultPtState || '');
    } catch (err) {
      // Without an explicit error state a transient failure fell through to the
      // "Load Default PT Slabs" empty state, inviting a destructive re-seed on
      // top of slabs that actually exist.
      setLoadError(err.response?.data?.message || 'Failed to load PT Master');
      showToast('Failed to load PT Master', 'error');
    }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [orgSlug, currentCompany?._id, fy]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await seedPTMaster(orgSlug, fy);
      showToast(res.message || 'Seeded successfully', 'success');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to seed', 'error');
    } finally { setSeeding(false); }
  };

  const startEdit = (config) => {
    setEditingId(config._id);
    setEditForm({
      slabs: config.slabs.map(s => ({ ...s })),
      februaryAdjustment: config.februaryAdjustment,
      februaryExtraTax: config.februaryExtraTax ? { ...config.februaryExtraTax } : null,
      annualCap: config.annualCap,
      isActive: config.isActive,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePTMasterConfig(orgSlug, editingId, editForm);
      showToast('PT config updated', 'success');
      setEditingId(null);
      load();
    } catch (err) { showToast('Failed to update', 'error'); }
    finally { setSaving(false); }
  };

  const saveDefaultState = async () => {
    setSavingSettings(true);
    try {
      await updatePayrollSettings(orgSlug, { defaultPtState });
      showToast('Default PT state saved', 'success');
    } catch (err) { showToast('Failed to save', 'error'); }
    finally { setSavingSettings(false); }
  };

  // `== null` so an absent value reads as "No limit" rather than ₹NaN.
  const fmtCurrency = (n) => n == null ? 'No limit' : formatMoney(n);

  const stateQuery = stateSearch.trim().toLowerCase();
  const visibleConfigs = !stateQuery ? configs : configs.filter(c =>
    (c.stateName || '').toLowerCase().includes(stateQuery) ||
    (c.stateCode || '').toLowerCase().includes(stateQuery)
  );

  if (loading) return <PageSpinner label="Loading professional-tax slabs…" />;

  const fySelect = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Financial year</span>
      <Select
        value={fy}
        onChange={e => setFy(e.target.value)}
        title="Slabs are versioned per financial year"
        aria-label="Financial year"
        style={{ width: 130 }}
      >
        {(FY_OPTIONS.includes(fy) ? FY_OPTIONS : [fy, ...FY_OPTIONS]).map(f => (
          <option key={f} value={f}>FY {f}</option>
        ))}
      </Select>
    </span>
  );

  const cell = { padding: '7px 0', fontVariantNumeric: 'tabular-nums' };
  const th = {
    textAlign: 'left', padding: '6px 0',
    font: "500 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
  };

  return (
    <div style={embedded ? { display: 'grid', gap: 14 } : { maxWidth: 1040, margin: '0 auto' }}>
      {embedded
        ? <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{fySelect}</div>
        : (
          <PageHeader
            title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><MapPin size={18} style={{ color: 'var(--brand-ink)' }} /> Professional Tax (PT) Slabs</span>}
            sub="The monthly PT each state charges, by salary band — payroll picks the slab that matches an employee's gross"
            actions={fySelect}
          />
        )}

      <div style={{ display: 'grid', gap: 14 }}>

        {/* ── Default PT state ── */}
        <Panel>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Settings2 size={15} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
            <span style={{ font: "600 13px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>Default PT state</span>
            <span style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              Fallback used when an employee has no PT state of their own
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <Select
              value={defaultPtState}
              onChange={e => setDefaultPtState(e.target.value)}
              aria-label="Default PT state"
              style={{ maxWidth: 280 }}
            >
              <option value="">-- Not Set --</option>
              {configs.map(c => (
                <option key={c.stateCode} value={c.stateCode}>{c.stateName} ({c.stateCode})</option>
              ))}
            </Select>
            <Button size="sm" onClick={saveDefaultState} disabled={savingSettings}>
              {savingSettings ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </Panel>

        {/* ── Load failure — never fall through to the seed empty-state ── */}
        {loadError && (
          <Panel>
            <div style={{ textAlign: 'center', padding: '20px 12px' }}>
              <p style={{ font: "500 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: 0 }}>{loadError}</p>
              <p style={{ font: "400 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '6px 0 14px' }}>
                PT slabs could not be loaded — this is not an empty configuration.
              </p>
              <Button variant="secondary" size="sm" onClick={load}>Retry</Button>
            </div>
          </Panel>
        )}

        {/* ── Empty state — seed ── */}
        {!loadError && configs.length === 0 && (
          <Panel>
            <EmptyState
              icon={<MapPin size={22} />}
              title={`No professional-tax slabs configured for FY ${fy}`}
              actions={(
                <Button
                  size="sm"
                  onClick={handleSeed}
                  disabled={seeding}
                  iconLeft={seeding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                >
                  {seeding ? 'Loading...' : 'Load Default PT Slabs'}
                </Button>
              )}
            >
              {"Load Rivvra's published state slabs to start from, then edit any state whose rates differ. Until slabs exist for this FY, payroll deducts no professional tax."}
            </EmptyState>
          </Panel>
        )}

        {/* ── State search — only worth showing on a long list ── */}
        {configs.length >= STATE_SEARCH_THRESHOLD && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', maxWidth: 300, width: '100%' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
              <Input
                type="text"
                value={stateSearch}
                onChange={e => setStateSearch(e.target.value)}
                placeholder="Find a state (name or code)…"
                aria-label="Find a state"
                style={{ paddingLeft: 30 }}
              />
            </div>
            <span style={{ font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              {visibleConfigs.length} of {configs.length} states
            </span>
          </div>
        )}

        {configs.length > 0 && visibleConfigs.length === 0 && (
          <Panel>
            <EmptyState
              title={`No state matches “${stateSearch}”`}
              actions={<Button variant="ghost" size="sm" onClick={() => setStateSearch('')}>Clear search</Button>}
            />
          </Panel>
        )}

        {/* ── PT configs ── */}
        {visibleConfigs.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {visibleConfigs.map(config => {
              const isExpanded = expandedState === config._id;
              const isEditing = editingId === config._id;
              // Keep each slab's ORIGINAL index alongside it so immutable updates
              // still address the right row after a display-only sort. While
              // editing we leave the stored order alone, otherwise a row would
              // jump under the cursor as soon as its "from" value is typed.
              const slabSource = isEditing ? editForm.slabs : config.slabs;
              const slabRows = (slabSource || []).map((slab, idx) => ({ slab, idx }));
              if (!isEditing) slabRows.sort((a, b) => (Number(a.slab.min) || 0) - (Number(b.slab.min) || 0));

              return (
                <Panel key={config._id} flush>
                  {/* State header */}
                  <div
                    onClick={() => setExpandedState(isExpanded ? null : config._id)}
                    style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, padding: '12px 14px', cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      {isExpanded
                        ? <ChevronDown size={15} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                        : <ChevronRight size={15} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />}
                      <span style={{ font: "600 13px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>{config.stateName}</span>
                      <Chip>{config.stateCode}</Chip>
                      {!config.isActive && <Chip tone="danger">Inactive</Chip>}
                      {config.februaryAdjustment && (
                        <span title="This state charges a different amount in February">
                          <Chip tone="warn">February adjustment</Chip>
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                      <span title="Maximum professional tax this state can charge in a full year" style={{ whiteSpace: 'nowrap' }}>
                        Annual cap {fmtCurrency(config.annualCap)}
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {config.slabs.length} slab{config.slabs.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--line-2)', padding: '4px 14px 14px' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', marginTop: 10, font: "400 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
                          <thead>
                            <tr>
                              <th style={{ ...th, width: 32 }}>#</th>
                              <th style={th}>Monthly gross from</th>
                              <th style={th}>Monthly gross up to</th>
                              <th style={{ ...th, textAlign: 'right' }}>PT deducted per month</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slabRows.map(({ slab, idx }, row) => (
                              <tr key={idx} style={{ borderTop: '1px solid var(--line-2)' }}>
                                <td style={{ ...cell, color: 'var(--fg-4)', font: "400 11px/1 'Inter', system-ui, sans-serif" }}>{row + 1}</td>
                                <td style={cell}>
                                  {isEditing ? (
                                    <Input type="number" value={slab.min} aria-label={`Slab ${row + 1} from`} style={{ width: 112 }} onChange={e => {
                                      const v = Number(e.target.value);
                                      setEditForm(f => ({ ...f, slabs: f.slabs.map((sl, i) => i === idx ? { ...sl, min: v } : sl) }));
                                    }} />
                                  ) : fmtCurrency(slab.min)}
                                </td>
                                <td style={cell}>
                                  {isEditing ? (
                                    <Input type="number" value={slab.max ?? ''} placeholder="No limit" aria-label={`Slab ${row + 1} up to`} style={{ width: 112 }} onChange={e => {
                                      const v = e.target.value === '' ? null : Number(e.target.value);
                                      setEditForm(f => ({ ...f, slabs: f.slabs.map((sl, i) => i === idx ? { ...sl, max: v } : sl) }));
                                    }} />
                                  ) : fmtCurrency(slab.max)}
                                </td>
                                <td style={{ ...cell, textAlign: 'right', fontWeight: 500, color: 'var(--fg)' }}>
                                  {isEditing ? (
                                    <Input type="number" value={slab.tax} aria-label={`Slab ${row + 1} PT`} style={{ width: 96, textAlign: 'right' }} onChange={e => {
                                      const v = Number(e.target.value);
                                      setEditForm(f => ({ ...f, slabs: f.slabs.map((sl, i) => i === idx ? { ...sl, tax: v } : sl) }));
                                    }} />
                                  ) : formatMoney(slab.tax)}
                                </td>
                              </tr>
                            ))}
                            {slabRows.length === 0 && (
                              <tr style={{ borderTop: '1px solid var(--line-2)' }}>
                                <td colSpan={4} style={{ padding: '14px 0', textAlign: 'center', font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                                  This state has no slabs — payroll will deduct no PT for it.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {!isEditing && slabRows.length > 0 && (
                        <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '8px 0 0' }}>
                          Bands are shown lowest first. An employee pays the row their monthly gross falls into.
                        </p>
                      )}

                      {/* February adjustment */}
                      {(isEditing ? editForm.februaryAdjustment : config.februaryAdjustment) && (
                        <div style={{ marginTop: 12 }}>
                          <Callout tone="warn" title="February adjustment">
                            {isEditing ? (
                              <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <span>Applies from monthly gross:</span>
                                <Input type="number" aria-label="February adjustment threshold" style={{ width: 112 }}
                                  value={editForm.februaryExtraTax?.minSalary || ''} onChange={e => {
                                    setEditForm(f => ({ ...f, februaryExtraTax: { ...f.februaryExtraTax, minSalary: Number(e.target.value) } }));
                                  }} />
                                <span>February PT:</span>
                                <Input type="number" aria-label="February PT" style={{ width: 96 }}
                                  value={editForm.februaryExtraTax?.tax || ''} onChange={e => {
                                    setEditForm(f => ({ ...f, februaryExtraTax: { ...f.februaryExtraTax, tax: Number(e.target.value) } }));
                                  }} />
                              </span>
                            ) : (
                              <>In February, a monthly gross of {fmtCurrency(config.februaryExtraTax?.minSalary)} or more is charged {formatMoney(config.februaryExtraTax?.tax)}.</>
                            )}
                          </Callout>
                        </div>
                      )}

                      {config.notes && (
                        <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontStyle: 'italic', margin: '8px 0 0' }}>
                          {config.notes}
                        </p>
                      )}

                      {/* Actions */}
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isEditing ? (
                          <>
                            <Button size="sm" onClick={handleSave} disabled={saving}
                              iconLeft={saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}>
                              {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingId(null)} iconLeft={<X size={13} />}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => startEdit(config)}>Edit Slabs</Button>
                        )}
                      </div>
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
