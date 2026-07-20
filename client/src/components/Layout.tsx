import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ChangePasswordModal from './ChangePasswordModal';

const navStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: '10px 16px',
  color: isActive ? 'white' : 'var(--text-dim)',
  // --nav-accent rather than --accent — keeps the main nav visually
  // distinct from in-page toolbar controls (period/grouping toggles),
  // which use --accent.
  background: isActive ? 'var(--nav-accent)' : 'transparent',
  borderRadius: 6,
  textDecoration: 'none',
  fontWeight: isActive ? 600 : 500,
  fontSize: 14,
});

export default function Layout() {
  const { user, logout, refresh } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/favicon.svg" alt="" width={22} height={22} style={{ borderRadius: 5 }} />
          <strong style={{ fontSize: 16 }}>Rostr</strong>
        </div>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 20 }}>
          <NavLink to="/" end style={navStyle}>
            Schedule
          </NavLink>
          <NavLink to="/jobs" style={navStyle}>
            Jobs
          </NavLink>
          <NavLink to="/clients" style={navStyle}>
            Clients
          </NavLink>
          <NavLink to="/employees" style={navStyle}>
            Employees
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/users" style={navStyle}>
              Users
            </NavLink>
          )}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: 'var(--text-dim)' }}>
          <span>{user?.username}</span>
          <button className="btn" onClick={() => setChangingPassword(true)}>
            Change password
          </button>
          <button className="btn" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Outlet />
      </main>
      {changingPassword && (
        <ChangePasswordModal
          onClose={() => setChangingPassword(false)}
          onChanged={() => {
            setChangingPassword(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
