import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const servers = await prisma.server.findMany({ orderBy: { createdAt: 'asc' } });

    const result: any[] = [];

    for (const server of servers) {
      const status = await redis.get(`agent:${server.name}:status`) || '';
      const time = await redis.get(`agent:${server.name}:time`) || '';
      const error = await redis.get(`agent:${server.name}:error`) || '';
      result.push({
        id: server.id,
        name: server.name,
        status: status || 'unknown',
        lastSync: time || null,
        lastError: error || null,
        lastSeenAt: server.lastSeenAt,
      });
    }

    if (result.length === 0) {
      const legacyStatus = await redis.get('agent:last_sync_status') || '';
      const legacyTime = await redis.get('agent:last_sync_time') || '';
      result.push({
        id: 'legacy',
        name: 'Default Server',
        status: legacyStatus || 'unknown',
        lastSync: legacyTime || null,
        lastError: null,
        lastSeenAt: null,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json([]);
  }
}
