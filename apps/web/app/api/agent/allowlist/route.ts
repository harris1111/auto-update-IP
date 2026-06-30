import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sha256, canonicalJsonStringify, signPayload } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';

async function authenticateAgent(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const tokenStr = authHeader.substring(7).trim();
  const hashedToken = sha256(tokenStr);

  if (process.env.AGENT_TOKEN && tokenStr === process.env.AGENT_TOKEN) {
    return { name: 'env-default', id: 'env-default' };
  }

  try {
    const agentToken = await prisma.agentToken.findFirst({
      where: {
        tokenHash: hashedToken,
        enabled: true,
      },
    });

    if (agentToken) {
      await prisma.agentToken.update({
        where: { id: agentToken.id },
        data: { lastUsedAt: new Date() },
      });
      return agentToken;
    }
  } catch (error) {
    // Offline
  }

  return null;
}

async function getOrCreateServer(serverName: string): Promise<string | null> {
  if (!serverName || serverName.trim().length === 0) return null;
  const name = serverName.trim().toLowerCase().substring(0, 64);

  try {
    const existing = await prisma.server.findUnique({ where: { name } });
    if (existing) {
      await prisma.server.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return existing.id;
    }

    const created = await prisma.server.create({
      data: { name, lastSeenAt: new Date() },
    });
    return created.id;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      const existing = await prisma.server.findUnique({ where: { name } });
      if (existing) {
        await prisma.server.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date() },
        });
        return existing.id;
      }
    }
    return null;
  }
}

export async function GET(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const serverName = url.searchParams.get('server') || req.headers.get('x-agent-server') || '';

  let serverId: string | null = null;
  if (serverName) {
    serverId = await getOrCreateServer(serverName);
  }

  try {
    const now = new Date();
    let activeEntries: any[] = [];
    try {
      const whereClause: any = {
        enabled: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      };

      if (serverId) {
        whereClause.AND = [
          {
            OR: [
              { servers: { none: {} } },
              { servers: { some: { id: serverId } } },
            ],
          },
        ];
      }

      activeEntries = await prisma.allowlistEntry.findMany({
        where: whereClause,
        include: { servers: { select: { id: true, name: true } } },
      });
    } catch (e) {
      // DB offline
    }

    const entriesPayload = activeEntries.map((e: any) => ({
      id: e.id,
      ipCidr: e.ipCidr,
      ipVersion: e.ipVersion,
      ports: e.ports,
      mode: e.isPersistent ? 'persistent' : 'temporary',
      expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
      servers: e.servers ? e.servers.map((s: any) => s.name) : [],
    }));

    const responsePayload = {
      generatedAt: now.toISOString(),
      version: activeEntries.length > 0
        ? Math.max(...activeEntries.map((e: any) => e.updatedAt.getTime()))
        : Date.now(),
      entries: entriesPayload,
      serverId: serverId || null,
    };

    const canonicalStr = canonicalJsonStringify(responsePayload);
    const signingSecret = process.env.APP_SIGNING_SECRET;
    if (!signingSecret) {
      console.error('[allowlist] APP_SIGNING_SECRET not set — refusing to serve agent payloads');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const signature = signPayload(canonicalStr, signingSecret);

    const signedResponse = {
      ...responsePayload,
      signature,
    };

    const metadata: any = { count: activeEntries.length };
    if (serverId) {
      metadata.serverId = serverId;
      metadata.serverName = serverName;
    }

    await logAudit({
      actorUserId: null,
      action: 'agent_allowlist_fetched',
      resourceType: 'agent',
      resourceId: agent.id,
      metadata,
    });

    return NextResponse.json(signedResponse);
  } catch (error: any) {
    console.error('Agent allowlist fetch error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
