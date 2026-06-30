import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sha256 } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import { redis } from '@/lib/redis';

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

export async function POST(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { status, errorMessage, appliedAt } = await req.json();
    if (!status) {
      return NextResponse.json({ error: 'Missing status' }, { status: 400 });
    }

    const url = new URL(req.url);
    const serverName = url.searchParams.get('server') || req.headers.get('x-agent-server') || '';
    const appliedTime = appliedAt ? new Date(appliedAt) : new Date();

    const syncKey = serverName ? `agent:${serverName}:sync` : 'agent:sync';
    const statusKey = serverName ? `agent:${serverName}:status` : 'agent:last_sync_status';
    const timeKey = serverName ? `agent:${serverName}:time` : 'agent:last_sync_time';
    const errorKey = serverName ? `agent:${serverName}:error` : 'agent:last_sync_error';

    await redis.set(statusKey, status, 'EX', 86400);
    await redis.set(timeKey, appliedTime.toISOString(), 'EX', 86400);
    if (errorMessage) {
      await redis.set(errorKey, errorMessage, 'EX', 86400);
    } else {
      await redis.del(errorKey);
    }

    if (status === 'success') {
      const where: any = { enabled: true };

      if (serverName) {
        try {
          const server = await prisma.server.findUnique({ where: { name: serverName } });
          if (server) {
            where.OR = [
              { servers: { none: {} } },
              { servers: { some: { id: server.id } } },
            ];
          }
        } catch (e) {
          // Offline
        }
      }

      try {
        await prisma.allowlistEntry.updateMany({
          where,
          data: { lastAppliedAt: appliedTime },
        });
      } catch (e) {
        // Offline
      }

      await logAudit({
        actorUserId: null,
        action: 'agent_report_success',
        resourceType: 'agent',
        resourceId: agent.id,
        metadata: { appliedAt: appliedTime, serverName: serverName || null },
      });
    } else {
      await logAudit({
        actorUserId: null,
        action: 'agent_report_failed',
        resourceType: 'agent',
        resourceId: agent.id,
        metadata: { error: errorMessage || 'unknown error', appliedAt: appliedTime, serverName: serverName || null },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Agent report error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
