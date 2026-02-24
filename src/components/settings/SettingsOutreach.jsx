/**
 * SettingsOutreach — Outreach app settings section
 * Shows Gmail connection status and EngageSettings (send limits, unsubscribe, signature).
 */
import { useState, useEffect } from 'react';
import { Mail, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react';
import api from '../../utils/api';
import EngageSettings from '../EngageSettings';

export default function SettingsOutreach() {
  const [gmailStatus, setGmailStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getGmailStatus()
      .then(res => { if (res.success) setGmailStatus(res); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-rivvra-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Gmail Connection Status */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Gmail Connection</h2>
        <div className="flex items-center gap-4 p-4 bg-dark-800/50 rounded-xl border border-dark-700">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            gmailStatus?.connected ? 'bg-emerald-500/10' : 'bg-red-500/10'
          }`}>
            <Mail className={`w-5 h-5 ${gmailStatus?.connected ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {gmailStatus?.connected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span className="text-sm font-medium text-white">
                {gmailStatus?.connected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs text-dark-400 mt-1">
              {gmailStatus?.connected
                ? `Sending from ${gmailStatus.email || 'your Gmail account'}`
                : 'Connect Gmail to send emails from your account'}
            </p>
          </div>
          {!gmailStatus?.connected && (
            <a
              href="#/outreach/engage"
              className="flex items-center gap-1.5 px-4 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Connect
            </a>
          )}
        </div>
      </div>

      {/* Engage Settings (send limits, unsubscribe, signature) */}
      <EngageSettings gmailStatus={gmailStatus} />
    </div>
  );
}
