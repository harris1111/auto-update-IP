import {
  generateRegistrationOptions as simpleGenerateRegOptions,
  verifyRegistrationResponse as simpleVerifyRegResponse,
  generateAuthenticationOptions as simpleGenerateAuthOptions,
  verifyAuthenticationResponse as simpleVerifyAuthResponse,
} from '@simplewebauthn/server';

export const rpId = process.env.PASSKEY_RP_ID || 'localhost';
export const rpName = process.env.PASSKEY_RP_NAME || '0ERR Firewall Update';
export const expectedOrigin = process.env.PASSKEY_ORIGIN || 'http://localhost:3000';

export function getRegistrationOptions(userId: string, userEmail: string, userName: string, excludeCredentials?: any[]) {
  return simpleGenerateRegOptions({
    rpName,
    rpID: rpId,
    userID: Buffer.from(userId),
    userName: userEmail,
    userDisplayName: userName,
    attestationType: 'none',
    excludeCredentials: excludeCredentials?.map(cred => ({
      id: cred.credentialId,
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });
}

export function getAuthenticationOptions(allowCredentials?: any[]) {
  return simpleGenerateAuthOptions({
    rpID: rpId,
    allowCredentials: allowCredentials?.map(cred => ({
      id: cred.credentialId,
      type: 'public-key',
      transports: cred.transports || undefined,
    })),
    userVerification: 'preferred',
  });
}

export async function verifyRegistration(responseBody: any, expectedChallenge: string) {
  const verification = await simpleVerifyRegResponse({
    response: responseBody,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpId,
    requireUserVerification: false,
  });

  return verification;
}

export async function verifyAuthentication(
  responseBody: any,
  expectedChallenge: string,
  credential: { publicKey: string; counter: number; credentialId: string }
) {
  const verification = await simpleVerifyAuthResponse({
    response: responseBody,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpId,
    credential: {
      id: credential.credentialId || responseBody.id,
      publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64')),
      counter: Number(credential.counter),
      transports: responseBody.response?.transports || [],
    },
    requireUserVerification: false,
  });

  return verification;
}
