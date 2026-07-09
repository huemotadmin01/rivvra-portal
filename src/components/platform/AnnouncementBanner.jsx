import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { Megaphone, X, ArrowRight } from 'lucide-react';
import announcementsApi from '../../utils/announcementsApi';

/**
 * Dismissible feature-launch banner. Shows the first active announcement the
 * server says this user should see (targeted + not yet dismissed). Dismissal
 * (X or CTA) is recorded server-side, so it never re-appears on refresh,
 * re-login, or another device. Mount once in the workspace shell.
 */
export default function AnnouncementBanner() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const orgSlug = currentOrg?.slug;

  const [queue, setQueue] = useState([]);

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    announcementsApi.list(orgSlug)
      .then(res => {
        if (!cancelled && res?.success) setQueue(res.announcements || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgSlug]);

  const announcement = queue[0];
  if (!announcement) return null;

  const dismiss = () => {
    // Optimistic: drop the current one and surface the next (if any)
    setQueue(prev => prev.slice(1));
    announcementsApi.dismiss(orgSlug, announcement.key).catch(() => {});
  };

  const handleCta = () => {
    const link = announcement.ctaLink;
    dismiss();
    if (link) navigate(orgPath(link));
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-teal-500/10 border-b border-teal-500/20 text-sm">
      <Megaphone className="w-4 h-4 text-teal-400 shrink-0" />
      <span className="flex-1 min-w-0 text-dark-200">
        <span className="font-semibold text-white">{announcement.title}</span>
        {announcement.body ? <span className="text-dark-300"> — {announcement.body}</span> : null}
      </span>
      {announcement.ctaLabel && announcement.ctaLink && (
        <button
          onClick={handleCta}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-dark-950 font-medium transition-colors shrink-0"
        >
          {announcement.ctaLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
      <button onClick={dismiss} className="text-dark-400 hover:text-white p-1 shrink-0" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
