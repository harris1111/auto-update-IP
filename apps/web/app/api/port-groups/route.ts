import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { ALLOWED_PORTS } from '@/lib/validators';

export const DEFAULT_PORT_GROUPS = [
  { key: 'postgres', name: 'PostgreSQL (DevDB)', description: 'Port 51032', ports: [51032], enabled: true, publicExposureAllowed: true },
  { key: 'mongo', name: 'MongoDB (DevDB)', description: 'Port 51033', ports: [51033], enabled: true, publicExposureAllowed: true },
  { key: 'minio', name: 'MinIO API', description: 'Port 51034', ports: [51034], enabled: true, publicExposureAllowed: true },
  { key: 'redis', name: 'Redis (DevDB)', description: 'Port 51035', ports: [51035], enabled: true, publicExposureAllowed: true },
  { key: 'all', name: 'All Dev Databases', description: 'Ports 51032, 51033, 51034, 51035', ports: [51032, 51033, 51034, 51035], enabled: true, publicExposureAllowed: true }
];

export async function GET() {
  try {
    let groups = await prisma.portGroup.findMany({ orderBy: { createdAt: 'asc' } });

    if (groups.length === 0) {
      try {
        await Promise.all(
          DEFAULT_PORT_GROUPS.map(pg =>
            prisma.portGroup.upsert({
              where: { key: pg.key },
              update: {},
              create: pg
            })
          )
        );
        groups = await prisma.portGroup.findMany({ orderBy: { createdAt: 'asc' } });
      } catch (seedErr) {}
    }

    if (groups.length === 0) {
      return NextResponse.json(DEFAULT_PORT_GROUPS);
    }

    return NextResponse.json(groups);
  } catch (error) {
    return NextResponse.json(DEFAULT_PORT_GROUPS);
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { key, name, description, ports } = await req.json();

    if (!key || !name) {
      return NextResponse.json({ error: 'key and name are required' }, { status: 400 });
    }

    const sanitizedKey = key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 32);
    const sanitizedPorts: number[] = Array.isArray(ports) ? ports.filter((p: any) => typeof p === 'number' && ALLOWED_PORTS.includes(p)) : [];
    if (sanitizedPorts.length === 0) {
      return NextResponse.json({ error: 'At least one valid port is required' }, { status: 400 });
    }

    const existing = await prisma.portGroup.findUnique({ where: { key: sanitizedKey } });
    if (existing) {
      return NextResponse.json({ error: `Port group "${sanitizedKey}" already exists` }, { status: 409 });
    }

    const group = await prisma.portGroup.create({
      data: {
        key: sanitizedKey,
        name: name.trim().substring(0, 64),
        description: description?.trim()?.substring(0, 200) || null,
        ports: sanitizedPorts,
        enabled: true,
        publicExposureAllowed: true,
      },
    });

    await logAudit({
    headers: req.headers,
      actorUserId: session.userId,
      action: 'port_group_created',
      resourceType: 'port_group',
      resourceId: group.id,
      metadata: { key: sanitizedKey, ports: sanitizedPorts },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create port group' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, name, description, ports, enabled } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const data: any = {};
    if (name !== undefined) data.name = name.trim().substring(0, 64);
    if (description !== undefined) data.description = description?.trim()?.substring(0, 200) || null;
    if (ports !== undefined) data.ports = Array.isArray(ports) ? ports.filter((p: any) => typeof p === 'number' && ALLOWED_PORTS.includes(p)) : [];
    if (enabled !== undefined) data.enabled = !!enabled;

    const group = await prisma.portGroup.update({
      where: { id },
      data,
    });

    await logAudit({
    headers: req.headers,
      actorUserId: session.userId,
      action: 'port_group_updated',
      resourceType: 'port_group',
      resourceId: group.id,
      metadata: { key: group.key },
    });

    return NextResponse.json(group);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update port group' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const group = await prisma.portGroup.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: 'Port group not found' }, { status: 404 });
    }

    await prisma.portGroup.delete({ where: { id } });

    await logAudit({
    headers: req.headers,
      actorUserId: session.userId,
      action: 'port_group_deleted',
      resourceType: 'port_group',
      resourceId: id,
      metadata: { key: group.key },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete port group' }, { status: 500 });
  }
}
