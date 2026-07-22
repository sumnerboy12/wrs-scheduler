import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

const OIDC_ERROR_MESSAGES: Record<string, string> = {
  oidc_expired: 'Sign-in took too long — please try again.',
  oidc_no_email: "Your identity provider didn't share an email address, so Rostr can't match your account.",
  oidc_no_account: "No Rostr account matches your email. Ask an admin to add it under Users.",
  oidc_failed: 'Sign-in failed. Please try again.',
};

export default function LoginPage() {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);

  useEffect(() => {
    api.getOidcStatus().then((s) => setOidcEnabled(s.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    const oidcError = searchParams.get('error');
    if (oidcError) setError(OIDC_ERROR_MESSAGES[oidcError] ?? 'Sign-in failed. Please try again.');
  }, [searchParams]);

  const handleSubmit = async () => {
    if (!username || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div className="card" style={{ width: 320, padding: 24 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, marginTop: 0, marginBottom: 20 }}>
          <img src="/favicon.svg" alt="" width={24} height={24} style={{ borderRadius: 5 }} />
          Rostr
        </h1>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        {oidcEnabled && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: 'var(--text-dim)', fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              or
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <a
              href="/api/auth/oidc/login"
              className="btn"
              style={{ width: '100%', display: 'block', textAlign: 'center', boxSizing: 'border-box', textDecoration: 'none' }}
            >
              Sign in with SSO
            </a>
          </>
        )}
      </div>
    </div>
  );
}
