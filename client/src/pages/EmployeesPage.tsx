import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Employee } from '../types';
import EmployeeModal from '../components/EmployeeModal';
import ImportModal, { type ImportField } from '../components/ImportModal';

const EMPLOYEE_IMPORT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'employee', 'employee name', 'full name', 'staff name'] },
  { key: 'role', label: 'Role', aliases: ['role', 'position', 'title', 'job title'] },
  { key: 'email', label: 'Email', aliases: ['email', 'email address', 'e-mail'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'mobile', 'cell', 'phone number', 'contact number'] },
];

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = () => {
    setLoading(true);
    api.getEmployees().then((data) => {
      setEmployees(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const visible = employees.filter((e) => showInactive || e.active);

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Employees</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ width: 'auto' }} />
            Show inactive
          </label>
          <button className="btn" onClick={() => setShowImport(true)}>
            Import
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Add Employee
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((emp) => (
                <tr key={emp.id} style={{ opacity: emp.active ? 1 : 0.5 }}>
                  <td>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: emp.color }} />
                  </td>
                  <td>{emp.name}</td>
                  <td>{emp.role}</td>
                  <td>{emp.email}</td>
                  <td>{emp.phone}</td>
                  <td>{emp.active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button className="btn" onClick={() => setEditing(emp)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No employees yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <EmployeeModal
          employee={null}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await api.createEmployee(data);
            load();
          }}
        />
      )}
      {editing && (
        <EmployeeModal
          employee={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await api.updateEmployee(editing.id, data);
            load();
          }}
          onDelete={async (id) => {
            await api.deleteEmployee(id);
            load();
          }}
        />
      )}
      {showImport && (
        <ImportModal
          title="Import Employees"
          fields={EMPLOYEE_IMPORT_FIELDS}
          onClose={() => setShowImport(false)}
          onImportRow={async (values) => {
            await api.createEmployee({
              name: values.name,
              role: values.role || null,
              email: values.email || null,
              phone: values.phone || null,
            });
          }}
          onDone={load}
        />
      )}
    </div>
  );
}
