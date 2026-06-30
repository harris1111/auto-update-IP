import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const DEFAULT_PORT_GROUPS = [
  { key: 'postgres', name: 'PostgreSQL (DevDB)', description: 'Port 15432', ports: [15432], enabled: true, publicExposureAllowed: true },
  { key: 'mongo', name: 'MongoDB (DevDB)', description: 'Port 27017', ports: [27017], enabled: true, publicExposureAllowed: true },
  { key: 'minio', name: 'MinIO API (DevDB)', description: 'Port 19000', ports: [19000], enabled: true, publicExposureAllowed: true },
  { key: 'all', name: 'All Dev Databases', description: 'Ports 15432, 27017, 19000', ports: [15432, 27017, 19000], enabled: true, publicExposureAllowed: true }
];

export async function GET() {
  try {
    let groups = await prisma.portGroup.findMany({
      where: { enabled: true }
    });

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
        groups = await prisma.portGroup.findMany({
          where: { enabled: true }
        });
      } catch (seedErr) {
        // Safe to ignore if write fails in test read-only mode
      }
    }

    if (groups.length === 0) {
      // If DB is offline
      return NextResponse.json(DEFAULT_PORT_GROUPS.filter(pg => pg.enabled));
    }

    return NextResponse.json(groups);
  } catch (error) {
    return NextResponse.json(DEFAULT_PORT_GROUPS.filter(pg => pg.enabled));
  }
}
