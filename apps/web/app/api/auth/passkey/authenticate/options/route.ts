import { NextResponse } from 'next/server';
import { getAuthenticationOptions } from '@/lib/webauthn';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import { hashEmail } from '@/lib/crypto';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const emailHashed = hashEmail(email);
    const user = await prisma.user.findFirst({
      where: { emailHash: emailHashed },
      include: { credentials: true },
    });

    if (!user || user.credentials.length === 0) {
      return NextResponse.json({ error: 'No credentials enrolled for this email' }, { status: 404 });
    }

    const options = await getAuthenticationOptions(user.credentials);

    const tempId = crypto.randomUUID();
    await redis.set(`challenge:auth:${tempId}`, JSON.stringify({
      challenge: options.challenge,
      userId: user.id,
      email: email.trim().toLowerCase(),
    }), 'EX', 300);

    return NextResponse.json({ ...options, tempId });
  } catch (error: any) {
    console.error('Auth options error:', error);
    return NextResponse.json({ error: error.message || 'Error generating options' }, { status: 500 });
  }
}
