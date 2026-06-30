import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setSession } from '@/lib/session';
import { hashEmail, hashOtp, verifyOtp, generateOtp } from '@/lib/crypto';
import { verifyCloudflareAccess } from '@/lib/cloudflare';
import { logAudit } from '@/lib/audit';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const cfIdentity = await verifyCloudflareAccess(req);
    if (cfIdentity) {
      const user = await ensureUser(cfIdentity.email, 'cloudflare-access', cfIdentity.sub);
      return await createSessionAndRespond(user, cfIdentity.email, req);
    }

    const body = await req.json().catch(() => ({}));
    const { email, step, otp } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = hashEmail(normalizedEmail);
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const isAdmin = adminEmail === normalizedEmail;

    let user = await prisma.user.findFirst({ where: { emailHash } });

    if (step === 'request_otp') {
      if (!user) {
        if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        user = await prisma.user.create({
          data: {
            emailHash,
            displayName: normalizedEmail.split('@')[0],
            provider: 'pending',
            providerSubject: 'otp-login',
            role: 'admin',
            passkeyRequired: true,
            passkeyEnrolled: false,
          },
        });
      }

      const otpCode = generateOtp(6);
      const otpHashed = await hashOtp(otpCode);

      const cooldownKey = `login:cooldown:${user.id}`;
      const { redis } = await import('@/lib/redis');
      try {
        const cooldown = await redis.get(cooldownKey);
        if (cooldown) return NextResponse.json({ error: 'Wait before requesting another code' }, { status: 429 });
        await redis.set(cooldownKey, '1', 'EX', 60);
      } catch (e) {}

      await prisma.otpChallenge.create({
        data: {
          userId: user.id,
          action: 'login_otp',
          actionPayloadHash: emailHash,
          otpHash: otpHashed,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      await sendEmail(normalizedEmail, otpCode);

      return NextResponse.json({ ok: true, message: 'Verification code sent' });
    }

    if (step === 'verify_otp') {
      if (!otp) return NextResponse.json({ error: 'OTP required' }, { status: 400 });
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      const challenge = await prisma.otpChallenge.findFirst({
        where: {
          userId: user.id,
          action: 'login_otp',
          actionPayloadHash: emailHash,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!challenge) return NextResponse.json({ error: 'No active code or expired' }, { status: 400 });

      const match = await verifyOtp(otp, challenge.otpHash);
      if (!match) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });

      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });

      return await createSessionAndRespond(user, normalizedEmail, req);
    }

    if (!user) {
      if (isAdmin) return NextResponse.json({ needsSetup: true }, { status: 200 });
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    return NextResponse.json({
      needsPasskeyAuth: true,
      hasPasskeys: user.passkeyEnrolled,
    });
  } catch (e: any) {
    console.error('Login error:', e);
    return NextResponse.json({ error: e.message || 'Login error' }, { status: 500 });
  }
}

async function ensureUser(email: string, provider: string, subject: string) {
  const emailHash = hashEmail(email);
  let user = await prisma.user.findFirst({ where: { emailHash } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        emailHash,
        displayName: email.split('@')[0],
        provider,
        providerSubject: subject,
        role: 'admin',
        passkeyRequired: true,
        passkeyEnrolled: false,
      },
    });
  }
  return user;
}

async function createSessionAndRespond(user: any, email: string, req: Request) {
  const sessionId = crypto.randomUUID();
  await setSession({ userId: user.id, email, role: user.role, sessionId });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  }).catch(() => {});

  await logAudit({
    actorUserId: user.id,
    action: 'login_success',
    resourceType: 'session',
    ip: req.headers.get('cf-connecting-ip') || undefined,
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email, role: user.role, passkeyEnrolled: user.passkeyEnrolled },
  });
}

async function sendEmail(to: string, code: string) {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || '127.0.0.1',
      port: parseInt(process.env.SMTP_PORT || '1025', 10),
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD || '',
      } : undefined,
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@0err.com',
      to,
      subject: '0ERR Firewall - Login Code',
      text: `Your verification code: ${code}\nExpires in 5 minutes.`,
    });
  } catch (e: any) {
    console.error(`SMTP failed, OTP for ${to}:`, e.message);
    console.log(`[LOGIN OTP] To: ${to} | Code: ${code}`);
  }
}
