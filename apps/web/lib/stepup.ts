import { encrypt, decrypt } from './session';

export async function generateStepUpToken(
  userId: string,
  sessionId: string,
  action: string,
  payloadHash: string
): Promise<string> {
  const payload = {
    userId,
    sessionId,
    action,
    payloadHash,
    type: 'step-up',
  };
  return await encrypt(payload, '5m'); // 5 minutes TTL
}

export async function verifyStepUpToken(
  token: string,
  userId: string,
  sessionId: string,
  action: string,
  payloadHash: string
): Promise<boolean> {
  if (!token) return false;
  const decoded = await decrypt(token);
  if (!decoded) return false;
  
  return (
    decoded.type === 'step-up' &&
    decoded.userId === userId &&
    decoded.sessionId === sessionId &&
    decoded.action === action &&
    decoded.payloadHash === payloadHash
  );
}
