import { Link } from 'react-router-dom';
import { Rocket, ArrowRight } from 'lucide-react';
import { buildOnboardingGroups } from '../pages/OnboardingHubPage';

/* Launcher entry to the onboarding hub. Deliberately NOT the task list: the
   list lives on /getting-started so it survives dismissal and can be returned
   to from the sidebar rail. This is the advert — progress, next step, one
   click in, and a way to hide it from the launcher. */
export default function OnboardingHubTeaser({ data, orgPath, enabledApps, onDismiss }) {
  const apps = new Set(enabledApps || []);
  const tasks = buildOnboardingGroups({ data, apps, orgPath }).flatMap((g) => g.tasks);
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.done).length;
  if (done === tasks.length) return null;
  const pct = Math.round((done / tasks.length) * 100);
  const next = tasks.find((t) => !t.done);

  return (
    <div
      className="mb-6 rounded-xl border border-dark-800 bg-dark-900/60 backdrop-blur px-5 py-4"
      style={{ animation: 'fadeSlideUp 0.5s ease-out 0.08s both' }}
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-10 h-10 rounded-lg bg-rivvra-500/15 flex items-center justify-center flex-shrink-0">
          <Rocket className="w-5 h-5 text-rivvra-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            Finish setting up your workspace
          </p>
          <p className="text-xs text-dark-400 mt-0.5 truncate">
            {done} of {tasks.length} steps done{next ? ` · Next: ${next.label}` : ''}
          </p>
          <div className="h-1 mt-2 rounded-full bg-dark-800 overflow-hidden max-w-sm">
            <div className="h-full bg-rivvra-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to={orgPath('/getting-started')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors"
          >
            Open onboarding hub
            <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-2 rounded-lg text-sm text-dark-400 hover:text-white transition-colors"
          >
            Hide
          </button>
        </div>
      </div>
    </div>
  );
}
