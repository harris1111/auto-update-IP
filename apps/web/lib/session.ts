import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

let _secretKey: Uint8Array | null = null;

function getSecretKey(): Uint8Array {
  if (!_secretKey) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      throw new Error('Missing SESSION_SECRET environment variable');
    }
    _secretKey = new TextEncoder().encode(secret);
  }
  return _secretKey;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

export async function encrypt(payload: any, expires: string = '24h'): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(getSecretKey());
}

export async function decrypt(input: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(input, getSecretKey(), {
      algorithms: ['HS256'],
    });
    return payload;
  } catch (error) {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  const payload = await decrypt(sessionToken);
  if (!payload) return null;
  return payload as SessionPayload;
}

export async function setSession(payload: SessionPayload) {
  const token = await encrypt(payload);
  const cookieStore = await cookies();
  cookieStore.set('session_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete('session_token');
}
