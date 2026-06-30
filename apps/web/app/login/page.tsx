'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState<'main' | 'otp' | 'enroll'>('main');
  const [otp, setOtp] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.authenticated) router.push('/dashboard');
    }).catch(() => {});
  }, [router]);

  const handlePasskeyLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await loginRes.json();

      if (data.needsSetup) {
        requestOtp();
        return;
      }

      if (data.needsPasskeyAuth && !data.hasPasskeys) {
        setError('No passkey enrolled. Request an OTP login code below.');
        return;
      }

      const optRes = await fetch('/api/auth/passkey/authenticate/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const options = await optRes.json();
      if (options.error) throw new Error(options.error);

      let authResponse;
      try {
        authResponse = await startAuthentication({ optionsJSON: options });
      } catch (e: any) {
        throw new Error('Passkey authentication cancelled.');
      }

      const verRes = await fetch('/api/auth/passkey/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: authResponse, tempId: options.tempId }),
      });
      const verData = await verRes.json();
      if (verData.error) throw new Error(verData.error);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'request_otp', email }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuccess('Verification code sent to your email.');
      setMode('otp');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'verify_otp', email, otp: otp.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.user?.passkeyEnrolled) {
        router.push('/dashboard');
      } else {
        setMode('enroll');
        setSuccess('Logged in. Enroll a passkey to enable passwordless sign-in.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const enrollPasskey = async () => {
    setLoading(true);
    setError('');
    try {
      const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
      const options = await optRes.json();
      if (options.error) throw new Error(options.error);

      let regResponse;
      try {
        regResponse = await startRegistration({ optionsJSON: options });
      } catch (e: any) {
        throw new Error('Passkey registration cancelled.');
      }

      const verRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regResponse),
      });
      const verData = await verRes.json();
      if (verData.error) throw new Error(verData.error);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>0ERR</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          Firewall Allowlist Gateway
        </p>

        {error && (
          <div style={{ color: 'var(--danger)', background: 'var(--danger-glow)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'left' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ color: 'var(--success)', background: 'var(--success-glow)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {success}
          </div>
        )}

        {mode === 'main' && (
          <div className="flex flex-col gap-3">
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label className="form-label">Admin Email</label>
              <input
                type="email" className="form-input" value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="Admin email" required id="login-email-input"
              />
            </div>

            <button className="btn btn-primary" onClick={handlePasskeyLogin} disabled={loading || !email}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/><path d="M12 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>
              Sign in with Passkey
            </button>

            <div style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0' }}>
              <hr style={{ flex: 1, borderColor: 'var(--border-color)' }} />
              <span style={{ padding: '0 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>OR</span>
              <hr style={{ flex: 1, borderColor: 'var(--border-color)' }} />
            </div>

            <button className="btn btn-secondary" onClick={requestOtp} disabled={loading || !email}>
              Send OTP Login Code
            </button>
          </div>
        )}

        {mode === 'otp' && (
          <div className="flex flex-col gap-3">
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Enter the 6-digit code sent to your email.</p>
            <input type="text" className="form-input" placeholder="000000" value={otp}
              onChange={e => setOtp(e.target.value)} maxLength={8}
              style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.2em' }} id="otp-input" />
            <div className="flex gap-2">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={verifyOtp} disabled={loading || otp.length < 4}>Verify</button>
              <button className="btn btn-secondary" onClick={() => { setMode('main'); setOtp(''); setError(''); }}>Back</button>
            </div>
          </div>
        )}

        {mode === 'enroll' && (
          <div className="flex flex-col gap-3">
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Enroll a passkey for passwordless sign-in next time.</p>
            <button className="btn btn-primary" onClick={enrollPasskey} disabled={loading}>Enroll Passkey</button>
            <button className="btn btn-secondary" onClick={() => router.push('/dashboard')}>Skip for now</button>
          </div>
        )}
      </div>
    </div>
  );
}
