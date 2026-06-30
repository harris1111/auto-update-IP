const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function main() {
  const DEFAULT_PORT_GROUPS = [
    { key: 'postgres', name: 'PostgreSQL (DevDB)', description: 'Port 15432', ports: [15432], enabled: true, publicExposureAllowed: true },
    { key: 'mongo', name: 'MongoDB (DevDB)', description: 'Port 27017', ports: [27017], enabled: true, publicExposureAllowed: true },
    { key: 'minio', name: 'MinIO API (DevDB)', description: 'Port 19000', ports: [19000], enabled: true, publicExposureAllowed: true },
    { key: 'all', name: 'All Dev Databases', description: 'Ports 15432, 27017, 19000', ports: [15432, 27017, 19000], enabled: true, publicExposureAllowed: true }
  ];

  for (const pg of DEFAULT_PORT_GROUPS) {
    await prisma.portGroup.upsert({
      where: { key: pg.key },
      update: {},
      create: pg,
    });
  }
  console.log('Seeded default port groups.');

  const prodRawToken = process.env.AGENT_TOKEN;
  if (prodRawToken) {
    const prodTokenHash = sha256(prodRawToken);
    await prisma.agentToken.upsert({
      where: { id: '33333333-3333-3333-3333-333333333333' },
      update: {
        tokenHash: prodTokenHash,
        enabled: true,
      },
      create: {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Production Agent',
        tokenHash: prodTokenHash,
        enabled: true,
      },
    });
    console.log('Seeded production agent token.');
  }

  const devRawToken = 'agt_compose_dev_token_value_xyz';
  const devTokenHash = sha256(devRawToken);
  await prisma.agentToken.upsert({
    where: { id: '22222222-2222-2222-2222-222222222222' },
    update: {
      tokenHash: devTokenHash,
      enabled: true,
    },
    create: {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Default Compose Agent',
      tokenHash: devTokenHash,
      enabled: true,
    },
  });
  console.log('Seeded default agent token.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
