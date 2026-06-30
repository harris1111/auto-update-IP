import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

function escapeShell(s: string): string {
  return s.replace(/'/g, "'\\''");
}

function buildBootstrapCommand(serverName: string): string {
  const token = process.env.AGENT_TOKEN;
  const signingSecret = process.env.APP_SIGNING_SECRET;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://update.0err.com/api/agent/allowlist';

  if (!token || !signingSecret) {
    return `# Error: cannot generate bootstrap command — server missing required secrets.
# Ensure AGENT_TOKEN and APP_SIGNING_SECRET are set in the web container environment.`;
  }

  const escServer = escapeShell(serverName);
  const escToken = escapeShell(token);
  const escSecret = escapeShell(signingSecret);
  const escApi = escapeShell(apiUrl);

  return `# Bootstrap firewall-agent on worker "${serverName}"
# Copy and run this entire block on the worker machine as root:
# Requires: Debian 12+ / Ubuntu 22.04+ with internet access

export SERVER_NAME='${escServer}'
export AGENT_TOKEN='${escToken}'
export APP_SIGNING_SECRET='${escSecret}'
export ALLOWLIST_API_URL='${escApi}'

apt-get update && apt-get install -y git nftables wget \\
&& { command -v go && go version | grep -qE 'go1\\.(2[1-9]|[3-9][0-9])' ; } \\
  || { wget -q https://go.dev/dl/go1.23.11.linux-amd64.tar.gz -O /tmp/go.tar.gz && rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz ; } \\
&& export PATH=/usr/local/go/bin:$PATH \\
&& git clone https://github.com/harris1111/auto-update-IP.git /opt/update-allowlist \\
&& cat > /opt/update-allowlist/apps/firewall-agent/.env << 'ENVEOF'
ALLOWLIST_API_URL='${escApi}'
AGENT_TOKEN='${escToken}'
APP_SIGNING_SECRET='${escSecret}'
SERVER_NAME='${escServer}'
NFT_TABLE=shared_dedi
NFT_DB_V4_SET=db_allow_v4
NFT_DB_V6_SET=db_allow_v6
APPLY_INTERVAL_SECONDS=15
FAIL_CLOSED=true
DRY_RUN=false
ENVEOF
nft -f /opt/update-allowlist/infra/nftables/shared-dedi.nft \\
&& sed -i 's|/home/debian/infra/update-allowlist|/opt/update-allowlist|g' /opt/update-allowlist/infra/systemd/firewall-agent.service \\
&& cd /opt/update-allowlist/apps/firewall-agent && go build -o firewall-agent ./cmd/firewall-agent \\
&& cp /opt/update-allowlist/infra/systemd/firewall-agent.service /etc/systemd/system/ \\
&& systemctl daemon-reload && systemctl enable --now firewall-agent \\
&& echo "Worker '${escServer}' joined. Check: systemctl status firewall-agent"`;
}

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

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name } = await req.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Server name is required' }, { status: 400 });
    }

    const serverName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 64);

    const existing = await prisma.server.findUnique({ where: { name: serverName } });
    if (existing) {
      return NextResponse.json({ error: `Server "${serverName}" already exists` }, { status: 409 });
    }

    const server = await prisma.server.create({
      data: { name: serverName },
    });

    const bootstrapCommand = buildBootstrapCommand(serverName);

    await logAudit({
      actorUserId: session.userId,
      action: 'server_created',
      resourceType: 'server',
      resourceId: server.id,
      metadata: { name: serverName },
    });

    return NextResponse.json({
      id: server.id,
      name: server.name,
      createdAt: server.createdAt,
      bootstrapCommand,
    });
  } catch (error: any) {
    if (error.message?.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Server name already taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create server' }, { status: 500 });
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
