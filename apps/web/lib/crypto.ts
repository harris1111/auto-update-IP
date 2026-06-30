import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export function canonicalJsonStringify(obj: any): string {
  if (obj === null) return 'null';
  if (obj === undefined) return '';
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJsonStringify(item)).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map(key => {
    return JSON.stringify(key) + ':' + canonicalJsonStringify(obj[key]);
  });
  return '{' + parts.join(',') + '}';
}

export function signPayload(payloadStr: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('base64');
}

export function verifySignature(payloadStr: string, signature: string, secret: string): boolean {
  try {
    const expected = signPayload(payloadStr, secret);
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch (e) {
    return false;
  }
}

export function generateOtp(length: number = 6): string {
  const digits = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += digits[crypto.randomInt(0, 10)];
  }
  return result;
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
