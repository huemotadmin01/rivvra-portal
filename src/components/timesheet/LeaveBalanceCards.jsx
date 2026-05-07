import { Calendar, Thermometer, Coffee, Award, AlertTriangle } from 'lucide-react';

const leaveTypeConfig = {
  sick_leave: { label: 'Sick Leave', icon: Thermometer, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  casual_leave: { label: 'Casual Leave', icon: Coffee, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  comp_off: { label: 'Comp Off', icon: Award, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  lop: { label: 'LOP', icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
};

export default function LeaveBalanceCards({ balances, compact = false }) {
  if (!balances || typeof balances !== 'object') return null;

  const types = Object.entries(balances).filter(([code]) => code !== 'lop');

  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
      {types.map(([code, bal]) => {
        const config = leaveTypeConfig[code] || { label: code, icon: Calendar, color: 'text-dark-400', bg: 'bg-dark-700', border: 'border-dark-600' };
        const Icon = config.icon;
        const available = bal.available ?? ((bal.accrued || 0) + (bal.carriedForward || 0) + (bal.manualAdjustment || 0) - (bal.used || 0) - (bal.pending || 0));

        return (
          <div key={code} className={`${config.bg} border ${config.border} rounded-xl ${compact ? 'p-3' : 'p-4'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={compact ? 14 : 16} className={config.color} />
              <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-white text-2xl font-bold">{available}</p>
                <p className="text-dark-400 text-xs">available</p>
              </div>
              {!compact && (
                <div className="text-right space-y-0.5">
                  <p className="text-dark-400 text-xs">Accrued: <span className="text-dark-300">{bal.accrued || 0}</span></p>
                  <p className="text-dark-400 text-xs">Used: <span className="text-dark-300">{bal.used || 0}</span></p>
                  {(bal.pending || 0) > 0 && (
                    <p className="text-dark-400 text-xs">Pending: <span className="text-yellow-400">{bal.pending}</span></p>
                  )}
                  {(bal.carriedForward || 0) > 0 && (
                    <p className="text-dark-400 text-xs">Carried: <span className="text-dark-300">{bal.carriedForward}</span></p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
