import { NextResponse } from 'next/server';
import net from 'net';

export async function GET(req: Request) {
  let ip = '127.0.0.1';
  let source = 'default';

  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const xRealIp = req.headers.get('x-real-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');

  if (process.env.TRUST_CF_CONNECTING_IP === 'true' && cfConnectingIp) {
    ip = cfConnectingIp.trim();
    source = 'cf-connecting-ip';
  } else if (cfConnectingIp && process.env.NODE_ENV !== 'production') {
    // Also allow in dev for mock testing
    ip = cfConnectingIp.trim();
    source = 'cf-connecting-ip';
  } else if (xRealIp) {
    ip = xRealIp.trim();
    source = 'x-real-ip';
  } else if (xForwardedFor) {
    // In production we should be careful, but we can extract the first client IP
    const parts = xForwardedFor.split(',');
    ip = parts[0].trim();
    source = 'x-forwarded-for';
  }

  // Detect IP version
  let ipVersion = net.isIP(ip);
  if (ipVersion === 0) {
    // Fallback to v4 if parsing failed (e.g. mock IP)
    ipVersion = 4;
  }

  return NextResponse.json({
    ip,
    ipVersion,
    source,
  });
}
