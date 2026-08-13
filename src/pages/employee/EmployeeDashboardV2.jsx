// ============================================================================
// EmployeeDashboardV2.jsx — HR dashboard on ds (phase 7)
// ============================================================================
// Copied from EmployeeDashboard.jsx. Untouched: `periodToDates` and its
// month-boundary arithmetic (note `new Date(y, m + 1, 0)` for end-of-month,
// which is deliberate), the byType object→array normalisation the backend
// shape requires, and the India-only payroll prerequisites note.
//
// Presentation moves to ds: KPICard → Stat, three different hand-rolled
// proportion bars (HorizontalBar, BillableBar, and the AlertCard day-badges)
// → Meter and Chip, AlertCard/MiniTable → Panel, the period picker →
// InlineSelect with ds Inputs for the custom range.
//
// The only money reference on this page is the `isIndia` check driving the
// payroll-prerequisites hint, which reads `currentCompany?.currency` and
// renders no figure. Nothing here formats a number as currency.
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { usePageTitle } from '../../hooks/usePageTitle';
import employeeApi from '../../utils/employeeApi';
import { formatDateUTC } from '../../utils/dateUtils';
import {
  Users, UserCheck, UserX, UserMinus,
  Building2, Briefcase, Calendar, AlertTriangle, Clock,
  TrendingUp, Sparkles, CheckCircle2, ArrowRight, Banknote,
} from 'lucide-react';
import { useCompany } from '../../context/CompanyContext';
import {
  Button, Chip, EmptyState, Input, InlineSelect, Meter, Panel, Spinner, Stat,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

/* New-workspace onboarding card — mirrors the CRM/Outreach/Invoicing cards.
   Hidden once the org has team members beyond the auto-created owner record
   and at least one department. */
function HrGetStarted({ orgSlug, employeesTotal, departmentsCount, isIndia }) {
  const steps = [
    {
      label: 'Add your team members',
      desc: 'Your own employee profile was created automatically — add the rest of your team',
      done: employeesTotal > 1,
      to: `/org/${orgSlug}/employee/add`,
      cta: 'Add employee',
    },
    {
      label: 'Organize departments',
      desc: 'Group employees into departments for reporting and the org chart',
      done: departmentsCount > 0,
      to: `/org/${orgSlug}/employee/departments`,
      cta: 'Departments',
    },
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Panel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <span style={{
          width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center',
          borderRadius: 'var(--r-2)', background: 'var(--brand-soft)',
        }}>
          <Sparkles size={17} style={{ color: 'var(--brand)' }} />
        </span>
        <div>
          <h3 style={{ font: `600 14.5px/1.3 ${FONT}`, color: 'var(--fg)' }}>Set up your team workspace</h3>
          <p style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-4)', marginTop: 2 }}>
            {doneCount} of {steps.length} steps complete
          </p>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderRadius: 'var(--r-2)',
              background: step.done ? 'var(--brand-soft)' : 'var(--surface-2)',
              boxShadow: `inset 0 0 0 1px ${step.done ? 'var(--brand-line)' : 'var(--line)'}`,
            }}
          >
            <span style={{
              width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 999,
              background: step.done ? 'var(--brand)' : 'var(--surface-3)',
              color: step.done ? 'var(--brand-fg)' : 'var(--fg-2)',
            }}>
              {step.done ? <CheckCircle2 size={15} /> : <span style={{ font: `700 11px/1 ${FONT}` }}>{i + 1}</span>}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ font: `550 13px/1.4 ${FONT}`, color: step.done ? 'var(--brand-ink)' : 'var(--fg)' }}>
                {step.label}
              </p>
              {!step.done && (
                <p style={{ font: `450 11.5px/1.45 ${FONT}`, color: 'var(--fg-4)', marginTop: 2 }}>{step.desc}</p>
              )}
            </div>
            {!step.done && (
              <Link to={step.to} style={{ flexShrink: 0, textDecoration: 'none' }}>
                <Button variant="secondary" size="sm" iconRight={<ArrowRight size={13} />}>{step.cta}</Button>
              </Link>
            )}
          </div>
        ))}
        {isIndia && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
            borderRadius: 'var(--r-2)', border: '1px dashed var(--line-2)', color: 'var(--fg-3)',
          }}>
            <Banknote size={14} style={{ flexShrink: 0 }} />
            <span style={{ font: `450 11.5px/1.5 ${FONT}` }}>
              Before your first payroll run:{' '}
              <Link to={`/org/${orgSlug}/timesheet/holidays`} style={{ color: 'var(--brand-ink)' }}>add your holiday calendar</Link>
              {' '}and{' '}
              <Link to={`/org/${orgSlug}/settings/payroll`} style={{ color: 'var(--brand-ink)' }}>create a salary structure</Link>.
              Your leave policy is already set up.
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function periodToDates(period, customFrom, customTo) {
  const now = new Date();
  let from, to;
  switch (period) {
    case 'current_month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'last_month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'last_3_months':
      from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'custom':
      from = customFrom ? new Date(customFrom) : null;
      to = customTo ? new Date(customTo) : null;
      break;
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  return {
    from: from ? from.toISOString().slice(0, 10) : '',
    to: to ? to.toISOString().slice(0, 10) : '',
  };
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function HorizontalBar({ items, color }) {
  const max = Math.max(...items.map(i => i.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => (
        <div key={item.name || item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            title={item.name || item.label}
            style={{
              width: 128, flexShrink: 0, textAlign: 'right',
              font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {item.name || item.label}
          </span>
          <Meter
            value={item.count}
            max={max}
            size="lg"
            color={color}
            readout={item.count > 0 ? item.count : ''}
            style={{ flex: 1, minWidth: 0 }}
          />
        </div>
      ))}
      {items.length === 0 && <EmptyState compact title="No data" />}
    </div>
  );
}

function BillableBar({ billable = 0, nonBillable = 0 }) {
  const total = billable + nonBillable || 1;
  const billPct = Math.round((billable / total) * 100);
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)' }}>Billable</span>
          <span style={{ font: `550 11.5px/1.4 ${FONT}`, color: 'var(--brand-ink)' }}>{billable} ({billPct}%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)' }}>Non-Billable</span>
          <span style={{ font: `550 11.5px/1.4 ${FONT}`, color: 'var(--warn-ink)' }}>{nonBillable} ({100 - billPct}%)</span>
        </div>
      </div>
      {/* Two-segment split, so not a Meter: Meter shows one value against a
          track, this shows a whole partitioned into two labelled parts. */}
      <div style={{ display: 'flex', width: '100%', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-3)' }}>
        <div style={{ width: `${billPct}%`, background: 'var(--brand)' }} />
        <div style={{ width: `${100 - billPct}%`, background: 'var(--warn)' }} />
      </div>
    </div>
  );
}

function AlertCard({ title, icon, items, renderItem }) {
  return (
    <Panel
      icon={icon}
      title={title}
      actions={items.length > 0 ? <Chip tone="neutral">{items.length}</Chip> : null}
    >
      {items.length === 0 ? (
        <EmptyState compact title="None" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 192, overflowY: 'auto' }}>
          {items.map(renderItem)}
        </div>
      )}
    </Panel>
  );
}

function AlertRow({ orgSlug, item, sub, tone }) {
  return (
    <div
      key={item._id || item.fullName || item.name}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '8px 12px', borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        {item._id ? (
          <Link
            to={`/org/${orgSlug}/employee/${item._id}`}
            style={{ font: `550 12px/1.4 ${FONT}`, color: 'var(--brand-ink)', textDecoration: 'none' }}
          >
            {item.fullName || item.name}
          </Link>
        ) : (
          <p style={{ font: `550 12px/1.4 ${FONT}`, color: 'var(--fg)' }}>{item.fullName || item.name}</p>
        )}
        <p style={{ font: `450 10.5px/1.4 ${FONT}`, color: 'var(--fg-4)', marginTop: 1 }}>{sub}</p>
      </div>
      <Chip tone={tone}>{item.daysLeft != null ? `${item.daysLeft}d left` : '-'}</Chip>
    </div>
  );
}

function MiniTable({ title, icon, columns, rows, orgSlug }) {
  return (
    <Panel
      icon={icon}
      title={title}
      actions={rows.length > 0 ? <Chip tone="neutral">{rows.length}</Chip> : null}
    >
      {rows.length === 0 ? (
        <EmptyState compact title="No records" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {columns.map(col => (
                  <th key={col.key} style={{
                    textAlign: 'left', paddingBottom: 8, paddingRight: 12,
                    font: `600 10px/1 ${FONT}`, textTransform: 'uppercase', letterSpacing: '.07em',
                    color: 'var(--fg-4)', whiteSpace: 'nowrap',
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row._id || i} style={{ borderBottom: '1px solid var(--line)' }}>
                  {columns.map(col => (
                    <td key={col.key} style={{
                      padding: '8px 12px 8px 0', font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-2)',
                    }}>
                      {col.key === 'fullName' && row._id ? (
                        <Link to={`/org/${orgSlug}/employee/${row._id}`} style={{ color: 'var(--brand-ink)', textDecoration: 'none' }}>
                          {row[col.key] || '-'}
                        </Link>
                      ) : col.key === 'joiningDate' || col.key === 'lastWorkingDate' ? (
                        row[col.key] ? formatDateUTC(row[col.key]) : '-'
                      ) : (
                        row[col.key] || '-'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── Main Component ──────────────────────────────────────────────────── */

export default function EmployeeDashboardV2() {
  usePageTitle('Employee Dashboard');
  const { orgSlug } = useOrg();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const [period, setPeriod] = useState('current_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const dates = useMemo(() => periodToDates(period, customFrom, customTo), [period, customFrom, customTo]);

  useEffect(() => {
    if (!orgSlug) return;
    setLoading(true);
    employeeApi.getDashboard(orgSlug, dates)
      .then(res => { if (res.success !== false) setData(res); })
      .catch(() => showToast('Failed to load employee dashboard', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, dates.from, dates.to]);

  /* ── Loading state ───────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
        <Spinner label="Loading dashboard…" />
      </div>
    );
  }

  if (!data) return null;

  const kpis = data.overview || {};
  // Backend returns byType as object { confirmed: 22, ... }, convert to array
  const byTypeObj = data.byType || {};
  const byType = typeof byTypeObj === 'object' && !Array.isArray(byTypeObj)
    ? Object.entries(byTypeObj).map(([name, count]) => ({ name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), count }))
    : (Array.isArray(byTypeObj) ? byTypeObj : []);
  const billableSplit = data.billableSplit || {};
  const periodStats = { newJoiners: (data.newJoiners || []).length, offBoarded: (data.offBoarded || []).length };
  const byDepartment = data.byDepartment || [];
  const byEmpType = byType;
  const newJoiners = data.newJoiners || [];
  const offBoarded = data.offBoarded || [];
  const upcomingLwds = data.upcomingLWDs || [];
  const expiringAssignments = data.expiringAssignments || [];
  const probationEnding = data.probationEnding || [];

  const periodLabels = {
    current_month: 'Current Month',
    last_month: 'Last Month',
    last_3_months: 'Last 3 Months',
    custom: 'Custom Range',
  };

  const grid = (min) => ({
    display: 'grid', gap: 16,
    gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
    alignItems: 'start',
  });

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)', maxWidth: 1280, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Get-started checklist (new workspaces) ─────────────────────── */}
      <HrGetStarted
        orgSlug={orgSlug}
        employeesTotal={kpis.total || 0}
        departmentsCount={byDepartment.length}
        isIndia={currentCompany?.currency === 'INR'}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ font: `650 19px/1.3 ${FONT}`, letterSpacing: '-0.016em', color: 'var(--fg)' }}>
          Employee Dashboard
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <InlineSelect value={period} onChange={e => setPeriod(e.target.value)} aria-label="Period">
            {Object.entries(periodLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </InlineSelect>
          {period === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                aria-label="From" style={{ width: 150, height: 30 }} />
              <span style={{ font: `450 11.5px/1 ${FONT}`, color: 'var(--fg-4)' }}>to</span>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                aria-label="To" style={{ width: 150, height: 30 }} />
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Stat label="Total Employees" value={kpis.total ?? 0} icon={<Users size={14} />} color="var(--brand)" />
        <Stat label="Active" value={kpis.active ?? 0} icon={<UserCheck size={14} />} color="var(--a-crm)" />
        <Stat label="Resigned" value={kpis.resigned ?? 0} icon={<UserX size={14} />} color="var(--warn)" />
        <Stat label="Terminated" value={kpis.terminated ?? 0} icon={<UserMinus size={14} />} color="var(--danger)" />
      </div>

      {/* ── Secondary Row ──────────────────────────────────────────────── */}
      <div style={grid(280)}>
        <Panel icon={<Briefcase size={14} />} title="By Employment Type">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byType.length === 0 ? (
              <EmptyState compact title="No data" />
            ) : (
              byType.map(item => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ font: `450 12px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>{item.name}</span>
                  <Chip tone="neutral">{item.count}</Chip>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel icon={<TrendingUp size={14} />} title="Billable Split">
          <BillableBar billable={billableSplit.billable} nonBillable={billableSplit.nonBillable} />
        </Panel>

        <Panel icon={<Calendar size={14} />} title="Period Stats">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ font: `700 24px/1 ${FONT}`, color: 'var(--brand-ink)', fontVariantNumeric: 'tabular-nums' }}>
                {periodStats.newJoiners ?? 0}
              </p>
              <p style={{ font: `450 10.5px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 5 }}>New Joiners</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ font: `700 24px/1 ${FONT}`, color: 'var(--warn-ink)', fontVariantNumeric: 'tabular-nums' }}>
                {periodStats.offBoarded ?? 0}
              </p>
              <p style={{ font: `450 10.5px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 5 }}>Off-boarded</p>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Distribution Row ───────────────────────────────────────────── */}
      <div style={grid(340)}>
        <Panel icon={<Building2 size={14} />} title="Employees by Department">
          <HorizontalBar items={byDepartment} color="var(--brand)" />
        </Panel>
        <Panel icon={<Briefcase size={14} />} title="Employees by Type">
          <HorizontalBar items={byEmpType} color="var(--a-employee)" />
        </Panel>
      </div>

      {/* ── Tables Row ─────────────────────────────────────────────────── */}
      <div style={grid(340)}>
        <MiniTable
          title="New Joiners"
          icon={<UserCheck size={14} />}
          orgSlug={orgSlug}
          columns={[
            { key: 'fullName', label: 'Name' },
            { key: 'employmentType', label: 'Type' },
            { key: 'department', label: 'Department' },
            { key: 'joiningDate', label: 'Joining Date' },
          ]}
          rows={newJoiners}
        />

        <MiniTable
          title="Off-boarded"
          icon={<UserMinus size={14} />}
          orgSlug={orgSlug}
          columns={[
            { key: 'fullName', label: 'Name' },
            { key: 'employmentType', label: 'Type' },
            { key: 'lastWorkingDate', label: 'LWD' },
            { key: 'separationReason', label: 'Reason' },
          ]}
          rows={offBoarded}
        />
      </div>

      {/* ── Alert Cards Row ────────────────────────────────────────────── */}
      <div style={grid(300)}>
        <AlertCard
          title="Upcoming LWDs"
          icon={<AlertTriangle size={14} />}
          items={upcomingLwds}
          renderItem={item => (
            <AlertRow
              key={item._id || item.fullName || item.name}
              orgSlug={orgSlug}
              item={item}
              tone="warn"
              sub={item.lastWorkingDate ? formatDateUTC(item.lastWorkingDate) : '-'}
            />
          )}
        />

        <AlertCard
          title="Expiring Assignments"
          icon={<Clock size={14} />}
          items={expiringAssignments}
          renderItem={item => (
            <AlertRow
              key={item._id || item.fullName || item.name}
              orgSlug={orgSlug}
              item={item}
              tone="warn"
              sub={`${item.client || '-'} · ends ${item.endDate ? formatDateUTC(item.endDate) : '-'}`}
            />
          )}
        />

        <AlertCard
          title="Probation Ending"
          icon={<Calendar size={14} />}
          items={probationEnding}
          renderItem={item => (
            <AlertRow
              key={item._id || item.fullName || item.name}
              orgSlug={orgSlug}
              item={item}
              tone="info"
              sub={item.probationEnd ? formatDateUTC(item.probationEnd) : '-'}
            />
          )}
        />
      </div>
    </div>
  );
}
