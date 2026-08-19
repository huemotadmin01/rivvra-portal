// ============================================================================
// IncentiveNotificationsBanner.jsx — Inline unread notifications widget
// ============================================================================
// Used at top of MyEarnings / IncentiveDashboard. Lists unread items,
// one-click mark-all-read, click a row to jump to the record.
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import incentiveApi from '../../utils/incentiveApi';
import { Bell, Check, X } from 'lucide-react';

const TYPE_LABEL = {
  incentive_approved: 'Approved',
  paid: 'Paid',
  rolled_forward: 'Rolled forward',
  incentive_adjustment: 'Adjustment',
  adjustment: 'Adjustment',
  incentive_awaiting_approval: 'Awaiting approval',
};

export default function IncentiveNotificationsBanner() {
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();
  const orgSlug = currentOrg?.slug;

  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (orgSlug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  async function load() {
    try {
      const res = await incentiveApi.listNotifications(orgSlug, {
        unreadOnly: true,
        limit: 10,
      });
      setItems(res?.notifications || res || []);
    } catch (e) {
      // Silent — notifications are non-critical
    }
  }

  async function markAllRead() {
    try {
      await incentiveApi.markNotificationsRead(orgSlug, { all: true });
      setItems([]);
    } catch (e) {
      // no-op
    }
  }

  async function onClickItem(n) {
    try {
      await incentiveApi.markNotificationsRead(orgSlug, { ids: [n._id] });
    } catch (_) { /* ignore */ }
    if (n.recordId) navigate(orgPath(`/incentive/records/${n.recordId}`));
    setItems((xs) => xs.filter((x) => x._id !== n._id));
  }

  if (dismissed || items.length === 0) return null;

  return (
    // Theming note: this block used a hardcoded dark-mode fuchsia palette
    // (bg-fuchsia-950/40, text-fuchsia-200/300/400, text-dark-200/400). In the
    // light theme it stayed a dark lavender wash with blue-violet ink on it and
    // measured 2.24-2.45 against a 4.5 floor across all eight text nodes. It
    // now uses the accent tokens, so it follows whichever theme is active.
    <div style={{
      padding: 16, borderRadius: 'var(--r-3, 16px)',
      background: 'color-mix(in srgb, var(--acc-purple) 12%, transparent)',
      boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--acc-purple) 30%, transparent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <h3 style={{
          display: 'flex', alignItems: 'center', gap: 8, margin: 0,
          font: "600 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)',
        }}>
          <Bell size={14} style={{ color: 'var(--acc-purple-ink)' }} />
          {items.length} unread notification{items.length === 1 ? '' : 's'}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={markAllRead}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              background: 'none', border: 0, padding: 0,
              font: "500 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
            }}
          >
            <Check size={12} /> Mark all read
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            style={{
              display: 'inline-flex', cursor: 'pointer', background: 'none', border: 0,
              padding: 0, color: 'var(--fg-3)',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {items.map((n) => (
          <li
            key={n._id}
            onClick={() => onClickItem(n)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
              padding: '6px 8px', borderRadius: 6,
              font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
            }}
          >
            <span style={{
              flexShrink: 0, marginTop: 1, textTransform: 'uppercase',
              font: "600 10px/1.5 'Inter', system-ui, sans-serif",
              letterSpacing: '.05em', color: 'var(--acc-purple-ink)',
            }}>
              {TYPE_LABEL[n.type] || TYPE_LABEL[n.kind] || 'Info'}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ color: 'var(--fg)' }}>{n.title}</span>
              {n.body && (
                <span style={{ marginLeft: 8, font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>{n.body}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
