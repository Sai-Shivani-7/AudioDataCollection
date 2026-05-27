import { useCallback, useEffect, useRef, useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { api } from '../api/client';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function AuthPage({ onAuth }) {
  const googleButtonRef = useRef(null);
  const gsiInitializedRef = useRef(false);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const storeAuth = useCallback(
    (payload) => {
      localStorage.setItem('sdc-auth-token', payload.token);
      localStorage.setItem('sdc-auth-user', JSON.stringify(payload.user));
      onAuth(payload.user);
    },
    [onAuth],
  );

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login';
      const response = await api.post(endpoint, { ...form, role: 'admin' });
      storeAuth(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleCredential(credentialResponse) {
    setError('');
    try {
      const response = await api.post('/auth/google', {
        credential: credentialResponse.credential,
        role: 'admin',
      });
      storeAuth(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Google sign-in failed.');
    }
  }

  function renderGoogleButton() {
    if (!googleButtonRef.current || !window.google?.accounts?.id) return;

    googleButtonRef.current.innerHTML = '';

    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      width: 280,
    });
  }

  function initializeGsi() {
    if (!window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
    });

    gsiInitializedRef.current = true;
    renderGoogleButton();
  }

  useEffect(() => {
    if (!googleClientId) return;

    if (gsiInitializedRef.current && window.google?.accounts?.id) {
      renderGoogleButton();
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    );

    if (existingScript && window.google?.accounts?.id) {
      initializeGsi();
      return;
    }

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => initializeGsi();
      document.head.appendChild(script);
    }
    // Keep the GSI script in the page for the lifetime of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Secure Access</p>
        <h1>{mode === 'signup' ? 'Create doctor account' : 'Doctor login'}</h1>
        <p>Doctors can record patient speech sessions, save audio responses, and review reports from the dashboard.</p>

        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && (
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="primary" type="submit" disabled={loading}>
            {mode === 'signup' ? <UserPlus size={18} /> : <LogIn size={18} />}
            {loading ? 'Please wait...' : mode === 'signup' ? 'Sign Up' : 'Login'}
          </button>
        </form>

        <div className="auth-divider">or</div>
        {googleClientId ? <div ref={googleButtonRef} /> : <p className="inline-status">Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in.</p>}

        <button className="text-button" type="button" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
          {mode === 'signup' ? 'Already have an account? Login' : 'Need an account? Sign up'}
        </button>
      </section>
    </main>
  );
}
