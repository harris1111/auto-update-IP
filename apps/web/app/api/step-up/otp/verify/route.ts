import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { verifyOtp } from '@/lib/crypto';
import { generateStepUpToken } from '@/lib/stepup';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, payloadHash, otp } = await req.json();
    if (!action || !payloadHash || !otp) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Find the latest active OTP challenge for this user, action, and payload hash
    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        userId: session.userId,
        action,
        actionPayloadHash: payloadHash,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      await logAudit({
        actorUserId: session.userId,
        action: 'otp_failed',
        resourceType: 'otp_challenge',
        metadata: { reason: 'no_active_challenge' },
      });
      return NextResponse.json({ error: 'Active OTP challenge not found or expired' }, { status: 400 });
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await logAudit({
        actorUserId: session.userId,
        action: 'otp_failed',
        resourceType: 'otp_challenge',
        resourceId: challenge.id,
        metadata: { reason: 'max_attempts_exceeded' },
      });
      return NextResponse.json({ error: 'Maximum verification attempts exceeded' }, { status: 400 });
    }

    // Increment attempts
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });

    const isMatch = await verifyOtp(otp, challenge.otpHash);
    if (!isMatch) {
      await logAudit({
        actorUserId: session.userId,
        action: 'otp_failed',
        resourceType: 'otp_challenge',
        resourceId: challenge.id,
        metadata: { attempts: challenge.attempts + 1 },
      });
      return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 });
    }

    // Mark as consumed
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    // Generate step-up token
    const token = await generateStepUpToken(session.userId, session.sessionId, action, payloadHash);

    await logAudit({
      actorUserId: session.userId,
      action: 'otp_verified',
      resourceType: 'otp_challenge',
      resourceId: challenge.id,
      metadata: { action, payloadHash },
    });

    return NextResponse.json({ ok: true, stepUpToken: token });
  } catch (error: any) {
    console.error('OTP verify error:', error);
    return NextResponse.json({ error: error.message || 'Error verifying OTP' }, { status: 500 });
  }
}
