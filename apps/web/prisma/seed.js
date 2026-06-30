const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function main() {
  const DEFAULT_PORT_GROUPS = [
    { key: 'infra', name: 'Infra Stack', description: 'Ports 50000-50012 (Prometheus, Grafana, Loki, DBs, Exporters)', ports: [50000,50001,50002,50003,50004,50005,50006,50007,50008,50009,50010,50011,50012], enabled: true, publicExposureAllowed: true },
    { key: 'apps', name: 'Application Services', description: 'Ports 52100-52117 (karakeep, komga, kavita, calibre, syncthing, etc.)', ports: [52100,52101,52102,52103,52104,52105,52106,52107,52108,52109,52110,52111,52112,52113,52114,52115,52116,52117], enabled: true, publicExposureAllowed: true },
    { key: 'kientaosteel', name: 'Kientaosteel Services', description: 'Ports 53000-59001 (kt-frontend, kt-backend, kt-admin, kt-minio)', ports: [53000,55070,55433,58080,59000,59001], enabled: true, publicExposureAllowed: true },
    { key: 'all', name: 'All Services (50000-60000)', description: 'Full protected range', ports: [], enabled: true, publicExposureAllowed: true }
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
