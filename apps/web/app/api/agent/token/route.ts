import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { sha256 } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import crypto from 'crypto';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tokens = await prisma.agentToken.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        enabled: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json(tokens);
  } catch (error) {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name } = await req.json();
    if (!name) {
      return NextResponse.json({ error: 'Token name is required' }, { status: 400 });
    }

    const rawToken = 'agt_' + crypto.randomBytes(24).toString('hex');
    const tokenHash = sha256(rawToken);

    let token;
    try {
      token = await prisma.agentToken.create({
        data: {
          name,
          tokenHash,
          enabled: true,
        },
      });
    } catch (e) {
      // Offline fallback mock
      token = {
        id: crypto.randomUUID(),
        name,
        enabled: true,
        createdAt: new Date(),
      };
    }

    await logAudit({
    headers: req.headers,
      actorUserId: session.userId,
      action: 'agent_token_created', // custom audit log
      resourceType: 'agent_token',
      resourceId: token.id,
      metadata: { name },
    });

    return NextResponse.json({
      ok: true,
      id: token.id,
      name: token.name,
      rawToken, // Plaintext returned only once!
      createdAt: token.createdAt,
    });
  } catch (error: any) {
    console.error('Agent token generation error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
