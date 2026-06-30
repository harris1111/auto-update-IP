import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const credentials = await prisma.passkeyCredential.findMany({
      where: { userId: session.userId },
      select: {
        id: true,
        credentialId: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(credentials);
  } catch (e) {
    return NextResponse.json([], { status: 200 });
  }
}
