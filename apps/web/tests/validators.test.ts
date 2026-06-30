import { describe, it, expect } from 'vitest';
import {
  isValidIpOrCidr,
  normalizeIpCidr,
  validatePorts,
  validateExpiry,
} from '@/lib/validators';

describe('Validators', () => {
  describe('isValidIpOrCidr', () => {
    it('should validate correct IPv4 addresses and CIDRs', () => {
      expect(isValidIpOrCidr('1.2.3.4')).toBe(true);
      expect(isValidIpOrCidr('192.168.1.1/24')).toBe(true);
      expect(isValidIpOrCidr('0.0.0.0/0')).toBe(true);
    });

    it('should validate correct IPv6 addresses and CIDRs', () => {
      expect(isValidIpOrCidr('2001:db8::')).toBe(true);
      expect(isValidIpOrCidr('2001:db8::/32')).toBe(true);
    });

    it('should reject invalid IPs or CIDRs', () => {
      expect(isValidIpOrCidr('256.0.0.1')).toBe(false);
      expect(isValidIpOrCidr('1.2.3.4/33')).toBe(false);
      expect(isValidIpOrCidr('2001:db8::/129')).toBe(false);
      expect(isValidIpOrCidr('abc')).toBe(false);
      expect(isValidIpOrCidr('')).toBe(false);
    });
  });

  describe('normalizeIpCidr', () => {
    it('should normalize single IPv4 to /32', () => {
      expect(normalizeIpCidr('1.2.3.4')).toEqual({ ipCidr: '1.2.3.4/32', version: 4 });
    });

    it('should normalize single IPv6 to /128', () => {
      expect(normalizeIpCidr('2001:db8::')).toEqual({ ipCidr: '2001:db8::/128', version: 6 });
    });

    it('should preserve existing CIDR suffix', () => {
      expect(normalizeIpCidr('192.168.1.1/24')).toEqual({ ipCidr: '192.168.1.1/24', version: 4 });
      expect(normalizeIpCidr('2001:db8::/64')).toEqual({ ipCidr: '2001:db8::/64', version: 6 });
    });
  });

  describe('validatePorts', () => {
    it('should accept allowed ports', () => {
      expect(validatePorts([15432])).toBe(true);
      expect(validatePorts([27017, 19000])).toBe(true);
    });

    it('should reject disallowed ports', () => {
      expect(validatePorts([80])).toBe(false);
      expect(validatePorts([15432, 22])).toBe(false);
    });

    it('should explicitly reject Redis port 6379', () => {
      expect(validatePorts([6379])).toBe(false);
      expect(validatePorts([15432, 6379])).toBe(false);
    });
  });

  describe('validateExpiry', () => {
    it('should validate persistent mode', () => {
      expect(validateExpiry('persistent')).toBeNull();
      expect(() => validateExpiry('persistent', '2026-06-29T12:00:00Z')).toThrow();
    });

    it('should validate temporary mode with expiresAt in the future', () => {
      const future = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h in future
      const result = validateExpiry('temporary', future);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toEqual(future.getTime());
    });

    it('should validate temporary mode with ttlMinutes', () => {
      const result = validateExpiry('temporary', null, 120); // 2h
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should reject temporary mode with expiresAt in the past', () => {
      const past = new Date(Date.now() - 60 * 1000); // 1m in past
      expect(() => validateExpiry('temporary', past)).toThrow();
    });

    it('should reject temporary mode exceeding max TTL duration', () => {
      const future = new Date(Date.now() + 25 * 60 * 60 * 1000); // 25h in future
      expect(() => validateExpiry('temporary', future)).toThrow();
    });
  });
});
