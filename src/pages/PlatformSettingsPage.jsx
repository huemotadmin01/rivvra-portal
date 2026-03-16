import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import {
  Settings, Users, Mail, Clock, User, Shield,
  Bell, CreditCard, ChevronRight, Building2
} from 'lucide-react';
import { getActiveApps } from '../config/apps';

// Lazy import sections to keep bundle manageable
import SettingsGeneral from '../components/settings/SettingsGeneral';
import SettingsTeam from '../components/settings/SettingsTeam';
import SettingsOutreach from '../components/settings/SettingsOutreach';
import SettingsTimesheet from '../components/settings/SettingsTimesheet';
import SettingsEmployee from '../components/settings/SettingsEmployee';
import SettingsEmailLogs from '../components/settings/SettingsEmailLogs';
import SettingsCompanies from '../components/settings/SettingsCompanies';

export default function PlatformSettingsPage() {
  const { user } = useAuth();
  const { getAppRole, currentOrg, membership } = useOrg();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'general';

  const setTab = (tab) => {
    setSearchParams({ tab }, { replace: true });
  };

  // Org membership role is the source of truth
  const orgRole = currentOrg ? (membership?.role || getAppRole('outreach')) : null;
  const isAdmin = orgRole === 'admin' || user?.role === 'admin' || user?.role === 'team_lead';
  const activeApps = getActiveApps(user, membership);
  const hasOutreach = activeApps.some(a => a.id === 'outreach');
  const hasTimesheet = activeApps.some(a => a.id === 'timesheet');
  const hasEmployee = activeApps.some(a => a.id === 'employee');

  // Build tab sections
  const sections = [
    {
      label: 'GENERAL',
      items: [
        { id: 'general', label: 'General Settings', icon: Settings, description: 'Organization & branding' },
        { id: 'companies', label: 'Companies', icon: Building2, description: 'Manage legal entities', adminOnly: true },
        { id: 'users', label: 'Users & Teams', icon: Users, description: 'Manage members & roles', adminOnly: true },
        { id: 'email-logs', label: 'Email Logs', icon: Mail, description: 'View sent platform emails', adminOnly: true },
      ],
    },
    {
      label: 'APPS',
      items: [
        ...(hasOutreach ? [{
          id: 'outreach', label: 'Outreach', icon: Mail, description: 'Email settings & sequences',
          color: 'rivvra',
        }] : []),
        ...(hasTimesheet ? [{
          id: 'timesheet', label: 'ESS', icon: Clock, description: 'Timesheets & payroll settings',
          color: 'blue', adminOnly: true,
        }] : []),
        ...(hasEmployee ? [{
          id: 'employee', label: 'Employee', icon: User, description: 'Employee management',
          color: 'purple', adminOnly: true,
        }] : []),
      ],
    },
  ];

  const colorMap = {
    rivvra: { bg: 'bg-rivvra-500/10', text: 'text-rivvra-400', activeBg: 'bg-rivvra-500/15', border: 'border-rivvra-500/30' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', activeBg: 'bg-blue-500/15', border: 'border-blue-500/30' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', activeBg: 'bg-purple-500/15', border: 'border-purple-500/30' },
    default: { bg: 'bg-dark-800/50', text: 'text-dark-400', activeBg: 'bg-rivvra-500/10', border: 'border-rivvra-500/30' },
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-dark-400 mt-1">Manage your platform, apps & team</p>
      </div>

      <div className="flex gap-8">
        {/* Left sidebar — Odoo-style vertical tabs */}
        <div className="w-56 flex-shrink-0">
          <nav className="space-y-6">
            {sections.map((section) => {
              const visibleItems = section.items.filter(item => !item.adminOnly || isAdmin);
              if (visibleItems.length === 0) return null;

              return (
                <div key={section.label}>
                  <p className="text-xs font-semibold text-dark-500 uppercase tracking-wider px-3 mb-2">
                    {section.label}
                  </p>
                  <div className="space-y-1">
                    {visibleItems.map((item) => {
                      const isActive = activeTab === item.id;
                      const colors = colorMap[item.color] || colorMap.default;

                      return (
                        <button
                          key={item.id}
                          onClick={() => setTab(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                            isActive
                              ? `${colors.activeBg} ${colors.text} border ${colors.border}`
                              : 'text-dark-400 hover:text-white hover:bg-dark-800/50 border border-transparent'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isActive ? colors.bg : 'bg-dark-800/50'
                          }`}>
                            <item.icon className={`w-4 h-4 ${isActive ? colors.text : 'text-dark-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isActive ? 'text-white' : ''}`}>{item.label}</p>
                            <p className="text-xs text-dark-500 truncate">{item.description}</p>
                          </div>
                          {isActive && <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Right content area */}
        <div className="flex-1 min-w-0">
          {activeTab === 'general' && <SettingsGeneral />}
          {activeTab === 'companies' && isAdmin && <SettingsCompanies />}
          {activeTab === 'users' && isAdmin && <SettingsTeam />}
          {activeTab === 'email-logs' && isAdmin && <SettingsEmailLogs />}
          {activeTab === 'outreach' && <SettingsOutreach />}
          {activeTab === 'timesheet' && <SettingsTimesheet />}
          {activeTab === 'employee' && <SettingsEmployee />}
        </div>
      </div>
    </div>
  );
}
