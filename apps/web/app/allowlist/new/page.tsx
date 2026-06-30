'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StepUpModal from '@/components/StepUpModal';

interface Server {
  id: string;
  name: string;
  lastSeenAt: string | null;
}

export default function NewAllowlistPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [ipCidr, setIpCidr] = useState('');
  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'temporary' | 'persistent'>('temporary');
  const [ttlOption, setTtlOption] = useState('120');
  const [customTtl, setCustomTtl] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>(['all']);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);

  const [currentIp, setCurrentIp] = useState('');
  const [portGroups, setPortGroups] = useState<any[]>([]);
  const [allServers, setAllServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpPayload, setStepUpPayload] = useState<any>(null);

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

        const ipRes = await fetch('/api/current-ip');
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          setCurrentIp(ipData.ip);
          setIpCidr(`${ipData.ip}/32`);
        }

        const pgRes = await fetch('/api/port-groups');
        if (pgRes.ok) setPortGroups(await pgRes.json());

        const svRes = await fetch('/api/servers');
        if (svRes.ok) {
          const servers = await svRes.json();
          setAllServers(servers);
          if (servers.length > 0) {
            setSelectedServers(servers.map((s: Server) => s.id));
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleGroupToggle = (key: string) => {
    setSelectedGroups(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleServerToggle = (serverId: string) => {
    setSelectedServers(prev =>
      prev.includes(serverId)
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId]
    );
  };

  const handleUseCurrentIp = () => {
    if (currentIp) setIpCidr(`${currentIp}/32`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!ipCidr.trim()) {
      setError('IP or CIDR is required');
      return;
    }
    if (!label.trim()) {
      setError('Label is required');
      return;
    }
    if (selectedGroups.length === 0) {
      setError('Please select at least one port group');
      return;
    }

    let ttlVal = 120;
    if (mode === 'temporary') {
      if (ttlOption === 'custom') {
        const parsed = parseInt(customTtl, 10);
        if (isNaN(parsed) || parsed <= 0) {
          setError('Please specify a valid custom TTL in minutes');
          return;
        }
        ttlVal = parsed;
      } else {
        ttlVal = parseInt(ttlOption, 10);
      }
    }

    const payload: any = {
      ipCidr: ipCidr.trim(),
      label: label.trim(),
      reason: reason.trim() || undefined,
      portGroupKeys: selectedGroups,
      mode,
      ttlMinutes: mode === 'temporary' ? ttlVal : undefined,
    };

    if (allServers.length > 0 && selectedServers.length < allServers.length) {
      payload.serverIds = selectedServers;
    }

    setStepUpPayload(payload);
    setStepUpOpen(true);
  };

  const handleStepUpSuccess = async (stepUpToken: string) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...stepUpPayload, stepUpToken }),
      });

      const result = await res.json();
      if (result.error) {
        setError(result.error);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Failed to submit form to server');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Loading form...</h2>
      </div>
    );
  }

  return (
    <>
      <main className="container animate-fade-in" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div className="card" style={{ width: '100%', maxWidth: '600px' }}>
          <h2>Add New Firewall Rule</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Configure access to development gateway TCP ports. Rules require step-up authorization.
          </p>

          {error && (
            <div style={{ color: 'var(--danger)', background: 'var(--danger-glow)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }} id="new-allow-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>IP Address or CIDR block</label>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={handleUseCurrentIp}>
                  Use Detected IP ({currentIp || '127.0.0.1'})
                </button>
              </div>
              <input
                type="text"
                className="form-input"
                value={ipCidr}
                onChange={e => setIpCidr(e.target.value)}
                placeholder="e.g. 192.168.1.1 or 192.168.1.0/24"
                required
                id="ip-cidr-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Rule Label (e.g. Laptop name or location)</label>
              <input
                type="text"
                className="form-input"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Home office iMac"
                required
                id="label-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Justification / Reason (Optional)</label>
              <textarea
                className="form-input"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. debugging databases for sprint 4"
                rows={2}
                style={{ resize: 'vertical' }}
                id="reason-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Allowed Port Groups</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {portGroups.map(pg => (
                  <label key={pg.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.925rem' }}>
                    <input
                      type="checkbox"
                      checked={selectedGroups.includes(pg.key)}
                      onChange={() => handleGroupToggle(pg.key)}
                      style={{ cursor: 'pointer' }}
                    />
                    <div>
                      <strong>{pg.name}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>({pg.description})</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {allServers.length > 0 && (
              <div className="form-group">
                <label className="form-label">
                  Target Servers
                  {selectedServers.length === allServers.length && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>(All selected = rule applies everywhere)</span>
                  )}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {allServers.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.925rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedServers.includes(s.id)}
                        onChange={() => handleServerToggle(s.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <div>
                        <strong>{s.name}</strong>
                        {s.lastSeenAt && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                            (last seen {new Date(s.lastSeenAt).toLocaleString()})
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Deselect specific servers to limit this rule. Selecting none means the rule applies to all registered servers.
                </p>
              </div>
            )}

            <div className="form-group" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label className="form-label">Duration Mode</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={`btn ${mode === 'temporary' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setMode('temporary')}
                  >
                    Temporary
                  </button>
                  <button
                    type="button"
                    className={`btn ${mode === 'persistent' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setMode('persistent')}
                  >
                    Persistent
                  </button>
                </div>
              </div>

              {mode === 'temporary' && (
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label className="form-label">Time to Live (TTL)</label>
                  <select
                    className="form-select"
                    value={ttlOption}
                    onChange={e => setTtlOption(e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="30">30 Minutes</option>
                    <option value="120">2 Hours</option>
                    <option value="480">8 Hours</option>
                    <option value="1440">24 Hours</option>
                    <option value="custom">Custom Minutes...</option>
                  </select>
                </div>
              )}
            </div>

            {mode === 'temporary' && ttlOption === 'custom' && (
              <div className="form-group animate-fade-in">
                <label className="form-label">Custom TTL (Minutes, Max 1440)</label>
                <input
                  type="number"
                  className="form-input"
                  value={customTtl}
                  onChange={e => setCustomTtl(e.target.value)}
                  placeholder="Enter minutes"
                  min={1}
                  max={1440}
                  id="custom-ttl-input"
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting} id="submit-rule-btn">
                Authorize & Save Rule
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => router.push('/dashboard')} disabled={submitting}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>

      <StepUpModal
        isOpen={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        action="allowlist.create"
        payload={stepUpPayload}
        onSuccess={handleStepUpSuccess}
      />
    </>
  );
}
