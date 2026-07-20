import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import ChangePasswordModal from './components/ChangePasswordModal';
import LoginPage from './pages/LoginPage';
import SchedulePage from './pages/SchedulePage';
import JobsPage from './pages/JobsPage';
import ClientsPage from './pages/ClientsPage';
import EmployeesPage from './pages/EmployeesPage';
import SummariesPage from './pages/SummariesPage';
import UsersPage from './pages/UsersPage';

function Gate() {
  const { user, loading, refresh } = useAuth();

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;
  if (!user) return <LoginPage />;
  if (user.must_change_password) {
    return <ChangePasswordModal mandatory onClose={() => {}} onChanged={refresh} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SchedulePage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="summaries" element={<SummariesPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
