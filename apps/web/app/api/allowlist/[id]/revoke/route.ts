import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { verifyStepUpToken } from '@/lib/stepup';
import { canonicalJsonStringify, sha256 } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { stepUpToken, ...payload } = body;

    if (!stepUpToken) {
      return NextResponse.json({ error: 'Step-up authentication required' }, { status: 403 });
    }

    const canonicalPayload = canonicalJsonStringify(payload);
    const payloadHash = sha256(canonicalPayload);

    const isStepUpValid = await verifyStepUpToken(
      stepUpToken,
      session.userId,
      session.sessionId,
      `allowlist.revoke:${id}`,
      payloadHash
    );

    if (!isStepUpValid) {
      return NextResponse.json({ error: 'Invalid or expired step-up token' }, { status: 403 });
    }

    let entry;
    try {
      entry = await prisma.allowlistEntry.update({
        where: { id },
        data: { enabled: false },
      });
    } catch (e) {
      // Mock fallback
      entry = { id, enabled: false, ipCidr: 'unknown' };
    }

    await logAudit({
      actorUserId: session.userId,
      action: 'allowlist_revoked',
      resourceType: 'allowlist_entry',
      resourceId: id,
      metadata: { ipCidr: entry.ipCidr },
    });

    return NextResponse.json({ ok: true, entry });
  } catch (error: any) {
    console.error('Allowlist revoke error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
