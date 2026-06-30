import { NextResponse } from 'next/server';
import { verifyAuthentication } from '@/lib/webauthn';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import { setSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { body, tempId } = await req.json();
    if (!body || !tempId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const cachedDataStr = await redis.get(`challenge:auth:${tempId}`);
    if (!cachedDataStr) {
      return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
    }

    // Delete temporary data from redis
    await redis.del(`challenge:auth:${tempId}`);

    const { challenge, userId, email } = JSON.parse(cachedDataStr);

    const credential = await prisma.passkeyCredential.findUnique({
      where: { credentialId: body.id },
    });

    if (!credential || credential.userId !== userId) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 400 });
    }

    const verification = await verifyAuthentication(body, challenge, {
      publicKey: credential.publicKey,
      counter: Number(credential.counter),
      credentialId: credential.credentialId,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      await logAudit({
    headers: req.headers,
        actorUserId: userId,
        action: 'login_failed',
        resourceType: 'user',
        resourceId: userId,
        metadata: { reason: 'passkey_verification_failed' },
      });
      return NextResponse.json({ error: 'Authentication failed' }, { status: 400 });
    }

    const { newCounter } = verification.authenticationInfo;

    // Update credential counter and last used time
    await prisma.passkeyCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(newCounter),
        lastUsedAt: new Date(),
      },
    });

    // Update user last login time
    const user = await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    const sessionId = crypto.randomUUID();
    await setSession({
      userId: user.id,
      email,
      role: user.role,
      sessionId,
    });

    await logAudit({
    headers: req.headers,
      actorUserId: user.id,
      action: 'login_success',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { method: 'passkey' },
    });

    await logAudit({
    headers: req.headers,
      actorUserId: user.id,
      action: 'passkey_used',
      resourceType: 'passkey_credential',
      resourceId: credential.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Auth verify error:', error);
    return NextResponse.json({ error: error.message || 'Verification error' }, { status: 500 });
  }
}
