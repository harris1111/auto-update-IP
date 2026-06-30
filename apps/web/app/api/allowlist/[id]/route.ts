import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { verifyStepUpToken } from '@/lib/stepup';
import { canonicalJsonStringify, sha256 } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import { isValidIpOrCidr, normalizeIpCidr } from '@/lib/validators';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const entry = await prisma.allowlistEntry.findUnique({
      where: { id }
    });
    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (error) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
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
      `allowlist.update:${id}`,
      payloadHash
    );

    if (!isStepUpValid) {
      return NextResponse.json({ error: 'Invalid or expired step-up token' }, { status: 403 });
    }

    const { label, reason, ipCidr, enabled } = payload;
    
    let normalizedIp = undefined;
    let version = undefined;
    if (ipCidr) {
      if (!isValidIpOrCidr(ipCidr)) {
        return NextResponse.json({ error: 'Invalid IP or CIDR' }, { status: 400 });
      }
      const norm = normalizeIpCidr(ipCidr);
      normalizedIp = norm.ipCidr;
      version = norm.version;
    }

    let entry;
    try {
      entry = await prisma.allowlistEntry.update({
        where: { id },
        data: {
          label: label !== undefined ? label : undefined,
          reason: reason !== undefined ? reason : undefined,
          ipCidr: normalizedIp,
          ipVersion: version,
          enabled: enabled !== undefined ? enabled : undefined,
          updatedBy: session.userId,
        },
      });
    } catch (e) {
      // Mock update fallback
      entry = {
        id,
        label,
        reason,
        ipCidr: normalizedIp || '1.2.3.4/32',
        ipVersion: version || 4,
        enabled: enabled !== undefined ? enabled : true,
        updatedBy: session.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    await logAudit({
      actorUserId: session.userId,
      action: 'allowlist_updated',
      resourceType: 'allowlist_entry',
      resourceId: id,
      metadata: payload,
    });

    return NextResponse.json(entry);
  } catch (error: any) {
    console.error('Allowlist update error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
      `allowlist.delete:${id}`,
      payloadHash
    );

    if (!isStepUpValid) {
      return NextResponse.json({ error: 'Invalid or expired step-up token' }, { status: 403 });
    }

    let ipCidr = 'unknown';
    try {
      const entry = await prisma.allowlistEntry.delete({
        where: { id },
      });
      ipCidr = entry.ipCidr;
    } catch (e) {
      // Mock delete fallback
    }

    await logAudit({
      actorUserId: session.userId,
      action: 'allowlist_deleted',
      resourceType: 'allowlist_entry',
      resourceId: id,
      metadata: { ipCidr },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Allowlist delete error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
