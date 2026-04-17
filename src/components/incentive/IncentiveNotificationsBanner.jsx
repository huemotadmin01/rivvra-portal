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
    <div className="bg-fuchsia-950/40 border border-fuchsia-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-fuchsia-200 flex items-center gap-2">
          <Bell size={14} />
          {items.length} unread notification{items.length === 1 ? '' : 's'}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={markAllRead}
            className="text-xs text-fuchsia-300 hover:text-fuchsia-100 flex items-center gap-1"
          >
            <Check size={12} /> Mark all read
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-fuchsia-400 hover:text-fuchsia-200"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <ul className="space-y-1.5">
        {items.map((n) => (
          <li
            key={n._id}
            onClick={() => onClickItem(n)}
            className="text-sm text-dark-200 cursor-pointer hover:bg-fuchsia-900/30 rounded px-2 py-1.5 flex items-start gap-2"
          >
            <span className="text-[10px] uppercase font-semibold text-fuchsia-300 mt-0.5 shrink-0">
              {TYPE_LABEL[n.type] || TYPE_LABEL[n.kind] || 'Info'}
            </span>
            <span className="flex-1">
              <span className="text-white">{n.title}</span>
              {n.body && (
                <span className="text-dark-400 ml-2 text-xs">{n.body}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
