'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

interface PortGroup {
  id: string;
  key: string;
  name: string;
  description: string | null;
  ports: number[];
  enabled: boolean;
  publicExposureAllowed: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function PortGroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<PortGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPorts, setFormPorts] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const ALLOWED_PORTS = [51032, 51033, 51034, 51035];

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/port-groups');
      if (res.ok) setGroups(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        router.push('/login');
        return;
      }
      await fetchGroups();
    };
    checkAuth();
  }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormKey('');
    setFormName('');
    setFormDesc('');
    setFormPorts('');
    setFormEnabled(true);
    setError('');
    setFieldErrors({});
  };

  const handleEdit = (g: PortGroup) => {
    setShowForm(true);
    setEditingId(g.id);
    setFormKey(g.key);
    setFormName(g.name);
    setFormDesc(g.description || '');
    setFormPorts(g.ports.join(', '));
    setFormEnabled(g.enabled);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this port group?')) return;
    try {
      const res = await fetch(`/api/port-groups?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSuccess('Deleted.');
        await fetchGroups();
      }
    } catch (e) {
      setError('Failed to delete.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const ports = formPorts
      .split(',')
      .map(p => parseInt(p.trim(), 10))
      .filter(p => !isNaN(p) && ALLOWED_PORTS.includes(p));

    const errors: Record<string, string> = {};

    if (!editingId && !formKey.trim()) {
      errors.key = 'Key is required';
    }
    if (!formName.trim()) {
      errors.name = 'Name is required';
    }
    if (ports.length === 0) {
      errors.ports = 'At least one valid port is required';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      if (editingId) {
        const res = await fetch('/api/port-groups', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            name: formName.trim(),
            description: formDesc.trim() || null,
            ports,
            enabled: formEnabled,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSuccess('Updated.');
      } else {
        const res = await fetch('/api/port-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: formKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 32),
            name: formName.trim(),
            description: formDesc.trim() || null,
            ports,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSuccess('Created.');
      }
      resetForm();
      await fetchGroups();
    } catch (err: any) {
      setError(err.message || 'Save failed.');
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Loading...</h2>
      </div>
    );
  }

  return (
    <>
      <Header />

      <main className="container animate-fade-in" style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Protected Port Groups</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              These define which ports appear in allowlist rule forms. Only ports in the protected set ({ALLOWED_PORTS.join(', ')}) are valid.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
            Add Group
          </button>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', background: 'var(--danger-glow)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ color: 'var(--success)', background: 'var(--success-glow)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {success}
          </div>
        )}

        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>{editingId ? 'Edit' : 'New'} Port Group</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Key</label>
                  <input
                    type="text"
                    className="form-input"
                    style={fieldErrors.key ? { borderColor: 'var(--danger)' } : undefined}
                    value={formKey}
                    onChange={e => { setFormKey(e.target.value); setFieldErrors(prev => ({ ...prev, key: '' })); }}
                    disabled={!!editingId}
                    placeholder="e.g. postgres"
                  />
                  {fieldErrors.key && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{fieldErrors.key}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-input"
                    style={fieldErrors.name ? { borderColor: 'var(--danger)' } : undefined}
                    value={formName}
                    onChange={e => { setFormName(e.target.value); setFieldErrors(prev => ({ ...prev, name: '' })); }}
                    placeholder="e.g. PostgreSQL (DevDB)"
                  />
                  {fieldErrors.name && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{fieldErrors.name}</span>}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="e.g. Port 51032"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Ports (comma-separated)</label>
                  <input
                    type="text"
                    className="form-input"
                    style={fieldErrors.ports ? { borderColor: 'var(--danger)' } : undefined}
                    value={formPorts}
                    onChange={e => { setFormPorts(e.target.value); setFieldErrors(prev => ({ ...prev, ports: '' })); }}
                    placeholder="51032, 51033"
                  />
                  {fieldErrors.ports && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{fieldErrors.ports}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Enabled</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formEnabled} onChange={e => setFormEnabled(e.target.checked)} />
                    Active
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary">{editingId ? 'Save' : 'Create'}</button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th>Description</th>
                <th>Ports</th>
                <th>Enabled</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No port groups defined.
                  </td>
                </tr>
              ) : (
                groups.map(g => (
                  <tr key={g.id} style={{ opacity: g.enabled ? 1 : 0.4 }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{g.key}</td>
                    <td>{g.name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{g.description || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{g.ports.join(', ') || '—'}</td>
                    <td>
                      <span className={`badge ${g.enabled ? 'badge-success' : 'badge-danger'}`}>
                        {g.enabled ? 'On' : 'Off'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', marginRight: '0.25rem' }} onClick={() => handleEdit(g)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }} onClick={() => handleDelete(g.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
