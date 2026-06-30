import net from 'net';

export function isValidIpOrCidr(value: string): boolean {
  if (!value) return false;
  const parts = value.split('/');
  if (parts.length > 2) return false;
  
  const ip = parts[0];
  const ipVersion = net.isIP(ip);
  if (ipVersion === 0) return false;
  
  if (parts.length === 2) {
    const maskStr = parts[1];
    if (!/^\d+$/.test(maskStr)) return false;
    const mask = parseInt(maskStr, 10);
    if (ipVersion === 4) {
      return mask >= 0 && mask <= 32;
    } else {
      return mask >= 0 && mask <= 128;
    }
  }
  
  return true;
}

export function normalizeIpCidr(value: string): { ipCidr: string; version: number } {
  if (!isValidIpOrCidr(value)) {
    throw new Error('Invalid IP or CIDR');
  }
  const parts = value.split('/');
  const ip = parts[0];
  const version = net.isIP(ip);
  
  if (parts.length === 2) {
    return { ipCidr: value, version };
  } else {
    const suffix = version === 4 ? '/32' : '/128';
    return { ipCidr: `${ip}${suffix}`, version };
  }
}

export const ALLOWED_PORTS = [51032, 51033, 51034, 50004];

export function validatePorts(ports: number[]): boolean {
  if (!ports || ports.length === 0) return false;
  return ports.every(port => ALLOWED_PORTS.includes(port));
}

export function validateExpiry(
  mode: 'temporary' | 'persistent',
  expiresAt?: Date | string | null,
  ttlMinutes?: number,
  maxTtlHours: number = 24
): Date | null {
  if (mode === 'persistent') {
    if (expiresAt !== undefined && expiresAt !== null) {
      throw new Error('Persistent entries must not have an expiry time');
    }
    return null;
  }
  
  if (mode === 'temporary') {
    let expiry: Date;
    
    if (expiresAt) {
      expiry = new Date(expiresAt);
      if (isNaN(expiry.getTime())) {
        throw new Error('Invalid expiry date');
      }
    } else if (ttlMinutes !== undefined) {
      expiry = new Date(Date.now() + ttlMinutes * 60 * 1000);
    } else {
      throw new Error('Temporary entries require either expiresAt or ttlMinutes');
    }
    
    const now = Date.now();
    if (expiry.getTime() <= now) {
      throw new Error('Expiry time must be in the future');
    }
    
    const maxTtlMs = maxTtlHours * 60 * 60 * 1000;
    if (expiry.getTime() > now + maxTtlMs) {
      throw new Error(`Expiry time exceeds maximum allowed duration of ${maxTtlHours} hours`);
    }
    
    return expiry;
  }
  
  throw new Error('Invalid allowlist mode');
}
