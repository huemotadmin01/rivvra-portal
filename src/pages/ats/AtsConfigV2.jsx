import { useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import {
  Layers, Tag, Globe, ThumbsDown, GraduationCap, Briefcase,
  Zap, Award, BarChart3, Mail, FileCheck, Paperclip,
} from 'lucide-react';
import { EmptyState } from '../../components/ds';
import {
  PicklistSectionV2, StagesSectionV2, AttachmentKindsSectionV2,
  RequiredDocumentsSectionV2, SkillTypesSectionV2, SkillsSectionV2, SkillLevelsSectionV2,
} from '../../components/ats/config/v2/sectionsV2';
// Email templates keep the legacy section for now — its inline expand
// editor + preview is a form archetype that migrates with the forms slice.
import EmailTemplatesSection from '../../components/ats/config/EmailTemplatesSection';

const TABS = [
  { key: 'stages', label: 'Stages', icon: Layers },
  { key: 'attachment_kinds', label: 'Attachment Kinds', icon: Paperclip },
  { key: 'tags', label: 'Tags', icon: Tag },
  { key: 'sources', label: 'Sources', icon: Globe },
  { key: 'refuse_reasons', label: 'Refuse Reasons', icon: ThumbsDown },
  { key: 'required_documents', label: 'Required Documents', icon: FileCheck },
  { key: 'degrees', label: 'Degrees', icon: GraduationCap },
  { key: 'employment_types', label: 'Employment Types', icon: Briefcase },
  { key: 'skill_types', label: 'Skill Types', icon: Zap },
  { key: 'skills', label: 'Skills', icon: Award },
  { key: 'skill_levels', label: 'Skill Levels', icon: BarChart3 },
  { key: 'email_templates', label: 'Email Templates', icon: Mail },
];
const VALID_KEYS = new Set(TABS.map((t) => t.key));

/* v2 ATS Configuration (Slice 4 Wave B) — same URL-driven tab shell as
   AtsConfig.jsx over the v2 sections. */
export default function AtsConfigV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = getAppRole('ats') === 'admin';
  const orgSlug = currentOrg?.slug;

  const rawTab = searchParams.get('tab');
  const activeTab = VALID_KEYS.has(rawTab) ? rawTab : 'stages';

  const setActiveTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'stages') next.delete('tab'); else next.set('tab', key);
    setSearchParams(next, { replace: false });
  };

  if (!isAdmin) {
    return (
      <EmptyState icon={<Layers size={22} />} title="Admin access required">
        Only admins can manage ATS configuration.
      </EmptyState>
    );
  }

  const sectionProps = { orgSlug, showToast };
  const tabBtn = (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', whiteSpace: 'nowrap',
    font: '550 12.5px/1 var(--font)',
    color: on ? 'var(--fg)' : 'var(--fg-4)',
    borderBottom: on ? '2px solid var(--a-ats, var(--brand))' : '2px solid transparent',
    marginBottom: -1, transition: 'color var(--d-1) var(--e-out)',
  });

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ font: '650 22px/1.2 var(--font)', color: 'var(--fg)', letterSpacing: '-0.015em' }}>ATS Configuration</h1>
        <p style={{ font: '450 13px/1.4 var(--font)', color: 'var(--fg-4)', marginTop: 4 }}>
          Manage stages, tags, sources, and other recruitment settings
        </p>
      </div>

      <div style={{ borderBottom: '1px solid var(--line)', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} type="button" style={tabBtn(activeTab === tab.key)} onClick={() => setActiveTab(tab.key)}>
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'stages' && <StagesSectionV2 icon={Layers} {...sectionProps} />}
      {activeTab === 'attachment_kinds' && <AttachmentKindsSectionV2 icon={Paperclip} {...sectionProps} />}
      {activeTab === 'tags' && <PicklistSectionV2 entity="tags" entityLabel="Tags" icon={Tag} {...sectionProps} />}
      {activeTab === 'sources' && <PicklistSectionV2 entity="sources" entityLabel="Sources" icon={Globe} {...sectionProps} />}
      {activeTab === 'refuse_reasons' && <PicklistSectionV2 entity="refuse_reasons" entityLabel="Refuse Reasons" icon={ThumbsDown} {...sectionProps} />}
      {activeTab === 'required_documents' && <RequiredDocumentsSectionV2 icon={FileCheck} {...sectionProps} />}
      {activeTab === 'degrees' && <PicklistSectionV2 entity="degrees" entityLabel="Degrees" icon={GraduationCap} {...sectionProps} />}
      {activeTab === 'employment_types' && <PicklistSectionV2 entity="employment_types" entityLabel="Employment Types" icon={Briefcase} {...sectionProps} />}
      {activeTab === 'skill_types' && <SkillTypesSectionV2 icon={Zap} {...sectionProps} />}
      {activeTab === 'skills' && <SkillsSectionV2 icon={Award} {...sectionProps} />}
      {activeTab === 'skill_levels' && <SkillLevelsSectionV2 icon={BarChart3} {...sectionProps} />}
      {activeTab === 'email_templates' && <EmailTemplatesSection {...sectionProps} />}
    </div>
  );
}
