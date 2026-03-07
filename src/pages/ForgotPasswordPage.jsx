/**
 * ForgotPasswordPage — Informational page directing users to contact their admin.
 * Route: /forgot-password (public, no auth required)
 *
 * Self-service password reset is disabled. Only admins can send reset links.
 */
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const workspace = searchParams.get('workspace');
  const backToLogin = workspace ? `/org/${workspace}/login` : '/login';

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-amber-400" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Forgot Your Password?</h1>

        <div className="card p-6 mt-6 text-left space-y-4">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-rivvra-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-dark-200 leading-relaxed">
                For security, password resets are managed by your organization administrator.
              </p>
              <p className="text-sm text-dark-400 mt-2 leading-relaxed">
                Please contact your admin and ask them to send you a password reset link from
                <span className="text-dark-200 font-medium"> Settings &gt; Users &amp; Teams</span>.
              </p>
            </div>
          </div>
        </div>

        <Link
          to={backToLogin}
          className="inline-flex items-center gap-2 mt-6 text-sm text-dark-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Login
        </Link>
      </div>
    </div>
  );
}
