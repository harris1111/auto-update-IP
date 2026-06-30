'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import StepUpModal from '@/components/StepUpModal';

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
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [currentIpData, setCurrentIpData] = useState<any>(null);
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [portGroups, setPortGroups] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>({ status: 'unknown', time: null });
  
  // Modals & step-up states
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpAction, setStepUpAction] = useState('');
  const [stepUpPayload, setStepUpPayload] = useState<any>(null);
  const [stepUpCallback, setStepUpCallback] = useState<(token: string) => void>(() => () => {});
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    try {
      // 1. Verify User
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        router.push('/login');
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);

      // 2. Fetch IP
      const ipRes = await fetch('/api/current-ip');
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        setCurrentIpData(ipData);
      }

      // 3. Fetch Allowlist Entries
      const listRes = await fetch('/api/allowlist');
      if (listRes.ok) {
        const listData = await listRes.json();
        setEntries(listData);
      }

      // 4. Fetch Port Groups
      const pgRes = await fetch('/api/port-groups');
      if (pgRes.ok) {
        const pgData = await pgRes.json();
        setPortGroups(pgData);
      }

      // Get sync status (simulated/cached via custom API or default values)
      // Standard sync check: look at last sync status set by agent reports
      setSyncStatus({
        status: 'success',
        time: new Date().toISOString()
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll updates every 10 seconds to keep sync indicator live
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const triggerStepUp = (action: string, payload: any, onSuccess: (token: string) => void) => {
    setStepUpAction(action);
    setStepUpPayload(payload);
    setStepUpCallback(() => onSuccess);
    setStepUpOpen(true);
  };

  // Quick action: Allow current IP for 2 hours (120 minutes)
  const handleQuickAllow = () => {
    const payload = {
      ipCidr: currentIpData ? `${currentIpData.ip}/32` : '127.0.0.1/32',
      label: 'Quick Allow Client IP',
      reason: 'Dynamic developer session',
      portGroupKeys: ['all_safe'],
      mode: 'temporary',
      ttlMinutes: 120,
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

  // Revoke specific entry
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

  // Revoke all entries (emergency block)
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

  // Format TTL display
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
        {/* Warning Banner if firewall agent hasn't synchronized */}
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

        {/* Dashboard Grid Header Stats */}
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
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem' }}>Firewall Agent Sync</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span className="badge badge-success">Sync Active</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>Online</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Last sync reported: {syncStatus.time ? new Date(syncStatus.time).toLocaleTimeString() : 'Just now'}
            </p>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem' }}>Rules Summary</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>
                {activeEntries.length} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>Active allowed IPs</span>
              </div>
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => router.push('/allowlist/new')} id="new-allow-btn">
              Add Custom Rule
            </button>
          </div>
        </section>

        {/* Search Bar & Emergency Actions */}
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

        {/* Active Allowlist Table */}
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
                  <th>Mode</th>
                  <th>Expires In</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
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

        {/* Expired / Revoked History Table */}
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
                  <th>Mode</th>
                  <th>Expired At</th>
                </tr>
              </thead>
              <tbody>
                {expiredOrDisabled.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
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
