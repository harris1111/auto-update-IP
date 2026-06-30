import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sha256, canonicalJsonStringify, signPayload } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';

async function authenticateAgent(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const tokenStr = authHeader.substring(7).trim();
  const hashedToken = sha256(tokenStr);

  // Check env variable fallback
  if (process.env.AGENT_TOKEN && tokenStr === process.env.AGENT_TOKEN) {
    return { name: 'env-default', id: 'env-default' };
  }

  try {
    const agentToken = await prisma.agentToken.findFirst({
      where: {
        tokenHash: hashedToken,
        enabled: true,
      },
    });

    if (agentToken) {
      // Update last used at
      await prisma.agentToken.update({
        where: { id: agentToken.id },
        data: { lastUsedAt: new Date() },
      });
      return agentToken;
    }
  } catch (error) {
    // If DB is offline
  }

  return null;
}

export async function GET(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    // Fetch active allowlist entries
    let activeEntries: any[] = [];
    try {
      activeEntries = await prisma.allowlistEntry.findMany({
        where: {
          enabled: true,
          OR: [
            { expiresAt: null }, // Persistent
            { expiresAt: { gt: now } }, // Non-expired temporary
          ],
        },
      });
    } catch (e) {
      // Fallback in case of DB disconnection
    }

    const entriesPayload = activeEntries.map((e: any) => ({
      id: e.id,
      ipCidr: e.ipCidr,
      ipVersion: e.ipVersion,
      ports: e.ports,
      mode: e.isPersistent ? 'persistent' : 'temporary',
      expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    }));

    const responsePayload = {
      generatedAt: now.toISOString(),
      version: activeEntries.length > 0 
        ? Math.max(...activeEntries.map((e: any) => e.updatedAt.getTime())) 
        : Date.now(),
      entries: entriesPayload,
    };

    // Calculate signature over canonical JSON of the response payload (which excludes signature field)
    const canonicalStr = canonicalJsonStringify(responsePayload);
    const signingSecret = process.env.APP_SIGNING_SECRET || 'fallback-signing-secret-key-at-least-32-chars';
    const signature = signPayload(canonicalStr, signingSecret);

    const signedResponse = {
      ...responsePayload,
      signature,
    };

    await logAudit({
      actorUserId: null,
      action: 'agent_allowlist_fetched',
      resourceType: 'agent',
      resourceId: agent.id,
      metadata: { count: activeEntries.length },
    });

    return NextResponse.json(signedResponse);
  } catch (error: any) {
    console.error('Agent allowlist fetch error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
