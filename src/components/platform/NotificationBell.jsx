import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { Bell, CheckCheck } from 'lucide-react';
import notificationsApi from '../../utils/notificationsApi';

// Producing-app badge styles (keyed by notification.app)
const APP_BADGES = {
  todo:      { label: 'To Do',     cls: 'bg-teal-500/10 text-teal-400' },
  ats:       { label: 'ATS',       cls: 'bg-purple-500/10 text-purple-400' },
  crm:       { label: 'CRM',       cls: 'bg-blue-500/10 text-blue-400' },
  payroll:   { label: 'Payroll',   cls: 'bg-amber-500/10 text-amber-400' },
  invoicing: { label: 'Invoicing', cls: 'bg-orange-500/10 text-orange-400' },
};
const DEFAULT_BADGE = { label: 'Rivvra', cls: 'bg-dark-700 text-dark-300' };

function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const { currentOrg } = useOrg();
  const orgSlug = currentOrg?.slug;

  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const fetchNotifications = async (slug) => {
    if (!slug) return;
    try {
      const res = await notificationsApi.list(slug, { limit: 30 });
      if (res?.success) {
        setItems(res.notifications || []);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch {
      // silently ignore
    }
  };

  // Initial fetch + 60s polling
  useEffect(() => {
    if (!orgSlug) return;
    fetchNotifications(orgSlug);
    const interval = setInterval(() => fetchNotifications(orgSlug), 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  // Refetch on dropdown open
  useEffect(() => {
    if (open && orgSlug) fetchNotifications(orgSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = async (n) => {
    if (!n.read) {
      setItems(prev => prev.map(x => (x._id === n._id ? { ...x, read: true } : x)));
      setUnreadCount(c => Math.max(0, c - 1));
      notificationsApi.markRead(orgSlug, n._id).catch(() => {});
    }
    if (n.link) {
      setOpen(false);
      navigate(orgPath(n.link));
    }
  };

  const handleMarkAllRead = async () => {
    setItems(prev => prev.map(x => ({ ...x, read: true })));
    setUnreadCount(0);
    notificationsApi.markAllRead(orgSlug).catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {/* Badge below uses tokens, not bg-rivvra-500 + text-white. Two
            separate problems: the fill is NOT bridge-mapped, so it stayed the
            dark-theme green in light theme; and text-white maps to --fg,
            which on that green measures 2.05 in dark. --brand + --brand-fg is
            the pairing ds/Button already uses for its primary fill: 8.36
            dark, 5.02 light. The fallbacks keep it correct in the legacy
            shell, which renders this same component outside .ds-shell. */}
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 w-4 h-4 text-[9px] font-bold rounded-full flex items-center justify-center"
            style={{ background: 'var(--brand, #22c55e)', color: 'var(--brand-fg, #041209)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 bg-dark-900 border border-dark-700 rounded-xl shadow-xl z-50">
          <div className="px-4 py-2.5 border-b border-dark-700 flex items-center justify-between">
            <p className="text-xs font-semibold text-dark-300">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[10px] text-dark-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <CheckCheck size={11} /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Bell className="w-6 h-6 text-dark-600 mx-auto mb-1.5" />
              <p className="text-xs text-dark-500">No notifications</p>
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto p-1.5">
              {items.map(n => {
                const badge = APP_BADGES[n.app] || DEFAULT_BADGE;
                return (
                  <div
                    key={n._id}
                    onClick={() => handleClick(n)}
                    className={`px-2.5 py-2 rounded-lg cursor-pointer hover:bg-dark-800/50 ${
                      n.read ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-rivvra-400 flex-shrink-0" />}
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {n.title && <span className="text-xs font-medium text-dark-200 truncate">{n.title}</span>}
                      <span className="text-[9px] text-dark-500 ml-auto flex-shrink-0">{formatTimeAgo(n.createdAt)}</span>
                    </div>
                    <p className="text-xs text-dark-300 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
