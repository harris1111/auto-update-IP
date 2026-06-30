import { describe, it, expect } from 'vitest';
import {
  canonicalJsonStringify,
  signPayload,
  verifySignature,
  generateOtp,
  hashOtp,
  verifyOtp,
  hashEmail,
  sha256,
} from '@/lib/crypto';

describe('Crypto Utilities', () => {
  describe('canonicalJsonStringify', () => {
    it('should order keys alphabetically', () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };
      expect(canonicalJsonStringify(obj1)).toEqual(canonicalJsonStringify(obj2));
      expect(canonicalJsonStringify(obj1)).toEqual('{"a":1,"b":2}');
    });

    it('should order keys recursively', () => {
      const obj = { b: { d: 4, c: 3 }, a: 1 };
      expect(canonicalJsonStringify(obj)).toEqual('{"a":1,"b":{"c":3,"d":4}}');
    });

    it('should handle arrays, nulls, and primitives', () => {
      expect(canonicalJsonStringify(null)).toEqual('null');
      expect(canonicalJsonStringify([1, { y: 2, x: 1 }])).toEqual('[1,{"x":1,"y":2}]');
    });
  });

  describe('HMAC Sign and Verify', () => {
    const secret = 'my-super-secret-key';
    const payload = '{"a":1,"b":2}';

    it('should sign payload and produce valid signature', () => {
      const signature = signPayload(payload, secret);
      expect(signature).toBeTypeOf('string');
      expect(verifySignature(payload, signature, secret)).toBe(true);
    });

    it('should reject tampered payload or invalid secret', () => {
      const signature = signPayload(payload, secret);
      expect(verifySignature(payload + ' ', signature, secret)).toBe(false);
      expect(verifySignature(payload, signature, secret + 'x')).toBe(false);
    });
  });

  describe('OTP functions', () => {
    it('should generate numeric OTPs of specified length', () => {
      const otp = generateOtp(6);
      expect(otp).toHaveLength(6);
      expect(/^\d+$/.test(otp)).toBe(true);
    });

    it('should hash and verify OTPs correctly', async () => {
      const otp = '123456';
      const hash = await hashOtp(otp);
      expect(hash).not.toEqual(otp);
      expect(await verifyOtp(otp, hash)).toBe(true);
      expect(await verifyOtp('111111', hash)).toBe(false);
    });
  });

  describe('hashEmail', () => {
    it('should normalize and hash emails', () => {
      const email1 = ' Admin@0err.com ';
      const email2 = 'admin@0err.com';
      expect(hashEmail(email1)).toEqual(hashEmail(email2));
      expect(hashEmail(email2)).toEqual(sha256('admin@0err.com'));
    });
  });
});
