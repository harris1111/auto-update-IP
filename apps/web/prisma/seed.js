const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const DEFAULT_PORT_GROUPS = [
    { key: 'postgres', name: 'PostgreSQL (DevDB)', description: 'Port 51032', ports: [51032], enabled: true, publicExposureAllowed: true },
    { key: 'mongo', name: 'MongoDB (DevDB)', description: 'Port 51033', ports: [51033], enabled: true, publicExposureAllowed: true },
    { key: 'minio', name: 'MinIO API', description: 'Port 51034', ports: [51034], enabled: true, publicExposureAllowed: true },
    { key: 'redis', name: 'Redis (DevDB)', description: 'Port 51035', ports: [51035], enabled: true, publicExposureAllowed: true },
    { key: 'all', name: 'All Dev Databases', description: 'Ports 51032, 51033, 51034, 51035', ports: [51032, 51033, 51034, 51035], enabled: true, publicExposureAllowed: true }
  ];

  for (const pg of DEFAULT_PORT_GROUPS) {
    await prisma.portGroup.upsert({
      where: { key: pg.key },
      update: {},
      create: pg,
    });
  }
  console.log('Seeded default port groups.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
