import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { isValidIpOrCidr, normalizeIpCidr, validatePorts, validateExpiry } from '@/lib/validators';
import { verifyStepUpToken } from '@/lib/stepup';
import { canonicalJsonStringify, sha256 } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import { resolvePortsForKeys } from '@/lib/port-groups';

interface ImportRule {
  ipCidr: string;
  label: string;
  reason?: string;
  portGroupKeys: string[];
  mode: 'temporary' | 'persistent';
  ttlMinutes?: number;
  serverIds?: string[];
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { rules, stepUpToken } = body;

    if (!stepUpToken) {
      return NextResponse.json({ error: 'Step-up authentication required' }, { status: 403 });
    }

    if (!rules || !Array.isArray(rules) || rules.length === 0) {
      return NextResponse.json({ error: 'No rules provided' }, { status: 400 });
    }

    if (rules.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 rules per import' }, { status: 400 });
    }

    const payloadHash = sha256(canonicalJsonStringify({ count: rules.length }));
    const isStepUpValid = await verifyStepUpToken(
      stepUpToken,
      session.userId,
      session.sessionId,
      'allowlist.import',
      payloadHash
    );

    if (!isStepUpValid) {
      return NextResponse.json({ error: 'Invalid or expired step-up token' }, { status: 403 });
    }

    const results: { index: number; status: 'created' | 'error'; message?: string }[] = [];

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      try {
        if (!rule.ipCidr || !rule.label || !rule.portGroupKeys || !rule.mode) {
          results.push({ index: i, status: 'error', message: 'Missing required fields (ipCidr, label, portGroupKeys, mode)' });
          continue;
        }

        if (!isValidIpOrCidr(rule.ipCidr)) {
          results.push({ index: i, status: 'error', message: `Invalid IP/CIDR: ${rule.ipCidr}` });
          continue;
        }
        const { ipCidr: normalizedIp, version } = normalizeIpCidr(rule.ipCidr);

        if (!['temporary', 'persistent'].includes(rule.mode)) {
          results.push({ index: i, status: 'error', message: `Invalid mode: ${rule.mode}` });
          continue;
        }

        const uniquePorts = await resolvePortsForKeys(rule.portGroupKeys);

        if (!validatePorts(uniquePorts)) {
          results.push({ index: i, status: 'error', message: 'Invalid port group keys' });
          continue;
        }

        let expiresAt: Date | null = null;
        try {
          expiresAt = validateExpiry(rule.mode, undefined, rule.ttlMinutes || 120);
        } catch (expErr: any) {
          results.push({ index: i, status: 'error', message: expErr.message });
          continue;
        }

        const serverConnect = rule.serverIds && Array.isArray(rule.serverIds) && rule.serverIds.length > 0
          ? { connect: rule.serverIds.map((id: string) => ({ id })) }
          : undefined;

        const entry = await prisma.allowlistEntry.create({
          data: {
            ipCidr: normalizedIp,
            ipVersion: version,
            label: rule.label,
            reason: rule.reason || null,
            ports: uniquePorts,
            isPersistent: rule.mode === 'persistent',
            expiresAt,
            createdBy: session.userId,
            updatedBy: session.userId,
            ...(serverConnect ? { servers: serverConnect } : {}),
          }
        });

        results.push({ index: i, status: 'created' });
      } catch (err: any) {
        results.push({ index: i, status: 'error', message: err.message || 'Unknown error' });
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const failed = results.filter(r => r.status === 'error').length;

    await logAudit({
      headers: req.headers,
      actorUserId: session.userId,
      action: 'allowlist_import',
      resourceType: 'allowlist_entry',
      metadata: { total: rules.length, created, failed },
    });

    return NextResponse.json({ results, summary: { total: rules.length, created, failed } });
  } catch (error: any) {
    console.error('Allowlist import error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
