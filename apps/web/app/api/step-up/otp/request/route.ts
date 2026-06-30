import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { generateOtp, hashOtp } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, payloadHash } = await req.json();
    if (!action || !payloadHash) {
      return NextResponse.json({ error: 'Missing action or payloadHash' }, { status: 400 });
    }

    // Rate limiting: check resend cooldown from redis
    const cooldownKey = `otp:cooldown:${session.userId}:${action}:${payloadHash}`;
    const isCool = await redisGet(cooldownKey);
    if (isCool) {
      return NextResponse.json({ error: 'Please wait before requesting another OTP' }, { status: 429 });
    }

    const otp = generateOtp(6);
    const otpHashed = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

    // Store challenge in Postgres
    await prisma.otpChallenge.create({
      data: {
        userId: session.userId,
        action,
        actionPayloadHash: payloadHash,
        otpHash: otpHashed,
        expiresAt,
      },
    });

    // Save resend cooldown (60 seconds) in redis
    await redisSet(cooldownKey, '1', 60);

    // Send email to ADMIN_EMAIL
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || '127.0.0.1',
        port: parseInt(process.env.SMTP_PORT || '1025', 10),
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD || '',
        } : undefined,
      });

      const mailOptions = {
        from: process.env.SMTP_FROM || 'no-reply@0err.com',
        to: adminEmail,
        subject: 'Step-Up Verification OTP',
        text: `Your OTP for action "${action}" is: ${otp}. It will expire in 5 minutes.`,
      };

      try {
        await transporter.sendMail(mailOptions);
      } catch (mailErr) {
        console.error('SMTP error, printing OTP to stdout instead:', mailErr);
        console.log(`[DEV OTP EMAIL] To: ${adminEmail} | OTP: ${otp} | Action: ${action}`);
      }
    } else {
      console.log(`[DEV OTP EMAIL] (No ADMIN_EMAIL set) | OTP: ${otp} | Action: ${action}`);
    }

    await logAudit({
    headers: req.headers,
      actorUserId: session.userId,
      action: 'otp_requested',
      resourceType: 'otp_challenge',
      metadata: { action, payloadHash },
    });

    return NextResponse.json({
      ok: true,
      message: 'OTP sent to the configured admin mailbox.',
    });
  } catch (error: any) {
    console.error('OTP request error:', error);
    return NextResponse.json({ error: error.message || 'Error processing request' }, { status: 500 });
  }
}

// Simple helpers to avoid direct redis commands crash
async function redisGet(key: string) {
  try {
    const { redis } = await import('@/lib/redis');
    return await redis.get(key);
  } catch (e) {
    return null;
  }
}

async function redisSet(key: string, val: string, ttl: number) {
  try {
    const { redis } = await import('@/lib/redis');
    await redis.set(key, val, 'EX', ttl);
  } catch (e) {}
}
