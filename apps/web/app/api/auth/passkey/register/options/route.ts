import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getRegistrationOptions } from '@/lib/webauthn';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { credentials: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const options = await getRegistrationOptions(
      user.id,
      session.email,
      user.displayName || session.email.split('@')[0],
      user.credentials
    );

    await redis.set(`challenge:reg:${user.id}`, options.challenge, 'EX', 300);

    return NextResponse.json(options);
  } catch (error: any) {
    console.error('Registration options error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
