// ============================================================================
// AdminHealthPageV2.jsx — Super Admin → Platform Health (2026-11-20)
// ============================================================================
//
// Route: /admin/health, inside <SuperAdminRoute><AdminLayout />.
//
// Owner: "overall health check of Rivvra as a platform — what is working fine
// and what is not. Failed jobs, for which workspace, and their details. Errors
// from connected APIs (Cloudflare storage, MongoDB storage). If everything is
// fine then show all reports green."
//
// Read-only. One request (GET /api/superadmin/health); "Check now" re-runs every
// check on the server. Nothing on this page changes anything.
//
// Status words from the server: ok (green) · warn (amber) · bad (red) ·
// off (grey — not set up, or nothing to judge yet; never counted as a problem).
//
// TWO views, never mixed (owner, 20 Nov: "distinguish between individual
// workspace data and Rivvra as platform data"):
//   • Rivvra platform — what every workspace shares: the server, the database,
//     backups, the accounts Rivvra pays for, the background jobs.
//   • Workspaces — what belongs to one customer: its people, its Gmail
//     mailboxes, its emails, its AI failures, its payroll runs.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, AlertTriangle, XCircle, MinusCircle, RefreshCw, ExternalLink,
  ChevronDown, ChevronRight, Building2, Server, Database, Cloud, Mail, Sparkles,
  Github, CreditCard, HardDrive, Layers,
} from 'lucide-react';
import { api } from '../../utils/api';
import { Panel, Button, Callout, Chip, Meter, Spinner } from '../../components/ds';
import { PlanBadge } from './adminShared';
import { STATUS, relTime, exactTime, fmtDuration, headline } from './healthShared';

const FONT = "'Inter', system-ui, sans-serif";
const micro = { font: `450 11.5px/1.45 ${FONT}`, color: 'var(--fg-4)' };
const body = { font: `450 12.5px/1.5 ${FONT}`, color: 'var(--fg-2)' };
const strong = { font: `600 13px/1.35 ${FONT}`, color: 'var(--fg)' };

const ICONS = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, off: MinusCircle };
const SERVICE_ICON = {
  server: Server, mongodb: Database, r2: HardDrive, cloudinary: Cloud, resend: Mail,
  openai: Sparkles, github: Github, stripe: CreditCard,
};

function StatusIcon({ status, size = 16 }) {
  const Icon = ICONS[status] || MinusCircle;
  return <Icon size={size} style={{ color: STATUS[status]?.color || 'var(--fg-4)', flexShrink: 0 }} aria-hidden="true" />;
}

function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.off;
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

function Value({ d }) {
  if (d.type === 'time') return <span title={exactTime(d.value)}>{relTime(d.value)}</span>;
  return <span>{String(d.value)}</span>;
}

/** One connected service: icon, name, one-line verdict, and the numbers behind it. */
function ServiceCard({ s }) {
  const Icon = SERVICE_ICON[s.key] || Server;
  const tone = STATUS[s.status] || STATUS.off;
  return (
    <div style={{
      background: 'var(--surface-1)', borderRadius: 'var(--r-3, 16px)', padding: 14,
      boxShadow: `0 0 0 1px ${s.status === 'ok' || s.status === 'off' ? 'var(--line)' : tone.ring}`,
      display: 'grid', gap: 10, alignContent: 'start',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', color: 'var(--fg-3)',
        }}>
          <Icon size={15} />
        </span>
        <span style={{ ...strong, flex: 1, minWidth: 0 }}>{s.name}</span>
        <StatusChip status={s.status} />
      </div>
      <div style={{ ...body, color: s.status === 'bad' ? 'var(--danger)' : 'var(--fg-2)' }}>{s.summary}</div>
      {s.meter && (
        <Meter value={Math.min(s.meter.used, s.meter.total)} max={s.meter.total} color={tone.color} size="sm" />
      )}
      {s.details?.length > 0 && (
        <dl style={{ margin: 0, display: 'grid', gap: 3 }}>
          {s.details.map((d, i) => (
            <div key={`${d.label}-${i}`} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', ...micro }}>
              <dt style={{ flexShrink: 0 }}>{d.label}</dt>
              <dd style={{ margin: 0, color: 'var(--fg-3)', textAlign: 'right', wordBreak: 'break-word' }}><Value d={d} /></dd>
            </div>
          ))}
        </dl>
      )}
      {s.note && <div style={{ ...micro, color: 'var(--fg-3)' }}>{s.note}</div>}
    </div>
  );
}

/** A table-like row that opens to show error lines when there are any. */
function Row({ status, title, sub, right, note, errors, link, first }) {
  const [open, setOpen] = useState(false);
  const can = errors?.length > 0;
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--line)' }}>
      <div
        role={can ? 'button' : undefined}
        tabIndex={can ? 0 : undefined}
        aria-expanded={can ? open : undefined}
        onClick={can ? () => setOpen((o) => !o) : undefined}
        onKeyDown={can ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } } : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: can ? 'pointer' : 'default' }}
      >
        <StatusIcon status={status} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...strong, display: 'block' }}>{title}</span>
          {sub && <span style={{ ...micro, display: 'block' }}>{sub}</span>}
        </span>
        <span style={{ textAlign: 'right', flexShrink: 0, maxWidth: '46%' }}>
          <span style={{ ...body, display: 'block', color: status === 'bad' ? 'var(--danger)' : status === 'warn' ? 'var(--warn-ink)' : 'var(--fg-3)' }}>{note}</span>
          {right && <span style={{ ...micro, display: 'block' }}>{right}</span>}
        </span>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Open ${title} on GitHub`} style={{ color: 'var(--fg-4)', display: 'inline-flex' }}>
            <ExternalLink size={14} />
          </a>
        )}
        {can && (open ? <ChevronDown size={14} style={{ color: 'var(--fg-4)' }} /> : <ChevronRight size={14} style={{ color: 'var(--fg-4)' }} />)}
      </div>
      {can && open && (
        <div style={{ padding: '0 16px 12px 44px', display: 'grid', gap: 6 }}>
          {errors.map((e, i) => (
            <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-2, 10px)', padding: '8px 10px' }}>
              <div style={{ ...micro }} title={exactTime(e.at)}>{relTime(e.at)}</div>
              <div style={{ font: `450 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace`, color: 'var(--fg-2)', wordBreak: 'break-word' }}>{e.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One of the two verdicts at the top; also the switch between the two views. */
function VerdictTile({ icon, title, sub, tally, note, active, onClick }) {
  const TitleIcon = icon;
  const st = STATUS[tally.status] || STATUS.ok;
  const SIcon = ICONS[tally.status] || CheckCircle2;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        textAlign: 'left', cursor: 'pointer', border: 'none', padding: '14px 16px', display: 'grid', gap: 8,
        borderRadius: 'var(--r-3, 16px)', background: active ? st.soft : 'var(--surface-1)',
        boxShadow: `0 0 0 ${active ? 2 : 1}px ${active ? st.color : 'var(--line)'}`,
        opacity: active ? 1 : 0.78,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, ...micro, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
        <TitleIcon size={14} /> {title}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SIcon size={22} style={{ color: st.color, flexShrink: 0 }} />
        <span style={{ font: `650 16px/1.3 ${FONT}`, color: 'var(--fg)' }}>{note ? 'Could not be checked' : headline(tally).title}</span>
      </span>
      <span style={{ ...micro, color: 'var(--fg-3)' }}>{note || sub}</span>
      {!note && (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tally.bad > 0 && <Chip tone="danger">{tally.bad} not working</Chip>}
          {tally.warn > 0 && <Chip tone="warn">{tally.warn} to look at</Chip>}
          <Chip tone="brand">{tally.ok} working</Chip>
        </span>
      )}
    </button>
  );
}

/** One customer workspace: its own numbers, then its own problems. */
function WorkspaceCard({ w }) {
  const tone = STATUS[w.status] || STATUS.ok;
  return (
    <div style={{
      background: 'var(--surface-1)', borderRadius: 'var(--r-3, 16px)', padding: 16, display: 'grid', gap: 12,
      boxShadow: `0 0 0 1px ${w.status === 'ok' ? 'var(--line)' : tone.ring}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <StatusIcon status={w.status} size={18} />
        <span style={{ flex: '1 1 200px', minWidth: 0 }}>
          <Link to={`/admin/workspaces/${w.orgId}`} style={{ font: `650 14.5px/1.3 ${FONT}`, color: 'var(--fg)', textDecoration: 'none' }}>{w.name}</Link>
          <span style={{ ...micro, display: 'block' }}>{w.slug}</span>
        </span>
        {w.quiet && <Chip tone="neutral">No activity in 30 days</Chip>}
        <PlanBadge plan={w.plan} />
        <Chip tone={tone.tone}>{w.issues.length ? `${w.issues.length} problem${w.issues.length === 1 ? '' : 's'}` : 'No problems found'}</Chip>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {w.facts.map((f) => (
          <div key={f.label} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-2, 10px)', padding: '8px 10px' }}>
            <div style={micro}>{f.label}</div>
            <div style={{ font: `650 14px/1.35 ${FONT}`, color: f.bad ? 'var(--warn-ink)' : 'var(--fg)' }} title={f.type === 'time' ? exactTime(f.value) : undefined}>
              {f.type === 'time' ? (f.value ? relTime(f.value) : 'Never') : f.value}
            </div>
          </div>
        ))}
      </div>
      {w.issues.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {w.issues.map((it, k) => (
            <li key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <StatusIcon status={it.status} size={14} />
              <span style={{ minWidth: 0 }}>
                <span style={body}><b style={{ color: 'var(--fg)', fontWeight: 600 }}>{it.area}:</b> {it.text}</span>
                {it.detail && <span style={{ ...micro, display: 'block', wordBreak: 'break-word' }}>{it.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionCount({ rows }) {
  const bad = rows.filter((r) => r.status === 'bad').length;
  const warn = rows.filter((r) => r.status === 'warn').length;
  const ok = rows.filter((r) => r.status === 'ok').length;
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {bad > 0 && <Chip tone="danger">{bad} not working</Chip>}
      {warn > 0 && <Chip tone="warn">{warn} to look at</Chip>}
      {bad === 0 && warn === 0 && <Chip tone="brand">{ok > 0 ? `${ok} working` : 'Nothing wrong'}</Chip>}
    </span>
  );
}

export default function AdminHealthPageV2() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [showQuietJobs, setShowQuietJobs] = useState(false);
  const [view, setView] = useState('platform'); // 'platform' | 'workspaces'

  const load = useCallback(async (refresh = false) => {
    if (refresh) setChecking(true);
    try {
      const res = await api.getPlatformHealth(refresh);
      if (!res?.success) throw new Error(res?.error || 'Could not load the health report');
      setReport(res);
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load the health report');
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        <Spinner size={28} />
      </div>
    );
  }

  const o = report?.overall;
  const jobs = report?.jobs || [];
  const loudJobs = jobs.filter((j) => j.status === 'bad' || j.status === 'warn');
  const quietJobs = jobs.filter((j) => j.status === 'ok' || j.status === 'off');
  const waiting = jobs.filter((j) => j.status === 'off').length;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ font: `700 22px/1.25 ${FONT}`, color: 'var(--fg)', margin: 0 }}>Platform Health</h1>
          <p style={{ ...micro, marginTop: 4, fontSize: 12.5 }}>
            What is working and what is not — for Rivvra itself, and for each workspace on it. Read-only: nothing here changes anything.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {report && <span style={micro} title={exactTime(report.generatedAt)}>Checked {relTime(report.generatedAt)}</span>}
          <Button
            variant="secondary"
            size="sm"
            disabled={checking}
            onClick={() => load(true)}
            iconLeft={<RefreshCw size={14} className={checking ? 'animate-spin' : undefined} />}
          >
            {checking ? 'Checking…' : 'Check now'}
          </Button>
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      {report && (
        <>
          {/* Two verdicts — Rivvra itself, and the workspaces on it. They also switch the view. */}
          <div role="tablist" aria-label="Health view" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <VerdictTile
              icon={Layers}
              title="Rivvra platform"
              sub="Shared by every workspace: server, database, backups, connected accounts, background jobs."
              tally={o.platform}
              active={view === 'platform'}
              onClick={() => setView('platform')}
            />
            <VerdictTile
              icon={Building2}
              title={`Workspaces (${report.workspaces.length})`}
              sub="Each customer's own data: its people, Gmail mailboxes, emails, AI results and payroll runs."
              tally={o.workspaces}
              note={o.workspaces.error}
              active={view === 'workspaces'}
              onClick={() => setView('workspaces')}
            />
          </div>

          {view === 'platform' && (<>
          {/* Connected services */}
          <section style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h2 style={{ font: `650 14px/1.3 ${FONT}`, color: 'var(--fg)', margin: 0 }}>Rivvra's own services</h2>
              <SectionCount rows={report.services} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {report.services.map((s) => <ServiceCard key={s.key} s={s} />)}
            </div>
            {report.connections?.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={micro}>Also connected:</span>
                {report.connections.map((c) => (
                  <span key={c.name} title={c.what} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...micro, color: 'var(--fg-3)' }}>
                    <StatusIcon status={c.status} size={13} /> {c.name}{c.status === 'off' ? ' (not set up)' : ''}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Background jobs */}
          <Panel title="Background jobs" actions={<SectionCount rows={jobs} />} flush>
            <div style={{ ...micro, padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
              Work Rivvra does on its own, on a timer, for all workspaces. A job turns amber when it logs an error and red when it stops or runs late. Click a row with errors to read them.
            </div>
            {loudJobs.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                <StatusIcon status="ok" />
                <span style={body}>
                  No job has failed or logged an error in the last 24 hours.
                  {waiting > 0 ? ` ${waiting} ${waiting === 1 ? 'is' : 'are'} still waiting for a first recorded run.` : ''}
                </span>
              </div>
            )}
            {loudJobs.map((j, i) => (
              <Row
                key={j.name}
                first={i === 0}
                status={j.status}
                title={j.label}
                sub={[j.what, j.every].filter(Boolean).join(' · ')}
                note={j.note}
                right={j.lastRunAt ? `Last ran ${relTime(j.lastRunAt)}${j.lastDurationMs != null ? ` · took ${fmtDuration(j.lastDurationMs)}` : ''}` : null}
                errors={j.errors}
              />
            ))}
            <button
              type="button"
              onClick={() => setShowQuietJobs((v) => !v)}
              aria-expanded={showQuietJobs}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer',
                background: 'transparent', border: 'none', borderTop: '1px solid var(--line)', ...micro, color: 'var(--fg-3)',
              }}
            >
              {showQuietJobs ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {showQuietJobs ? 'Hide' : 'Show'} the {quietJobs.length} job{quietJobs.length === 1 ? '' : 's'} with no problems
            </button>
            {showQuietJobs && quietJobs.map((j) => (
              <Row
                key={j.name}
                status={j.status}
                title={j.label}
                sub={[j.what, j.every].filter(Boolean).join(' · ')}
                note={j.note}
                right={j.lastRunAt ? `Last ran ${relTime(j.lastRunAt)}${j.lastDurationMs != null ? ` · took ${fmtDuration(j.lastDurationMs)}` : ''}` : null}
              />
            ))}
          </Panel>

          {/* Scheduled jobs on GitHub */}
          <Panel title="Scheduled jobs on GitHub" icon={<Github size={14} />} actions={<SectionCount rows={report.scheduled} />} flush>
            <div style={{ ...micro, padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
              Jobs that run outside the API, so they still work when the API is down: the nightly backup, the uptime check and the email-address checks.
            </div>
            {report.scheduled.length === 0 ? (
              <div style={{ ...body, padding: '12px 16px', color: 'var(--fg-3)' }}>
                These cannot be read on this server — it has no GitHub token.
              </div>
            ) : report.scheduled.map((s, i) => (
              <Row
                key={s.key}
                first={i === 0}
                status={s.status}
                title={s.label}
                sub={s.what}
                note={s.note}
                right={s.lastRunAt ? `Last ran ${relTime(s.lastRunAt)}` : null}
                link={s.url}
              />
            ))}
          </Panel>

          {/* API errors */}
          <Panel title="Recent API errors" actions={<Chip tone={report.apiErrors.length ? 'neutral' : 'brand'}>{report.apiErrors.length ? `${report.apiErrors.length} in the last 24 h` : 'None'}</Chip>} flush>
            <div style={{ ...micro, padding: '10px 16px', borderBottom: report.apiErrors.length ? '1px solid var(--line)' : 'none' }}>
              Errors the API logged while answering requests since it last restarted. For information — these do not change the status above.
            </div>
            {report.apiErrors.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 16px', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                <span style={{ ...micro, flexShrink: 0, width: 92 }} title={exactTime(e.at)}>{relTime(e.at)}</span>
                <span style={{ font: `450 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace`, color: 'var(--fg-2)', wordBreak: 'break-word', minWidth: 0 }}>{e.message}</span>
              </div>
            ))}
          </Panel>
          </>)}

          {view === 'workspaces' && (
            <section style={{ display: 'grid', gap: 12 }}>
              <div style={micro}>
                Numbers below belong to that workspace only. A problem with Rivvra itself (for example the database or the email account) is shown under “Rivvra platform”, not here.
              </div>
              {report.workspaces.map((w) => <WorkspaceCard key={w.orgId} w={w} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
