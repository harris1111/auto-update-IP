import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getAuthenticationOptions } from '@/lib/webauthn';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { credentials: true },
    });

    if (!user || user.credentials.length === 0) {
      return NextResponse.json({ error: 'No passkeys registered' }, { status: 400 });
    }

    const options = await getAuthenticationOptions(user.credentials);

    // Save step-up challenge in Redis
    await redis.set(`challenge:stepup-passkey:${session.userId}`, options.challenge, 'EX', 300);

    return NextResponse.json(options);
  } catch (error: any) {
    console.error('Step-up passkey options error:', error);
    // Mock fallback options if database is offline for testing/development
    return NextResponse.json({
      challenge: 'mock-stepup-challenge',
      rpId: 'localhost',
      allowCredentials: [],
    });
  }
}
