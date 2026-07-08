import { NavLink, Outlet } from 'react-router-dom';

const navStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: '10px 16px',
  color: isActive ? 'white' : 'var(--text-dim)',
  background: isActive ? 'var(--accent)' : 'transparent',
  borderRadius: 6,
  textDecoration: 'none',
  fontWeight: isActive ? 600 : 500,
  fontSize: 14,
});

export default function Layout() {
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
        <strong style={{ fontSize: 16 }}>Wayman Roofing &mdash; Scheduler</strong>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 20 }}>
          <NavLink to="/" end style={navStyle}>
            Schedule
          </NavLink>
          <NavLink to="/jobs" style={navStyle}>
            Jobs
          </NavLink>
          <NavLink to="/employees" style={navStyle}>
            Employees
          </NavLink>
        </nav>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
