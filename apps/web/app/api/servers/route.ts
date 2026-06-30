import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const servers = await prisma.server.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { entries: true } },
      },
    });

    return NextResponse.json(servers.map(s => ({
      id: s.id,
      name: s.name,
      lastSeenAt: s.lastSeenAt,
      createdAt: s.createdAt,
      entryCount: s._count.entries,
    })));
  } catch (error) {
    return NextResponse.json([]);
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const serverId = url.searchParams.get('id');
    if (!serverId) {
      return NextResponse.json({ error: 'Server id required' }, { status: 400 });
    }

    await prisma.server.delete({ where: { id: serverId } });

    await logAudit({
      actorUserId: session.userId,
      action: 'server_deleted',
      resourceType: 'server',
      resourceId: serverId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete server' }, { status: 500 });
  }
}
