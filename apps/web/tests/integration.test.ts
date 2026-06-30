import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GET as getAllowlist, POST as createAllowlist } from '@/app/api/allowlist/route';
import { GET as getAgentAllowlist } from '@/app/api/agent/allowlist/route';
import { POST as verifyOtp } from '@/app/api/step-up/otp/verify/route';
import { prisma } from '@/lib/prisma';
import { generateStepUpToken } from '@/lib/stepup';

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      allowlistEntry: {
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      otpChallenge: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      agentToken: {
        findFirst: vi.fn(),
      },
      portGroup: {
        findMany: vi.fn(() => []),
      }
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
  };
});

describe('API Integration Tests (Mocked Prisma)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/allowlist', () => {
    it('should return list of entries', async () => {
      const mockEntries = [
        { id: '1', ipCidr: '1.2.3.4/32', ipVersion: 4, ports: [15432], enabled: true },
      ];
      vi.mocked(prisma.allowlistEntry.findMany).mockResolvedValue(mockEntries as any);

      const response = await getAllowlist();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockEntries);
    });
  });

  describe('POST /api/allowlist', () => {
    it('should reject creation if step-up token is missing', async () => {
      const req = new Request('http://localhost/api/allowlist', {
        method: 'POST',
        body: JSON.stringify({ ipCidr: '1.2.3.4/32', label: 'laptop', portGroupKeys: ['postgres'], mode: 'temporary', ttlMinutes: 120 }),
      });

      const response = await createAllowlist(req);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Step-up authentication required');
    });

    it('should allow creation with a valid step-up token', async () => {
      const payload = { ipCidr: '1.2.3.4/32', label: 'laptop', portGroupKeys: ['postgres'], mode: 'temporary', ttlMinutes: 120 };
      
      const sortObject = (obj: any): any => {
        const sorted: any = {};
        Object.keys(obj).sort().forEach(k => { sorted[k] = obj[k]; });
        return sorted;
      };
      const canonical = JSON.stringify(sortObject(payload));
      
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(canonical).digest('hex');
      const token = await generateStepUpToken('test-user-id', 'test-session-id', 'allowlist.create', hash);

      const req = new Request('http://localhost/api/allowlist', {
        method: 'POST',
        body: JSON.stringify({ ...payload, stepUpToken: token }),
      });

      const mockEntry = { id: 'new-id', ...payload, ipCidr: '1.2.3.4/32', ipVersion: 4, ports: [15432] };
      vi.mocked(prisma.allowlistEntry.create).mockResolvedValue(mockEntry as any);

      const response = await createAllowlist(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe('new-id');
    });
  });
});
