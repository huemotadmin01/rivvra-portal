import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, Loader2, CornerDownLeft, FileText } from 'lucide-react';
import knowledgeBaseApi from '../../utils/knowledgeBaseApi';

// Compact markdown styling for AI answers.
const ansComponents = {
  p: (props) => <p className="text-sm text-dark-200 leading-relaxed mb-3" {...props} />,
  ul: (props) => <ul className="list-disc pl-5 text-sm text-dark-200 space-y-1 mb-3 marker:text-dark-500" {...props} />,
  ol: (props) => <ol className="list-decimal pl-5 text-sm text-dark-200 space-y-1 mb-3 marker:text-dark-500" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold text-dark-100" {...props} />,
  code: (props) => <code className="px-1 py-0.5 rounded bg-dark-800 text-rivvra-300 text-[0.8em] font-mono" {...props} />,
  a: (props) => <a className="text-rivvra-400 underline" target="_blank" rel="noreferrer" {...props} />,
};

/**
 * KbAskPanel — natural-language Q&A over the knowledge base.
 * Answers are generated from articles the user can see, with citations that
 * open the source article.
 */
export default function KbAskPanel({ orgSlug, onOpenArticle }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [citations, setCitations] = useState([]);
  const [note, setNote] = useState(null); // 'degraded' | 'capped' | null

  const ask = async () => {
    const q = question.trim();
    if (q.length < 3 || loading) return;
    setLoading(true);
    setAnswer(null);
    setCitations([]);
    setNote(null);
    try {
      const res = await knowledgeBaseApi.ask(orgSlug, q);
      setAnswer(res.answer || 'No answer.');
      setCitations(res.citations || []);
      setNote(res.degraded ? 'degraded' : res.capped ? 'capped' : null);
    } catch (e) {
      setAnswer(e?.message || 'The assistant is unavailable right now. Try browsing or searching instead.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-rivvra-500/10 border border-rivvra-500/20 flex items-center justify-center">
          <Sparkles size={15} className="text-rivvra-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-dark-100">Ask the Knowledge Base</h2>
          <p className="text-xs text-dark-500">Answers are drawn from articles you can access, with sources.</p>
        </div>
      </div>

      <div className="relative mb-5">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          rows={2}
          placeholder="e.g. How do I submit an expense claim in a foreign currency?"
          className="w-full resize-none px-4 py-3 pr-12 rounded-xl bg-dark-950 border border-dark-800 text-sm text-dark-200 placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500/40"
        />
        <button
          type="button"
          onClick={ask}
          disabled={loading || question.trim().length < 3}
          className="absolute right-2.5 bottom-2.5 w-8 h-8 rounded-lg bg-rivvra-500 text-dark-950 flex items-center justify-center disabled:opacity-40 hover:bg-rivvra-400 transition-colors"
          title="Ask (Enter)"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <CornerDownLeft size={15} />}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-dark-500">
          <Loader2 size={14} className="animate-spin" /> Searching the knowledge base…
        </div>
      )}

      {answer && !loading && (
        <div className="rounded-xl bg-dark-950 border border-dark-800 p-5">
          {note === 'degraded' && (
            <p className="text-xs text-amber-400/90 mb-3">AI answers aren’t enabled on this workspace — showing the most relevant articles.</p>
          )}
          {note === 'capped' && (
            <p className="text-xs text-amber-400/90 mb-3">This workspace hit its monthly AI limit — showing the most relevant articles.</p>
          )}
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={ansComponents}>{answer}</ReactMarkdown>

          {citations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dark-800">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-dark-500 mb-2">Sources</p>
              <div className="flex flex-wrap gap-2">
                {citations.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => onOpenArticle(c.slug)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-900 border border-dark-800 hover:border-rivvra-500/30 text-xs text-dark-300 transition-colors"
                  >
                    <FileText size={12} className="text-dark-500" />
                    {c.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!answer && !loading && (
        <p className="text-xs text-dark-600">
          Tip: ask a full question like “how do I win a CRM deal?” rather than a keyword.
        </p>
      )}
    </div>
  );
}
