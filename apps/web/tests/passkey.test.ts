import { vi, describe, it, expect, beforeEach } from 'vitest';
import { POST as registerOptions } from '@/app/api/auth/passkey/register/options/route';
import { POST as registerVerify } from '@/app/api/auth/passkey/register/verify/route';
import { POST as authenticateOptions } from '@/app/api/auth/passkey/authenticate/options/route';
import { POST as authenticateVerify } from '@/app/api/auth/passkey/authenticate/verify/route';
import { POST as stepUpOptions } from '@/app/api/step-up/passkey/options/route';
import { POST as stepUpVerify } from '@/app/api/step-up/passkey/verify/route';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { hashEmail } from '@/lib/crypto';

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      passkeyCredential: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn((val) => Promise.all(val)),
    },
  };
});

vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getSession: vi.fn(() => ({
      userId: 'test-user-id',
      email: 'admin@0err.com',
      role: 'admin',
      sessionId: 'test-session-id',
    })),
    setSession: vi.fn(),
  };
});

describe('Passkey API Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure test environment variable
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-session-secret-key-at-least-32-chars-long';
  });

  describe('Passkey Enrollment Flow', () => {
    it('should generate registration options and store challenge in Redis', async () => {
      const mockUser = {
        id: 'test-user-id',
        displayName: 'admin',
        credentials: [],
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      
      const response = await registerOptions();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('challenge');
      
      // Verify challenge is saved in Redis
      const storedChallenge = await redis.get(`challenge:reg:test-user-id`);
      expect(storedChallenge).toEqual(data.challenge);
    });

    it('should verify registration signature, save credential, and update user state', async () => {
      // Set the challenge in Redis first
      const challenge = 'mock-reg-challenge-xyz';
      await redis.set(`challenge:reg:test-user-id`, challenge);

      const requestBody = {
        id: 'new-cred-id',
        mockVerify: true,
        mockPublicKey: 'mock-public-key-base64-string',
        credentialName: 'Yubikey',
        response: {
          clientDataJSON: 'mock-client-data',
          attestationObject: 'mock-attestation',
        },
      };

      const req = new Request('http://localhost/api/auth/passkey/register/verify', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await registerVerify(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);

      // Verify Prisma database calls
      expect(prisma.passkeyCredential.create).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-user-id' },
          data: { passkeyEnrolled: true },
        })
      );
    });
  });

  describe('Passkey Login Flow', () => {
    it('should generate authentication options for enrolled credentials', async () => {
      const mockUser = {
        id: 'test-user-id',
        emailHash: hashEmail('admin@0err.com'),
        credentials: [{ credentialId: 'enrolled-cred-id', publicKey: 'abc', counter: 0 }],
      };
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as any);

      const req = new Request('http://localhost/api/auth/passkey/authenticate/options', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@0err.com' }),
      });

      const response = await authenticateOptions(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('challenge');
      expect(data).toHaveProperty('tempId');

      // Check if challenge mapping is stored in Redis
      const tempIdData = await redis.get(`challenge:auth:${data.tempId}`);
      expect(tempIdData).not.toBeNull();
      const parsed = JSON.parse(tempIdData!);
      expect(parsed.challenge).toEqual(data.challenge);
      expect(parsed.userId).toEqual('test-user-id');
    });

    it('should verify auth signature, increment counter, and write login session', async () => {
      const tempId = 'temp-auth-id-123';
      const challenge = 'mock-auth-challenge-abc';
      await redis.set(
        `challenge:auth:${tempId}`,
        JSON.stringify({ challenge, userId: 'test-user-id', email: 'admin@0err.com' })
      );

      vi.mocked(prisma.passkeyCredential.findUnique).mockResolvedValue({
        id: 'db-cred-id',
        credentialId: 'enrolled-cred-id',
        userId: 'test-user-id',
        publicKey: 'mock-public-key',
        counter: 10,
      } as any);

      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'test-user-id',
        role: 'admin',
      } as any);

      const requestBody = {
        tempId,
        body: {
          id: 'enrolled-cred-id',
          mockVerify: true,
          response: {
            clientDataJSON: 'mock',
            authenticatorData: 'mock',
            signature: 'mock',
          },
        },
      };

      const req = new Request('http://localhost/api/auth/passkey/authenticate/verify', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await authenticateVerify(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);

      // Verify counter increment in database
      expect(prisma.passkeyCredential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            counter: BigInt(11), // incremented
          }),
        })
      );
    });
  });

  describe('Passkey Step-Up Flow', () => {
    it('should generate options and verify passkey to issue step-up tokens', async () => {
      // 1. Get options
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'test-user-id',
        credentials: [{ credentialId: 'cred-123' }],
      } as any);

      const optRes = await stepUpOptions();
      const optData = await optRes.json();
      expect(optRes.status).toBe(200);

      // Store challenge in redis (simulating endpoint behavior)
      await redis.set(`challenge:stepup-passkey:test-user-id`, optData.challenge);

      // 2. Verify step-up
      vi.mocked(prisma.passkeyCredential.findUnique).mockResolvedValue({
        id: 'db-id',
        credentialId: 'cred-123',
        userId: 'test-user-id',
        publicKey: 'mock-key',
        counter: 5,
      } as any);

      const payload = { ipCidr: '1.2.3.4/32', label: 'Work' };
      const crypto = require('crypto');
      const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

      const verifyReq = new Request('http://localhost/api/step-up/passkey/verify', {
        method: 'POST',
        body: JSON.stringify({
          action: 'allowlist.create',
          payloadHash,
          body: {
            id: 'cred-123',
            mockVerify: true,
            response: { clientDataJSON: 'mock', authenticatorData: 'mock', signature: 'mock' },
          },
        }),
      });

      const verRes = await stepUpVerify(verifyReq);
      const verData = await verRes.json();

      expect(verRes.status).toBe(200);
      expect(verData.ok).toBe(true);
      expect(verData).toHaveProperty('stepUpToken');
    });
  });
});
