import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { verifyAuthentication } from '@/lib/webauthn';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import { generateStepUpToken } from '@/lib/stepup';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, payloadHash, body } = await req.json();
    if (!action || !payloadHash || !body) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const challenge = await redis.get(`challenge:stepup-passkey:${session.userId}`);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
    }

    await redis.del(`challenge:stepup-passkey:${session.userId}`);

    const credential = await prisma.passkeyCredential.findUnique({
      where: { credentialId: body.id },
    });

    if (!credential || credential.userId !== session.userId) {
      return NextResponse.json({ error: 'Credential not found or invalid' }, { status: 400 });
    }

    const verification = await verifyAuthentication(body, challenge, {
      publicKey: credential.publicKey,
      counter: Number(credential.counter),
      credentialId: credential.credentialId,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const { newCounter } = verification.authenticationInfo;

    // Update credential counter
    await prisma.passkeyCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(newCounter),
        lastUsedAt: new Date(),
      },
    });

    // Generate step-up token
    const token = await generateStepUpToken(session.userId, session.sessionId, action, payloadHash);

    await logAudit({
      actorUserId: session.userId,
      action: 'passkey_used',
      resourceType: 'passkey_credential',
      resourceId: credential.id,
      metadata: { action, payloadHash },
    });

    return NextResponse.json({ ok: true, stepUpToken: token });
  } catch (error: any) {
    console.error('Step-up passkey verify error:', error);
    return NextResponse.json({ error: error.message || 'Verification error' }, { status: 500 });
  }
}
