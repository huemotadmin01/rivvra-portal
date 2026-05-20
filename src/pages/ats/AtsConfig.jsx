import { useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import {
  Layers, Tag, Globe, ThumbsDown, GraduationCap, Briefcase,
  Zap, Award, BarChart3, Mail, FileCheck,
} from 'lucide-react';

import ConfigSection from '../../components/ats/config/ConfigSection';
import StagesSection from '../../components/ats/config/StagesSection';
import SkillTypesSection from '../../components/ats/config/SkillTypesSection';
import SkillsSection from '../../components/ats/config/SkillsSection';
import SkillLevelsSection from '../../components/ats/config/SkillLevelsSection';
import EmailTemplatesSection from '../../components/ats/config/EmailTemplatesSection';

/**
 * AtsConfig — thin shell that URL-drives a tab strip across the 10 ATS
 * picklist editors. Each section lives in its own file under
 * components/ats/config/ so this page stays small and the sections can
 * be navigated to / bookmarked individually via `?tab=`.
 *
 * Five tabs share a generic ConfigSection (tags / sources /
 * refuse_reasons / degrees / employment_types). Stages, skill types,
 * skills, skill levels and email templates each have their own
 * bespoke component.
 */
const TABS = [
  { key: 'stages',           label: 'Stages',           icon: Layers },
  { key: 'tags',             label: 'Tags',             icon: Tag },
  { key: 'sources',          label: 'Sources',          icon: Globe },
  { key: 'refuse_reasons',     label: 'Refuse Reasons',     icon: ThumbsDown },
  { key: 'required_documents', label: 'Required Documents', icon: FileCheck },
  { key: 'degrees',            label: 'Degrees',            icon: GraduationCap },
  { key: 'employment_types', label: 'Employment Types', icon: Briefcase },
  { key: 'skill_types',      label: 'Skill Types',      icon: Zap },
  { key: 'skills',           label: 'Skills',           icon: Award },
  { key: 'skill_levels',     label: 'Skill Levels',     icon: BarChart3 },
  { key: 'email_templates',  label: 'Email Templates',  icon: Mail },
];

const VALID_KEYS = new Set(TABS.map((t) => t.key));

export default function AtsConfig() {
  const { currentOrg, getAppRole } = useOrg();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  // Read active tab from URL (?tab=…). Falls back to 'stages' for any
  // missing/invalid value so deep-linking with a stale key doesn't crash.
  const rawTab = searchParams.get('tab');
  const activeTab = VALID_KEYS.has(rawTab) ? rawTab : 'stages';

  const setActiveTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'stages') next.delete('tab'); else next.set('tab', key);
    setSearchParams(next, { replace: false });
  };

  // Non-admin guard
  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-20 text-dark-400">
          <Layers size={48} className="mb-4 opacity-40" />
          <p className="text-lg">Admin access required</p>
          <p className="text-sm text-dark-500 mt-1">Only admins can manage ATS configuration.</p>
        </div>
      </div>
    );
  }

  const sectionProps = { orgSlug, showToast };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ATS Configuration</h1>
          <p className="text-dark-400 text-sm mt-1">Manage stages, tags, sources, and other recruitment settings</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-dark-700">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-rivvra-500 text-rivvra-400'
                    : 'border-transparent text-dark-400 hover:text-dark-200 hover:border-dark-600'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'stages' && <StagesSection {...sectionProps} />}
      {activeTab === 'tags' && <ConfigSection entity="tags" entityLabel="Tags" icon={Tag} {...sectionProps} />}
      {activeTab === 'sources' && <ConfigSection entity="sources" entityLabel="Sources" icon={Globe} {...sectionProps} />}
      {activeTab === 'refuse_reasons' && <ConfigSection entity="refuse_reasons" entityLabel="Refuse Reasons" icon={ThumbsDown} {...sectionProps} />}
      {activeTab === 'required_documents' && <ConfigSection entity="required_documents" entityLabel="Required Documents" icon={FileCheck} {...sectionProps} />}
      {activeTab === 'degrees' && <ConfigSection entity="degrees" entityLabel="Degrees" icon={GraduationCap} {...sectionProps} />}
      {activeTab === 'employment_types' && <ConfigSection entity="employment_types" entityLabel="Employment Types" icon={Briefcase} {...sectionProps} />}
      {activeTab === 'skill_types' && <SkillTypesSection {...sectionProps} />}
      {activeTab === 'skills' && <SkillsSection {...sectionProps} />}
      {activeTab === 'skill_levels' && <SkillLevelsSection {...sectionProps} />}
      {activeTab === 'email_templates' && <EmailTemplatesSection {...sectionProps} />}
    </div>
  );
}
