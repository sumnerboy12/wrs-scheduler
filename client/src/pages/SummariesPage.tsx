import { useState } from 'react';
import EmployeeSummariesTab from '../components/EmployeeSummariesTab';
import JobSummariesTab from '../components/JobSummariesTab';

type Tab = 'employees' | 'jobs';

export default function SummariesPage() {
  const [tab, setTab] = useState<Tab>('employees');

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Summaries</h1>
        <div className="toolbar-group">
          <button
            className="btn"
            onClick={() => setTab('employees')}
            style={{ background: tab === 'employees' ? 'var(--accent)' : undefined, borderColor: tab === 'employees' ? 'var(--accent)' : undefined }}
          >
            Employees
          </button>
          <button
            className="btn"
            onClick={() => setTab('jobs')}
            style={{ background: tab === 'jobs' ? 'var(--accent)' : undefined, borderColor: tab === 'jobs' ? 'var(--accent)' : undefined }}
          >
            Supervisors
          </button>
        </div>
      </div>
      {tab === 'employees' ? <EmployeeSummariesTab /> : <JobSummariesTab />}
    </div>
  );
}
