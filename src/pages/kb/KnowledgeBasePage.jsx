import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen, ChevronRight, FileText, Search, Loader2, X, Building2,
  Sparkles, Plus, Pencil, ArrowLeft,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { getAppById } from '../../config/apps';
import knowledgeBaseApi from '../../utils/knowledgeBaseApi';
import KbAskPanel from './KbAskPanel';
import KbArticleEditor from './KbArticleEditor';

// ── Markdown renderer styling ────────────────────────────────────────────
const mdComponents = {
  h1: (props) => <h1 className="text-3xl font-bold text-dark-100 mt-8 mb-4 first:mt-0" {...props} />,
  h2: (props) => <h2 className="text-2xl font-semibold text-dark-100 mt-8 mb-3 pb-2 border-b border-dark-800" {...props} />,
  h3: (props) => <h3 className="text-lg font-semibold text-dark-200 mt-6 mb-2" {...props} />,
  h4: (props) => <h4 className="text-base font-semibold text-dark-200 mt-4 mb-2" {...props} />,
  p: (props) => <p className="text-sm text-dark-300 leading-relaxed mb-4" {...props} />,
  ul: (props) => <ul className="list-disc list-outside pl-5 text-sm text-dark-300 space-y-1.5 mb-4 marker:text-dark-500" {...props} />,
  ol: (props) => <ol className="list-decimal list-outside pl-5 text-sm text-dark-300 space-y-1.5 mb-4 marker:text-dark-500" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  a: (props) => <a className="text-rivvra-400 hover:text-rivvra-300 underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />,
  code: ({ inline, ...props }) =>
    inline
      ? <code className="px-1.5 py-0.5 rounded bg-dark-800 text-rivvra-300 text-[0.8em] font-mono" {...props} />
      : <code className="block p-3 rounded-lg bg-dark-900 border border-dark-800 text-dark-200 text-xs font-mono overflow-x-auto" {...props} />,
  pre: (props) => <pre className="mb-4" {...props} />,
  blockquote: (props) => (
    <blockquote className="border-l-2 border-amber-500/50 bg-amber-500/5 pl-4 pr-3 py-2 my-4 text-sm text-amber-200/90 rounded-r" {...props} />
  ),
  hr: () => <hr className="border-dark-800 my-8" />,
  strong: (props) => <strong className="font-semibold text-dark-100" {...props} />,
  em: (props) => <em className="italic text-dark-200" {...props} />,
  table: (props) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-dark-800">
      <table className="min-w-full text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-dark-900" {...props} />,
  th: (props) => <th className="text-left px-3 py-2 text-dark-200 font-semibold border-b border-dark-800" {...props} />,
  td: (props) => <td className="px-3 py-2 text-dark-300 border-b border-dark-900" {...props} />,
};

function appMeta(appId) {
  if (appId === 'general') return { name: 'General', icon: BookOpen };
  const reg = getAppById(appId);
  return { name: reg?.name || appId, icon: reg?.icon || FileText };
}

function groupByApp(list) {
  const byApp = new Map();
  for (const a of list) {
    if (!byApp.has(a.appId)) byApp.set(a.appId, []);
    byApp.get(a.appId).push(a);
  }
  const groups = [];
  for (const [appId, items] of byApp) {
    const sections = new Map();
    for (const it of items) {
      const key = it.section || '';
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key).push(it);
    }
    groups.push({
      appId,
      ...appMeta(appId),
      sections: [...sections.entries()].map(([name, arts]) => ({ name, articles: arts })),
    });
  }
  groups.sort((a, b) => {
    if (a.appId === 'general') return 1;
    if (b.appId === 'general') return -1;
    return a.name.localeCompare(b.name);
  });
  return groups;
}

export default function KnowledgeBasePage() {
  const { orgSlug } = usePlatform();
  const { articleSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const appParam = searchParams.get('app') || '';

  const [list, setList] = useState([]);
  const [canAuthor, setCanAuthor] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [article, setArticle] = useState(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState(null);

  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // 'browse' | 'ask' | 'edit'
  const [mode, setMode] = useState('browse');
  const [editing, setEditing] = useState(null); // article being edited, or null for new

  const buildLink = (slug) => `/org/${orgSlug}/knowledge-base/${slug}`;

  const loadList = useCallback(() => {
    setListLoading(true);
    return knowledgeBaseApi.listArticles(orgSlug)
      .then((res) => { setList(res.articles || []); setCanAuthor(!!res.canAuthor); setListError(null); })
      .catch(() => setListError('Failed to load the knowledge base.'))
      .finally(() => setListLoading(false));
  }, [orgSlug]);

  useEffect(() => { loadList(); }, [loadList]);

  // Load selected article body
  useEffect(() => {
    if (!articleSlug) { setArticle(null); setArticleError(null); return; }
    let alive = true;
    setArticleLoading(true);
    setArticleError(null);
    setMode('browse');
    knowledgeBaseApi.getArticle(orgSlug, articleSlug)
      .then((res) => { if (alive) setArticle(res.article || null); })
      .catch((e) => { if (alive) setArticleError(e?.message || 'Article not found.'); })
      .finally(() => { if (alive) setArticleLoading(false); });
    return () => { alive = false; };
  }, [orgSlug, articleSlug]);

  // Debounced search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      knowledgeBaseApi.search(orgSlug, term)
        .then((res) => { if (alive) setResults(res.results || []); })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [orgSlug, q]);

  const allGroups = useMemo(() => groupByApp(list), [list]);
  const groups = useMemo(
    () => (appParam ? allGroups.filter((g) => g.appId === appParam) : allGroups),
    [allGroups, appParam],
  );

  const openArticle = (slug) => { setQ(''); setMode('browse'); navigate(buildLink(slug)); };
  const clearAppFilter = () => { const p = new URLSearchParams(searchParams); p.delete('app'); setSearchParams(p); };

  const onSaved = async (saved) => {
    await loadList();
    setMode('browse');
    setEditing(null);
    if (saved?.slug) navigate(buildLink(saved.slug));
  };
  const onDeleted = async () => {
    await loadList();
    setMode('browse');
    setEditing(null);
    navigate(`/org/${orgSlug}/knowledge-base`);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <BookOpen size={20} className="text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark-100">Knowledge Base</h1>
            <p className="text-sm text-dark-400">How-to guides and workflow walkthroughs across every Rivvra app</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode(mode === 'ask' ? 'browse' : 'ask')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              mode === 'ask'
                ? 'bg-rivvra-500/15 border-rivvra-500/40 text-rivvra-300'
                : 'bg-dark-900 border-dark-800 text-dark-300 hover:border-rivvra-500/30'
            }`}
          >
            <Sparkles size={15} /> Ask AI
          </button>
          {canAuthor && (
            <button
              type="button"
              onClick={() => { setEditing(null); setMode('edit'); }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-sky-500 text-dark-950 hover:bg-sky-400 transition-colors"
            >
              <Plus size={15} /> New Article
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* Left nav */}
        <aside className="bg-dark-900 border border-dark-800 rounded-xl p-3 h-fit lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); if (mode !== 'browse') setMode('browse'); }}
              placeholder="Search articles…"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-dark-950 border border-dark-800 text-sm text-dark-200 placeholder:text-dark-600 focus:outline-none focus:border-sky-500/40"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
                <X size={14} />
              </button>
            )}
          </div>

          {appParam && (
            <button type="button" onClick={clearAppFilter} className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 px-3 py-1.5 mb-1">
              <ArrowLeft size={12} /> All apps
            </button>
          )}

          {listLoading && (
            <div className="flex items-center gap-2 text-xs text-dark-500 p-3"><Loader2 size={14} className="animate-spin" /> Loading…</div>
          )}
          {listError && <p className="text-xs text-red-400 p-3">{listError}</p>}
          {!listLoading && !listError && groups.length === 0 && (
            <p className="text-xs text-dark-500 p-3">No articles available{appParam ? ' for this app' : ' for your apps'} yet.</p>
          )}

          {groups.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.appId} className="mb-4 last:mb-0">
                <div className="px-3 py-2 flex items-center gap-2">
                  <Icon size={13} className="text-dark-500 shrink-0" />
                  <h3 className="text-[10px] uppercase tracking-wider font-semibold text-dark-500">{g.name}</h3>
                </div>
                {g.sections.map((sec) => (
                  <div key={sec.name} className="mb-1.5">
                    {sec.name && <p className="px-3 py-1 text-[10px] font-medium text-dark-600">{sec.name}</p>}
                    <div className="space-y-0.5">
                      {sec.articles.map((a) => {
                        const active = a.slug === articleSlug && mode === 'browse';
                        return (
                          <button
                            key={a.id || a.slug}
                            type="button"
                            onClick={() => openArticle(a.slug)}
                            className={`w-full text-left px-3 py-2 rounded-lg flex items-start gap-2 transition-colors ${
                              active ? 'bg-sky-500/10 border border-sky-500/20 text-sky-300' : 'text-dark-300 hover:bg-dark-800 border border-transparent'
                            }`}
                          >
                            <FileText size={14} className={`mt-0.5 shrink-0 ${active ? 'text-sky-400' : 'text-dark-500'}`} />
                            <span className="text-sm leading-tight flex-1">{a.title}</span>
                            {a.scope === 'org' && <Building2 size={11} className="mt-1 shrink-0 text-emerald-500/70" title="Your organization’s article" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </aside>

        {/* Main */}
        <main className="bg-dark-900 border border-dark-800 rounded-xl px-6 py-5 lg:px-10 lg:py-8 min-h-[60vh]">
          {mode === 'ask' ? (
            <KbAskPanel orgSlug={orgSlug} onOpenArticle={openArticle} />
          ) : mode === 'edit' ? (
            <KbArticleEditor
              orgSlug={orgSlug}
              existing={editing}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onCancel={() => { setMode('browse'); setEditing(null); }}
            />
          ) : results !== null ? (
            <SearchResults q={q} searching={searching} results={results} onOpen={openArticle} />
          ) : articleLoading ? (
            <div className="flex items-center justify-center py-20 text-dark-500"><Loader2 size={22} className="animate-spin" /></div>
          ) : article ? (
            <ArticleView
              article={article}
              canAuthor={canAuthor}
              onEdit={() => { setEditing(article); setMode('edit'); }}
            />
          ) : articleError ? (
            <EmptyState title="Article not available" text={articleError} />
          ) : (
            <LandingView groups={groups} onOpen={openArticle} />
          )}
        </main>
      </div>
    </div>
  );
}

function ArticleView({ article, canAuthor, onEdit }) {
  const { name: appName } = appMeta(article.appId);
  const editable = canAuthor && article.scope === 'org';
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-dark-500 flex-wrap">
          <BookOpen size={12} />
          <span>Knowledge Base</span>
          <ChevronRight size={12} />
          <span>{appName}</span>
          {article.section && (<><ChevronRight size={12} /><span>{article.section}</span></>)}
          <ChevronRight size={12} />
          <span className="text-dark-300">{article.title}</span>
          {article.scope === 'org' && <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-medium">Your org</span>}
        </div>
        {editable && (
          <button type="button" onClick={onEdit} className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg text-xs text-dark-300 border border-dark-800 hover:border-sky-500/30">
            <Pencil size={12} /> Edit
          </button>
        )}
      </div>

      <h1 className="text-3xl font-bold text-dark-100 mb-2">{article.title}</h1>
      {article.description && <p className="text-sm text-dark-400 italic mb-6 pb-6 border-b border-dark-800">{article.description}</p>}

      <article className="max-w-3xl">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{article.body}</ReactMarkdown>
      </article>

      <div className="mt-10 pt-6 border-t border-dark-800 text-xs text-dark-500">
        {article.lastReviewedAt ? `Last reviewed ${new Date(article.lastReviewedAt).toLocaleDateString()}.` : 'Reviewed against codebase state at time of authoring.'}
      </div>
    </>
  );
}

function SearchResults({ q, searching, results, onOpen }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-dark-400 mb-5">
        <Search size={15} />
        <span>Results for <span className="text-dark-200 font-medium">“{q.trim()}”</span></span>
        {searching && <Loader2 size={13} className="animate-spin text-dark-500" />}
      </div>
      {!searching && results.length === 0 && <EmptyState title="No matches" text="Try a different term or browse the apps on the left." />}
      <div className="space-y-2">
        {results.map((r) => (
          <button key={r.id || r.slug} type="button" onClick={() => onOpen(r.slug)} className="w-full text-left p-4 rounded-lg bg-dark-950 border border-dark-800 hover:border-sky-500/30 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-dark-500">{appMeta(r.appId).name}</span>
              {r.scope === 'org' && <span className="text-[10px] text-emerald-400">Your org</span>}
            </div>
            <h3 className="text-sm font-semibold text-dark-100 mb-1">{r.title}</h3>
            <p className="text-xs text-dark-400 leading-relaxed">{r.snippet}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function LandingView({ groups, onOpen }) {
  if (groups.length === 0) return <EmptyState title="Nothing here yet" text="Articles will appear as they’re published for the apps you can access." />;
  return (
    <div>
      <p className="text-sm text-dark-400 mb-6">Browse how-to guides by app, search above, or use <span className="text-rivvra-400">Ask AI</span> for a direct answer.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {groups.map((g) => {
          const Icon = g.icon;
          const first = g.sections[0]?.articles[0];
          const count = g.sections.reduce((n, s) => n + s.articles.length, 0);
          return (
            <button key={g.appId} type="button" onClick={() => first && onOpen(first.slug)} className="text-left p-4 rounded-xl bg-dark-950 border border-dark-800 hover:border-sky-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                  <Icon size={15} className="text-sky-400" />
                </div>
                <h3 className="text-sm font-semibold text-dark-100">{g.name}</h3>
              </div>
              <p className="text-xs text-dark-500">{count} article{count === 1 ? '' : 's'}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <BookOpen size={36} className="text-dark-600 mb-3" />
      <h2 className="text-lg font-semibold text-dark-200 mb-1">{title}</h2>
      <p className="text-sm text-dark-500 max-w-md">{text}</p>
    </div>
  );
}
