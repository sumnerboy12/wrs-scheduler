import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import SchedulePage from './pages/SchedulePage';
import JobsPage from './pages/JobsPage';
import EmployeesPage from './pages/EmployeesPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<SchedulePage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="employees" element={<EmployeesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
