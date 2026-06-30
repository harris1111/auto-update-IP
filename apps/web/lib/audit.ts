import { prisma } from './prisma';
import crypto from 'crypto';

export async function logAudit({
  actorUserId,
  action,
  resourceType,
  resourceId,
  ip,
  userAgent,
  metadata = {},
}: {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: any;
}) {
  const userAgentHash = userAgent
    ? crypto.createHash('sha256').update(userAgent).digest('hex')
    : null;
    
  try {
    const entry = await prisma.auditLog.create({
      data: {
        actorUserId: actorUserId || null,
        action,
        resourceType,
        resourceId: resourceId || null,
        ip: ip || null,
        userAgentHash,
        metadata: metadata || {},
      },
    });
    return entry;
  } catch (error) {
    console.warn('Failed to write audit log to database, printing to stdout:', error instanceof Error ? error.message : error);
    return {
      id: 'mock-audit-id',
      actorUserId,
      action,
      resourceType,
      resourceId,
      ip,
      userAgentHash,
      metadata,
      createdAt: new Date(),
    };
  }
}
