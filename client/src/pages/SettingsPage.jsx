import { Link, useNavigate } from 'react-router-dom';
import { useOrg } from '../hooks/useOrg.js';

function readUser() {
  try { return JSON.parse(localStorage.getItem('sel_current_user') ?? 'null'); }
  catch { return null; }
}

function clearSession() {
  try {
    localStorage.removeItem('sel_current_org');
    localStorage.removeItem('sel_current_user');
  } catch { /* private mode */ }
}

/** Settings: venue + account at a glance, and the log out control. */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { data: org, isLoading } = useOrg();
  const user = readUser();

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  return (
    <main className="page">
      <h2 className="page-title">Settings</h2>

      <div className="detail-lines">
        <div className="detail-category">Venue</div>
        <div className="detail-line">
          <span>Organization</span>
          <span>{isLoading ? '…' : (org?.name ?? '—')}</span>
        </div>
      </div>

      <div className="detail-lines">
        <div className="detail-category">Account</div>
        {user ? (
          <>
            <div className="detail-line">
              <span>Signed in as</span>
              <span>{user.email}</span>
            </div>
            <div className="detail-line">
              <span>Role</span>
              <span style={{ textTransform: 'capitalize' }}>{user.role}</span>
            </div>
          </>
        ) : (
          <div className="detail-line">
            <span>Not signed in</span>
            <Link to="/login" className="receive-pill" style={{ textDecoration: 'none' }}>Log in</Link>
          </div>
        )}
      </div>

      <div className="detail-actions">
        {user ? (
          <button className="btn btn-danger" onClick={logout}>Log out</button>
        ) : (
          <Link to="/login" className="btn btn-primary">Log in</Link>
        )}
      </div>

      <p className="order-card-meta" style={{ textAlign: 'center', marginTop: 14 }}>
        Roles and multi-user management arrive with the auth phase.
      </p>
    </main>
  );
}
