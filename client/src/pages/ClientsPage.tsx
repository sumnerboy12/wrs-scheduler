import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Client } from '../types';
import ClientModal from '../components/ClientModal';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    setLoading(true);
    api.getClients().then((data) => {
      setClients(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Clients</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          + Add Client
        </button>
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
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: client.color }} />
                  </td>
                  <td>{client.name}</td>
                  <td>{client.notes}</td>
                  <td>
                    <button className="btn" onClick={() => setEditing(client)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No clients yet. A job's colour on the Schedule comes from its linked client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <ClientModal
          client={null}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await api.createClient(data);
            load();
          }}
        />
      )}
      {editing && (
        <ClientModal
          client={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await api.updateClient(editing.id, data);
            load();
          }}
          onDelete={async (id) => {
            await api.deleteClient(id);
            load();
          }}
        />
      )}
    </div>
  );
}
