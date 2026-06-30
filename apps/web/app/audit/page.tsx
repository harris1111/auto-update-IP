'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AuditLog {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ip: string | null;
  userAgentHash: string | null;
  metadata: any;
  createdAt: string;
}

export default function AuditPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMeta, setExpandedMeta] = useState<AuditLog | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) {
          router.push('/login');
          return;
        }
        const meData = await meRes.json();
        setUser(meData.user);

        const logsRes = await fetch('/api/audit');
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setLogs(logsData);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const formatMetadata = (meta: any) => {
    if (!meta) return '-';
    if (typeof meta === 'string') return meta;
    try {
      return JSON.stringify(meta);
    } catch (e) {
      return '-';
    }
  };

  const formatMetadataPretty = (meta: any) => {
    if (!meta) return 'No metadata';
    try {
      return JSON.stringify(meta, null, 2);
    } catch (e) {
      return 'No metadata';
    }
  };

  const downloadCSV = () => {
    const header = ['Timestamp', 'Action', 'Resource', 'Actor', 'IP Address', 'Metadata'];
    const rows = logs.map(log => [
      new Date(log.createdAt).toISOString(),
      log.action,
      log.resourceType + (log.resourceId ? `:${log.resourceId.substring(0,8)}` : ''),
      log.actorUserId ? log.actorUserId.substring(0, 12) : 'System',
      log.ip || 'N/A',
      formatMetadata(log.metadata).replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Loading audit logs...</h2>
      </div>
    );
  }

  return (
    <>
      <main className="container animate-fade-in" style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>System Audit Logs</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
              Historical record of user actions, login attempts, step-up verifications, and firewall agent sync statuses.
            </p>
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={downloadCSV}>
            Export CSV
          </button>
        </div>

        <div className="table-container" style={{ marginTop: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Actor ID</th>
                <th>IP Address</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No audit logs available.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span
                        style={{
                          background: log.action.includes('failed') ? 'var(--danger-glow)' : 'var(--primary-glow)',
                          color: log.action.includes('failed') ? 'var(--danger)' : 'var(--primary)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          fontFamily: 'monospace'
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {log.resourceType}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {log.actorUserId ? log.actorUserId.substring(0, 8) + '...' : 'System (Agent)'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {log.ip || '-'}
                    </td>
                    <td>
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace' }}
                          onClick={() => setExpandedMeta(log)}
                          title="Click to view full metadata"
                        >
                          View
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {expandedMeta && (
        <div className="modal-overlay" onClick={() => setExpandedMeta(null)}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Audit Metadata</h3>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setExpandedMeta(null)}>Close</button>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              <strong>{expandedMeta.action}</strong> — {new Date(expandedMeta.createdAt).toLocaleString()}
            </div>
            <pre style={{
              background: 'var(--input-bg)',
              color: 'var(--text-main)',
              padding: '1rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              lineHeight: '1.6',
              overflowX: 'auto',
              border: '1px solid var(--border-color)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
            }}>
              {formatMetadataPretty(expandedMeta.metadata)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
