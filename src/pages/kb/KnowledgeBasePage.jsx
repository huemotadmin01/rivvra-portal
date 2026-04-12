import { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, ChevronRight, FileText } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import {
  getAllCategoriesWithArticles,
  getArticleBySlug,
  ARTICLES,
} from '../../content/knowledge';

// ── Markdown renderer styling ────────────────────────────────────────────
// react-markdown lets us override each HTML element it generates so we can
// apply Tailwind classes consistent with the rest of the portal (dark theme,
// rivvra/orange accents). We avoid @tailwindcss/typography to keep the bundle
// lean and the styling predictable.
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

export default function KnowledgeBasePage() {
  const { orgSlug } = usePlatform();
  const { articleSlug } = useParams();
  const navigate = useNavigate();

  const categories = useMemo(() => getAllCategoriesWithArticles(), []);

  // If no article selected in URL, fall back to the first available article
  const effectiveSlug = articleSlug || ARTICLES[0]?.slug || null;
  const article = effectiveSlug ? getArticleBySlug(effectiveSlug) : null;

  const buildLink = (slug) => `/org/${orgSlug}/knowledge-base/${slug}`;

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
          <BookOpen size={20} className="text-sky-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Knowledge Base</h1>
          <p className="text-sm text-dark-400">Admin guides and workflow walkthroughs for the Rivvra platform</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* ── Left nav: categories + articles ───────────────────────── */}
        <aside className="bg-dark-900 border border-dark-800 rounded-xl p-3 h-fit lg:sticky lg:top-4">
          {categories.length === 0 && (
            <p className="text-xs text-dark-500 p-3">No articles yet.</p>
          )}
          {categories.map((cat) => (
            <div key={cat.id} className="mb-4 last:mb-0">
              <div className="px-3 py-2">
                <h3 className="text-[10px] uppercase tracking-wider font-semibold text-dark-500">{cat.name}</h3>
                <p className="text-[11px] text-dark-600 mt-0.5">{cat.description}</p>
              </div>
              <div className="space-y-0.5">
                {cat.articles.map((a) => {
                  const active = a.slug === effectiveSlug;
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      onClick={() => navigate(buildLink(a.slug))}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-start gap-2 transition-colors ${
                        active
                          ? 'bg-sky-500/10 border border-sky-500/20 text-sky-300'
                          : 'text-dark-300 hover:bg-dark-800 border border-transparent'
                      }`}
                    >
                      <FileText size={14} className={`mt-0.5 shrink-0 ${active ? 'text-sky-400' : 'text-dark-500'}`} />
                      <span className="text-sm leading-tight">{a.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* ── Right: article content ────────────────────────────────── */}
        <main className="bg-dark-900 border border-dark-800 rounded-xl px-6 py-5 lg:px-10 lg:py-8 min-h-[60vh]">
          {article ? (
            <>
              {/* Breadcrumb strip */}
              <div className="flex items-center gap-1.5 text-xs text-dark-500 mb-4">
                <BookOpen size={12} />
                <span>Knowledge Base</span>
                <ChevronRight size={12} />
                <span className="capitalize">{article.category}</span>
                <ChevronRight size={12} />
                <span className="text-dark-300">{article.title}</span>
              </div>

              {/* Article description / intro */}
              <p className="text-sm text-dark-400 italic mb-6 pb-6 border-b border-dark-800">
                {article.description}
              </p>

              {/* Markdown body */}
              <article className="max-w-3xl">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {article.body}
                </ReactMarkdown>
              </article>

              {/* Footer CTA: back to index */}
              <div className="mt-10 pt-6 border-t border-dark-800 flex items-center justify-between text-xs text-dark-500">
                <span>Last reviewed against codebase state at time of authoring.</span>
                <Link to={`/org/${orgSlug}/knowledge-base`} className="text-sky-400 hover:text-sky-300">
                  Back to index
                </Link>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen size={36} className="text-dark-600 mb-3" />
              <h2 className="text-lg font-semibold text-dark-200 mb-1">Article not found</h2>
              <p className="text-sm text-dark-500">The article you&apos;re looking for doesn&apos;t exist. Pick one from the list on the left.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
