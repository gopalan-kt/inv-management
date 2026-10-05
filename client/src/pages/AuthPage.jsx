import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPublic, setOrgId } from '../api/client.js';

/** Login / Register. Real accounts against the backend — registering creates
 *  a NEW organization with you as its owner (multi-tenant ready). */
export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = isLogin
        ? { email: email.trim(), password }
        : { orgName: orgName.trim(), email: email.trim(), password };
      const res = await apiPublic(`/auth/${isLogin ? 'login' : 'register'}`, { body });
      setOrgId(res.org.id);
      try { localStorage.setItem('sel_current_user', JSON.stringify(res.user)); } catch { /* private mode */ }
      document.title = `${res.org.name} — Inventory Management`;
      navigate('/to-order');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="landing-nav">
        <Link to="/" className="landing-brand">Inventory Management <span>System</span></Link>
        <nav className="landing-nav-actions">
          <Link className="landing-login" to="/to-order">Open the App</Link>
        </nav>
      </header>

      <div className="auth-card">
        <h1>{isLogin ? 'Log in' : 'Create your account'}</h1>
        <p className="auth-sub">
          {isLogin
            ? 'Welcome back — sign in to your venue’s inventory.'
            : 'Registers a NEW organization with you as its owner — each venue gets its own isolated data.'}
        </p>

        <form onSubmit={submit} className="auth-form">
          {!isLogin && (
            <div className="form-row">
              <label>Organization name (your venue)</label>
              <input
                type="text"
                value={orgName}
                placeholder="e.g. Desi District - Lewisville"
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="form-row">
            <label>Email</label>
            <input
              type="email"
              value={email}
              placeholder="you@yourvenue.com"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input
              type="password"
              value={password}
              placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
              minLength={isLogin ? undefined : 8}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="auth-error">{error}</div>
          )}
          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? '…' : isLogin ? 'Log in' : 'Create account'}
          </button>
        </form>

        <div className="auth-alt">
          {isLogin
            ? <>New here? <Link to="/register">Create an account</Link></>
            : <>Already have an account? <Link to="/login">Log in</Link></>}
        </div>

        <div className="auth-apphint">
          Just testing? <Link to="/to-order">Open the app without an account</Link> — staff
          access stays open until roles ship.
        </div>
      </div>
    </div>
  );
}
