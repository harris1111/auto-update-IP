'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import StepUpModal from '@/components/StepUpModal';

interface Server {
  id: string;
  name: string;
  lastSeenAt: string | null;
  createdAt: string;
}

interface AllowlistEntry {
  id: string;
  ipCidr: string;
  ipVersion: number;
  label: string;
  reason: string | null;
  ports: number[];
  isPersistent: boolean;
  expiresAt: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  lastAppliedAt: string | null;
  servers: Server[];
}

interface SyncStatus {
  id: string;
  name: string;
  status: string;
  lastSync: string | null;
  lastError: string | null;
  lastSeenAt: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [currentIpData, setCurrentIpData] = useState<any>(null);
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [portGroups, setPortGroups] = useState<any[]>([]);
  const [allServers, setAllServers] = useState<Server[]>([]);
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpAction, setStepUpAction] = useState('');
  const [stepUpPayload, setStepUpPayload] = useState<any>(null);
  const [stepUpCallback, setStepUpCallback] = useState<(token: string) => void>(() => () => {});

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    try {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        router.push('/login');
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      const ipRes = await fetch('/api/current-ip');
      if (ipRes.ok) setCurrentIpData(await ipRes.json());

      const listRes = await fetch('/api/allowlist');
      if (listRes.ok) setEntries(await listRes.json());

      const pgRes = await fetch('/api/port-groups');
      if (pgRes.ok) setPortGroups(await pgRes.json());

      const svRes = await fetch('/api/servers');
      if (svRes.ok) setAllServers(await svRes.json());

      const syncRes = await fetch('/api/agent/sync-status');
      if (syncRes.ok) setSyncStatuses(await syncRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const triggerStepUp = (action: string, payload: any, onSuccess: (token: string) => void) => {
    setStepUpAction(action);
    setStepUpPayload(payload);
    setStepUpCallback(() => onSuccess);
    setStepUpOpen(true);
  };

  const handleQuickAllow = () => {
    const payload = {
      ipCidr: currentIpData ? `${currentIpData.ip}/32` : '127.0.0.1/32',
      label: 'Quick Allow Client IP',
      reason: 'Dynamic developer session',
      portGroupKeys: ['all'],
      mode: 'temporary',
      ttlMinutes: 120,
      serverIds: allServers.map(s => s.id),
    };

    triggerStepUp('allowlist.create', payload, async (stepUpToken) => {
      setLoading(true);
      try {
        const res = await fetch('/api/allowlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, stepUpToken }),
        });
        const result = await res.json();
        if (result.error) alert(result.error);
        else await fetchData();
      } catch (err) {
        alert('Failed to add entry');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleRevoke = (id: string) => {
    const payload = {};
    triggerStepUp(`allowlist.revoke:${id}`, payload, async (stepUpToken) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/allowlist/${id}/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepUpToken }),
        });
        const result = await res.json();
        if (result.error) alert(result.error);
        else await fetchData();
      } catch (err) {
        alert('Failed to revoke entry');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleRevokeAll = () => {
    const payload = {};
    triggerStepUp('allowlist.revoke-all', payload, async (stepUpToken) => {
      setLoading(true);
      try {
        const res = await fetch('/api/allowlist/revoke-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepUpToken }),
        });
        const result = await res.json();
        if (result.error) alert(result.error);
        else await fetchData();
      } catch (err) {
        alert('Failed to revoke all');
      } finally {
        setLoading(false);
      }
    });
  };

  const filteredEntries = entries.filter(e =>
    e.ipCidr.includes(searchTerm) ||
    e.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.reason && e.reason.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const activeEntries = filteredEntries.filter(e => e.enabled && (!e.expiresAt || new Date(e.expiresAt) > new Date()));
  const expiredOrDisabled = filteredEntries.filter(e => !e.enabled || (e.expiresAt && new Date(e.expiresAt) <= new Date()));

  if (loading && !user) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Loading dashboard...</h2>
      </div>
    );
  }

  const getRemainingTime = (expiryStr: string | null) => {
    if (!expiryStr) return 'Persistent';
    const diff = new Date(expiryStr).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  };

  return (
    <>
      <Header />

      <main className="container animate-fade-in" style={{ flex: 1 }}>
        {entries.some(e => e.enabled && !e.lastAppliedAt) && (
          <div className="alert-banner" id="sync-warning">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor"/>
            </svg>
            <div>
              <span style={{ fontWeight: 700 }}>Warning:</span> Firewall Agent has pending updates. New allowlist rules may take up to 15 seconds to apply to Nginx gateway ports.
            </div>
          </div>
        )}

        <section className="grid grid-3 gap-3" style={{ marginBottom: '2rem' }}>
          <div className="card">
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem' }}>Current Detected IP</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'monospace', marginBottom: '0.5rem' }} id="detected-ip-val">
              {currentIpData ? currentIpData.ip : '127.0.0.1'}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={handleQuickAllow} id="quick-allow-btn">
              Allow Current IP
            </button>
          </div>

          <div className="card">
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem' }}>Agent Sync Status</div>
            {syncStatuses.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No agents connected</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {syncStatuses.map(ss => (
                  <div key={ss.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span className={`badge ${ss.status === 'success' ? 'badge-success' : ss.status === 'error' ? 'badge-danger' : 'badge-warning'}`}>
                      {ss.status === 'success' ? 'Online' : ss.status === 'error' ? 'Error' : 'Waiting'}
                    </span>
                    <span style={{ fontWeight: 600 }}>{ss.name}</span>
                    {ss.lastSync && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        @ {new Date(ss.lastSync).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem' }}>Rules Summary</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>
                {activeEntries.length} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>Active allowed IPs</span>
              </div>
              {allServers.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {allServers.length} server{allServers.length !== 1 ? 's' : ''} registered
                </div>
              )}
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => router.push('/allowlist/new')} id="new-allow-btn">
              Add Custom Rule
            </button>
          </div>
        </section>

        <section style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by IP, label, or reason..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ maxWidth: '360px' }}
            id="search-input"
          />

          <button className="btn btn-danger" onClick={handleRevokeAll} id="revoke-all-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor"/>
            </svg>
            Emergency Close (Revoke All)
          </button>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Active Allowed Rules ({activeEntries.length})</h2>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>IP/CIDR</th>
                  <th>Label</th>
                  <th>Ports</th>
                  <th>Servers</th>
                  <th>Mode</th>
                  <th>Expires In</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No active IP rules matching filters.
                    </td>
                  </tr>
                ) : (
                  activeEntries.map(e => (
                    <tr key={e.id}>
                      <td>
                        <span className="badge badge-success">Active</span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{e.ipCidr}</td>
                      <td>{e.label}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{e.ports.join(', ')}</td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {e.servers && e.servers.length > 0
                          ? e.servers.map(s => s.name).join(', ')
                          : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>All servers</span>}
                      </td>
                      <td>
                        <span className={`badge ${e.isPersistent ? 'badge-warning' : 'badge-success'}`}>
                          {e.isPersistent ? 'Persistent' : 'Temporary'}
                        </span>
                      </td>
                      <td style={{ color: e.isPersistent ? 'var(--warning)' : 'inherit' }}>
                        {getRemainingTime(e.expiresAt)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleRevoke(e.id)}>
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Expired or Revoked Rules ({expiredOrDisabled.length})</h2>

          <div className="table-container" style={{ opacity: 0.75 }}>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>IP/CIDR</th>
                  <th>Label</th>
                  <th>Ports</th>
                  <th>Servers</th>
                  <th>Mode</th>
                  <th>Expired At</th>
                </tr>
              </thead>
              <tbody>
                {expiredOrDisabled.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No history entries.
                    </td>
                  </tr>
                ) : (
                  expiredOrDisabled.map(e => (
                    <tr key={e.id}>
                      <td>
                        <span className="badge badge-danger">Inactive</span>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{e.ipCidr}</td>
                      <td>{e.label}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{e.ports.join(', ')}</td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {e.servers && e.servers.length > 0
                          ? e.servers.map(s => s.name).join(', ')
                          : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>All servers</span>}
                      </td>
                      <td>{e.isPersistent ? 'Persistent' : 'Temporary'}</td>
                      <td>
                        {e.expiresAt ? new Date(e.expiresAt).toLocaleString() : 'Revoked'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <StepUpModal
        isOpen={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        action={stepUpAction}
        payload={stepUpPayload}
        onSuccess={stepUpCallback}
      />
    </>
  );
}
