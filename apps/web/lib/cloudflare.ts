import { jwtVerify, createRemoteJWKSet } from 'jose';

const CF_TEAM_DOMAIN = process.env.CF_TEAM_DOMAIN || '';
const CF_AUD = process.env.CF_AUD || '';

const jwksUrl = CF_TEAM_DOMAIN
  ? `https://${CF_TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`
  : null;

let remoteJWKSet: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwksUrl) return null;
  if (!remoteJWKSet) {
    remoteJWKSet = createRemoteJWKSet(new URL(jwksUrl));
  }
  return remoteJWKSet;
}

export interface CFIdentity {
  email: string;
  sub: string;
  name?: string;
}

export async function verifyCloudflareAccess(req: Request): Promise<CFIdentity | null> {
  const jwks = getJWKS();
  if (!jwks) return null;

  const jwt = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;

  try {
    const { payload } = await jwtVerify(jwt, jwks, {
      audience: CF_AUD || undefined,
      issuer: CF_TEAM_DOMAIN
        ? `https://${CF_TEAM_DOMAIN}.cloudflareaccess.com`
        : undefined,
    });

    const email = payload.email as string;
    if (!email) return null;

    return {
      email,
      sub: payload.sub as string,
      name: (payload.name as string) || undefined,
    };
  } catch (e) {
    console.error('CF Access JWT verification failed:', e);
    return null;
  }
}
