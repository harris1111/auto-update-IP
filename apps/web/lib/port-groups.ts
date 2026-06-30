import { prisma } from './prisma';

export const FIXED_PORT_GROUPS = [
  { key: 'postgres', name: 'PostgreSQL (DevDB)', description: 'Port 51032', ports: [51032], enabled: true, publicExposureAllowed: true },
  { key: 'mongo', name: 'MongoDB (DevDB)', description: 'Port 51033', ports: [51033], enabled: true, publicExposureAllowed: true },
  { key: 'minio', name: 'MinIO API', description: 'Port 51034', ports: [51034], enabled: true, publicExposureAllowed: true },
  { key: 'redis', name: 'Redis (DevDB)', description: 'Port 51035', ports: [51035], enabled: true, publicExposureAllowed: true },
];

export async function resolveAllPorts(): Promise<number[]> {
  try {
    const groups = await prisma.portGroup.findMany({
      where: { enabled: true, key: { not: 'all' } },
      select: { ports: true },
    });
    if (groups.length === 0) {
      return FIXED_PORT_GROUPS.flatMap(g => g.ports);
    }
    const allPorts = groups.flatMap(g => g.ports);
    return Array.from(new Set(allPorts)).sort((a, b) => a - b);
  } catch {
    return FIXED_PORT_GROUPS.flatMap(g => g.ports);
  }
}

export async function resolvePortsForKeys(portGroupKeys: string[]): Promise<number[]> {
  try {
    const allGroups = await prisma.portGroup.findMany({
      where: { enabled: true },
      select: { key: true, ports: true },
    });

    const resolvedPorts: number[] = [];

    for (const key of portGroupKeys) {
      if (key === 'all') {
        const allPorts = allGroups
          .filter(g => g.key !== 'all')
          .flatMap(g => g.ports);
        resolvedPorts.push(...allPorts);
      } else {
        const group = allGroups.find(g => g.key === key);
        if (group) resolvedPorts.push(...group.ports);
      }
    }

    if (resolvedPorts.length === 0) {
      const fallback = FIXED_PORT_GROUPS;
      for (const key of portGroupKeys) {
        const fg = fallback.find(g => g.key === key);
        if (fg) resolvedPorts.push(...fg.ports);
      }
      if (portGroupKeys.includes('all')) {
        resolvedPorts.push(...fallback.flatMap(g => g.ports));
      }
    }

    return Array.from(new Set(resolvedPorts)).sort((a, b) => a - b);
  } catch {
    const fallback = FIXED_PORT_GROUPS;
    const resolvedPorts: number[] = [];
    for (const key of portGroupKeys) {
      if (key === 'all') {
        resolvedPorts.push(...fallback.flatMap(g => g.ports));
      } else {
        const fg = fallback.find(g => g.key === key);
        if (fg) resolvedPorts.push(...fg.ports);
      }
    }
    return Array.from(new Set(resolvedPorts)).sort((a, b) => a - b);
  }
}
