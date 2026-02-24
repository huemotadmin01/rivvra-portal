import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, Search, CheckCircle2, ArrowLeft } from 'lucide-react';
import RivvraLogo from '../components/BrynsaLogo';
import api from '../utils/api';

function FindWorkspacePage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.findWorkspace(email);
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rivvra-500/20 to-emerald-500/20 border border-rivvra-500/30 flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-rivvra-400" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <RivvraLogo className="w-6 h-6" />
            <span className="text-xl font-bold text-white">Find your workspace</span>
          </div>
          <p className="text-dark-400 text-sm text-center">
            Enter your email and we'll send your workspace login URL.
          </p>
        </div>

        {/* Card */}
        <div className="bg-dark-900/80 border border-dark-800 rounded-2xl p-8 backdrop-blur-sm">
          {sent ? (
            /* Success State */
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-rivvra-500/10 border border-rivvra-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-rivvra-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Check your inbox</h3>
                <p className="text-dark-400 text-sm">
                  If an account exists with <span className="text-white font-medium">{email}</span>,
                  we've sent your workspace URL. Check your email (including spam folder).
                </p>
              </div>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors"
              >
                Try a different email
              </button>
            </div>
          ) : (
            /* Form State */
            <>
              {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="input-field pl-12"
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Mail className="w-5 h-5" />
                      Send workspace URL
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer Links */}
        <div className="text-center space-y-2 mt-6">
          <p className="text-dark-400 text-sm">
            <Link to="/signup" className="text-rivvra-400 hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back to Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default FindWorkspacePage;
