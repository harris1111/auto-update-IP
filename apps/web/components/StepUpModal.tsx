'use client';

import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';

interface StepUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: string;
  payload: any;
  onSuccess: (token: string) => void;
}

export default function StepUpModal({ isOpen, onClose, action, payload, onSuccess }: StepUpModalProps) {
  const [method, setMethod] = useState<'select' | 'passkey' | 'otp'>('select');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const getPayloadHash = async () => {
    const sortObject = (obj: any): any => {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sortObject);
      const sorted: any = {};
      Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObject(obj[key]);
      });
      return sorted;
    };
    const canonical = JSON.stringify(sortObject(payload));
    const msgBuffer = new TextEncoder().encode(canonical);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handlePasskey = async () => {
    setLoading(true);
    setError('');
    try {
      const hash = await getPayloadHash();

      const optRes = await fetch('/api/step-up/passkey/options', { method: 'POST' });
      const options = await optRes.json();
      if (options.error) throw new Error(options.error);

      let authResponse;
      try {
        authResponse = await startAuthentication({ optionsJSON: options });
      } catch (webauthnErr: any) {
        throw new Error('Passkey verification cancelled');
      }

      const verRes = await fetch('/api/step-up/passkey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          payloadHash: hash,
          body: authResponse,
        }),
      });

      const result = await verRes.json();
      if (result.error) throw new Error(result.error);

      onSuccess(result.stepUpToken);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Passkey verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const hash = await getPayloadHash();
      const res = await fetch('/api/step-up/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payloadHash: hash }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setOtpSent(true);
      setMethod('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to request OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const hash = await getPayloadHash();
      const res = await fetch('/api/step-up/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          payloadHash: hash,
          otp: otpCode.trim(),
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onSuccess(data.stepUpToken);
      onClose();
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-fade-in">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Step-Up Authentication</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Verification is required to perform the action: <code style={{ color: 'var(--primary)' }}>{action}</code>
        </p>

        {error && (
          <div style={{ color: 'var(--danger)', background: 'var(--danger-glow)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {method === 'select' && (
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary" onClick={handlePasskey} disabled={loading}>
              Verify with Passkey
            </button>
            <button className="btn btn-secondary" onClick={handleRequestOtp} disabled={loading}>
              Request Fallback OTP Email
            </button>
          </div>
        )}

        {method === 'otp' && (
          <div className="flex flex-col gap-2">
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              OTP sent to the configured admin mailbox. Please enter the verification code.
            </p>
            <div className="form-group">
              <input
                type="text"
                placeholder="Enter 6-digit OTP"
                className="form-input"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                maxLength={8}
                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.2em' }}
                id="otp-input"
              />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleVerifyOtp} disabled={loading || !otpCode}>
                Verify OTP
              </button>
              <button className="btn btn-secondary" onClick={() => setMethod('select')} disabled={loading}>
                Back
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
          <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={onClose} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
