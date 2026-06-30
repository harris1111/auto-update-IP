import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const DEFAULT_PORT_GROUPS = [
  { key: 'infra', name: 'Infra Stack (Prometheus, Grafana, Loki)', description: 'Ports 50000-50012', ports: [50000,50001,50002,50003,50004,50005,50006,50007,50008,50009,50010,50011,50012], enabled: true, publicExposureAllowed: true },
  { key: 'apps', name: 'Application Services', description: 'Ports 52100-52117', ports: [52100,52101,52102,52103,52104,52105,52106,52107,52108,52109,52110,52111,52112,52113,52114,52115,52116,52117], enabled: true, publicExposureAllowed: true },
  { key: 'kientaosteel', name: 'Kientaosteel Services', description: 'Ports 53000-59001', ports: [53000,55070,55433,58080,59000,59001], enabled: true, publicExposureAllowed: true },
  { key: 'all', name: 'All Services (50000-60000)', description: 'Full protected range', ports: [], enabled: true, publicExposureAllowed: true }
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
