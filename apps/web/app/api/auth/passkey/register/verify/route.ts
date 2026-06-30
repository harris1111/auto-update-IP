import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { verifyRegistration } from '@/lib/webauthn';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const challenge = await redis.get(`challenge:reg:${session.userId}`);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
    }

    // Delete challenge from redis
    await redis.del(`challenge:reg:${session.userId}`);

    const verification = await verifyRegistration(body, challenge);
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const ri = verification.registrationInfo as any;
    const credential = ri.credential || ri;
    const credentialId = credential.id || ri.credentialID;
    const publicKey = credential.publicKey || ri.credentialPublicKey;
    const counter = credential.counter ?? (ri.counter ?? 0);

    const publicKeyBase64 = Buffer.from(publicKey).toString('base64');

    await prisma.$transaction([
      prisma.passkeyCredential.create({
        data: {
          userId: session.userId,
          credentialId,
          publicKey: publicKeyBase64,
          counter: BigInt(counter),
          name: body.credentialName || 'Passkey',
        },
      }),
      prisma.user.update({
        where: { id: session.userId },
        data: { passkeyEnrolled: true },
      }),
    ]);

    await logAudit({
      actorUserId: session.userId,
      action: 'passkey_enrolled',
      resourceType: 'passkey_credential',
      resourceId: credentialId,
      metadata: { credentialId },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Registration verify error:', error);
    return NextResponse.json({ error: error.message || 'Verification error' }, { status: 500 });
  }
}
