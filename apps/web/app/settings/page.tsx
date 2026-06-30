'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';

interface Passkey {
  id: string;
  credentialId?: string;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface Server {
  id: string;
  name: string;
  lastSeenAt: string | null;
  createdAt: string;
  entryCount: number;
}

type Tab = 'passkeys' | 'servers';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('passkeys');

  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [newServerName, setNewServerName] = useState('');
  const [bootstrapCommand, setBootstrapCommand] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSettingsData = async () => {
    try {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        router.push('/login');
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      if (meData.user.id) {
        const pkRes = await fetch(`/api/auth/passkey/list?userId=${meData.user.id}`).catch(() => null);
        if (pkRes && pkRes.ok) setPasskeys(await pkRes.json());
      }

      const svRes = await fetch('/api/servers');
      if (svRes.ok) setServers(await svRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, []);

  const handleRegisterPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setActionLoading(true);

    try {
      const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
      const options = await optRes.json();
      if (options.error) throw new Error(options.error);

      let regResponse;
      try {
        regResponse = await startRegistration({ optionsJSON: options });
      } catch (webauthnErr: any) {
        if (webauthnErr.name === 'NotAllowedError') {
          throw new Error('Passkey registration cancelled or not supported in this browser');
        }
        throw webauthnErr;
      }

      const verRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...regResponse, credentialName: newPasskeyName.trim() }),
      });

      const verifyResult = await verRes.json();
      if (verifyResult.error) throw new Error(verifyResult.error);

      setSuccess('Passkey registered successfully.');
      setNewPasskeyName('');
      await fetchSettingsData();
    } catch (err: any) {
      setError(err.message || 'Passkey enrollment failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBootstrapCommand('');
    setActionLoading(true);

    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newServerName.trim() }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setBootstrapCommand(data.bootstrapCommand);
      setNewServerName('');
      setSuccess(`Server "${data.name}" registered. Copy the bootstrap command below and run it on the worker.`);
      await fetchSettingsData();
    } catch (err: any) {
      setError(err.message || 'Failed to create server');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    if (!confirm('Delete this server? It will be re-registered if the agent checks in again.')) return;

    try {
      const res = await fetch(`/api/servers?id=${serverId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSuccess('Server deleted.');
        await fetchSettingsData();
      }
    } catch (err) {
      setError('Failed to delete server');
    }
  };

  const handleCopyBootstrap = () => {
    navigator.clipboard.writeText(bootstrapCommand);
    setSuccess('Bootstrap command copied to clipboard.');
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Loading settings...</h2>
      </div>
    );
  }

  return (
      <main className="container animate-fade-in" style={{ flex: 1 }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>System Settings</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          Configure passkey credentials and register worker servers.
        </p>

        {error && (
          <div style={{ color: 'var(--danger)', background: 'var(--danger-glow)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ color: 'var(--success)', background: 'var(--success-glow)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {success}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          {(['passkeys', 'servers'] as Tab[]).map(tab => (
            <button
              key={tab}
              className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
              onClick={() => { setActiveTab(tab); setError(''); setSuccess(''); }}
            >
              {tab === 'passkeys' ? 'Passkeys' : 'Servers'}
            </button>
          ))}
        </div>

        {activeTab === 'passkeys' && (
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Registered Passkeys</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {passkeys.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No passkeys registered.</p>
              ) : (
                passkeys.map(pk => (
                  <div key={pk.id} style={{ background: 'var(--btn-secondary-bg)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pk.name || 'Unnamed Passkey'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Registered: {new Date(pk.createdAt).toLocaleDateString()}</div>
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Verified</span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleRegisterPasskey} style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Enroll New Passkey</h4>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Passkey Name (e.g. My Laptop)"
                  value={newPasskeyName}
                  onChange={e => setNewPasskeyName(e.target.value)}
                  required
                  id="passkey-name-input"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.5rem 1rem', fontSize: '0.9rem' }} disabled={actionLoading || !newPasskeyName}>
                Enroll Passkey
              </button>
            </form>
          </div>
        )}

        {activeTab === 'servers' && (
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Register Worker Server</h3>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Register a new worker node on the master, then run the generated one-shot command on the worker machine.
              It will install the firewall agent, configure nftables, and connect back to this master.
            </p>

            {bootstrapCommand && (
              <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <strong style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
                    One-shot bootstrap command — run this on the worker:
                  </strong>
                  <button className="btn btn-secondary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }} onClick={handleCopyBootstrap}>
                    Copy
                  </button>
                </div>
                <pre style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-main)',
                  padding: '1rem',
                  borderRadius: '6px',
                  overflowX: 'auto',
                  fontSize: '0.8rem',
                  lineHeight: '1.6',
                  margin: 0,
                  border: '1px solid var(--border-color)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {bootstrapCommand}
                </pre>
              </div>
            )}

            <form onSubmit={handleAddServer} style={{ background: 'var(--input-bg)', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--border-color)', marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Add Worker Node</h4>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Server name (e.g. vps-frankfurt)"
                  value={newServerName}
                  onChange={e => setNewServerName(e.target.value)}
                  required
                  id="server-name-input"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.5rem 1rem', fontSize: '0.9rem' }} disabled={actionLoading || !newServerName} id="add-server-btn">
                Register & Generate Command
              </button>
            </form>

            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Registered Workers ({servers.length})</h3>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Server Name</th>
                    <th>Rules Applied</th>
                    <th>Last Check-In</th>
                    <th>Registered</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No workers registered yet. Add one above to generate the bootstrap command.
                      </td>
                    </tr>
                  ) : (
                    servers.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.name}</td>
                        <td>{s.entryCount}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : 'Never'}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {new Date(s.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
                            onClick={() => handleDeleteServer(s.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
  );
}
