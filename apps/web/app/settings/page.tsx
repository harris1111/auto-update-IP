'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import Header from '@/components/Header';

interface Passkey {
  id: string;
  credentialId?: string;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface AgentToken {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [loading, setLoading] = useState(true);

  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [newTokenName, setNewTokenName] = useState('');
  const [generatedToken, setGeneratedToken] = useState('');
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
        if (pkRes && pkRes.ok) {
          const pkData = await pkRes.json();
          setPasskeys(pkData);
        }
      }

      const tokenRes = await fetch('/api/agent/token');
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setTokens(tokenData);
      }
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

  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setGeneratedToken('');
    setActionLoading(true);

    try {
      const res = await fetch('/api/agent/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTokenName.trim() }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setGeneratedToken(data.rawToken);
      setNewTokenName('');
      setSuccess('Agent machine token created.');
      await fetchSettingsData();
    } catch (err: any) {
      setError(err.message || 'Failed to generate token');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Loading settings...</h2>
      </div>
    );
  }

  return (
    <>
      <Header />

      <main className="container animate-fade-in" style={{ flex: 1 }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>System Settings</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          Configure passkey authentication credentials and manage daemon credentials for the firewall agent.
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

        <div className="grid grid-2 gap-3">
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Registered Passkeys</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {passkeys.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No passkeys registered.</p>
              ) : (
                passkeys.map(pk => (
                  <div key={pk.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pk.name || 'Unnamed Passkey'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Registered: {new Date(pk.createdAt).toLocaleDateString()}</div>
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Verified</span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleRegisterPasskey} style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
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

          <div className="card" style={{ height: 'fit-content' }}>
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Firewall Agent Tokens</h3>

            {generatedToken && (
              <div style={{ background: 'var(--warning-glow)', border: '1px solid rgba(245,158,11,0.3)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', wordBreak: 'break-all' }}>
                <strong style={{ color: 'var(--warning)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                  IMPORTANT: Copy this token now. It will not be shown again.
                </strong>
                <code style={{ fontSize: '1rem', color: '#fff', fontWeight: 'bold', fontFamily: 'monospace' }} id="raw-token-display">
                  {generatedToken}
                </code>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {tokens.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No daemon tokens generated yet.</p>
              ) : (
                tokens.map(token => (
                  <div key={token.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{token.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Created: {new Date(token.createdAt).toLocaleDateString()}</div>
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Active</span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleGenerateToken} style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Generate Machine Token</h4>
              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Agent Name (e.g. Dedi Server 1)"
                  value={newTokenName}
                  onChange={e => setNewTokenName(e.target.value)}
                  required
                  id="token-name-input"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.5rem 1rem', fontSize: '0.9rem' }} disabled={actionLoading || !newTokenName} id="generate-token-btn">
                Generate Token
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
