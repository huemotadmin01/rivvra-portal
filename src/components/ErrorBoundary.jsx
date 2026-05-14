import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// 2026-05-13: detect stale-chunk errors. When Vite ships a new deploy
// it re-hashes lazy chunks (e.g. AtsApplicationDetail-XYZ.js). Sessions
// that loaded the old index.html before the deploy hold stale chunk
// URLs in memory; the next dynamic import 404s with one of the
// browser-specific phrasings below. The fix is a hard reload — the
// fresh index.html references the new chunk hashes. We can't retry
// in-place; the cached module reference is permanently stale.
//
// Auto-reload once on first hit so most users never see this screen.
// A sessionStorage flag prevents an infinite reload loop if the issue
// is something other than a stale chunk.
function isChunkLoadError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  return (
    /Failed to fetch dynamically imported module/i.test(msg)
    || /Importing a module script failed/i.test(msg)
    || /Loading chunk \d+ failed/i.test(msg)
    || /ChunkLoadError/i.test(err.name || '')
  );
}

const RELOAD_FLAG = 'rivvra:chunk-reload-attempted';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // Stale-chunk auto-recovery: hard-reload once. The sessionStorage
    // gate ensures we don't loop forever if the chunk is genuinely
    // missing from the deploy.
    if (isChunkLoadError(error)) {
      try {
        const tried = sessionStorage.getItem(RELOAD_FLAG);
        if (!tried) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
        }
      } catch (_) { /* sessionStorage blocked → user has to click */ }
    } else {
      // Clear the flag on any non-chunk error so the next chunk error
      // gets its auto-retry budget back.
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch (_) {}
    }
  }

  handleRetry = () => {
    if (this.state.isChunkError) {
      // For stale chunks, a state reset won't help — the cached module
      // reference is permanently stale. Force a hard reload.
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null, isChunkError: false });
  };

  render() {
    if (this.state.hasError) {
      const { isChunkError } = this.state;
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {isChunkError ? 'A new version was deployed' : 'Something went wrong'}
            </h2>
            <p className="text-dark-400 mb-6 text-sm">
              {isChunkError
                ? 'Your browser was running an older version. Reload to pick up the latest.'
                : (typeof this.state.error?.message === 'string'
                  ? this.state.error.message
                  : 'An unexpected error occurred. Please try again.')}
            </p>
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg font-medium hover:bg-rivvra-400 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {isChunkError ? 'Reload' : 'Try Again'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
