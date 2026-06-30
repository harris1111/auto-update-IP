import { NextResponse } from 'next/server';
import { clearSession, getSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export async function POST() {
  const session = await getSession();
  if (session) {
    await logAudit({
      actorUserId: session.userId,
      action: 'logout_success',
      resourceType: 'user',
      resourceId: session.userId,
    });
  }
  await clearSession();
  return NextResponse.json({ success: true });
}
