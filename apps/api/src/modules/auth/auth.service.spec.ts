import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';

describe('AuthService (Phase 2 Authentication & Concurrency-Safe Rotation)', () => {
  let authService: AuthService;
  let prismaService: any;
  let jwtService: any;

  const mockUser = {
    id: 'user-uuid-1234',
    email: 'test@example.com',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJCsgqlrqrcrvWDaJaGbCDGubxUCL00ZwYnM',
    firstName: 'Amrutha',
    lastName: 'K R',
    baseCurrency: 'INR',
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-09-07T12:00:00Z'),
    updatedAt: new Date('2026-09-07T12:00:00Z'),
  };

  beforeEach(async () => {
    prismaService = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      refreshSession: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prismaService['$transaction'] = jest.fn((callback) => callback(prismaService));

    jwtService = {
      sign: jest.fn().mockReturnValue('mocked.jwt.access.token'),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret-min-32-chars-long';
        if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret-min-32-chars-long';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('1. Password Security (Argon2id)', () => {
    it('should hash a password using Argon2id and verify correctly', async () => {
      const password = 'StrongPassword123!';
      const hash = await authService.hashPassword(password);

      expect(hash).toContain('$');
      expect(await authService.verifyPassword(hash, password)).toBe(true);
      expect(await authService.verifyPassword(hash, 'WrongPassword456!')).toBe(false);
    });
  });

  describe('2. Registration Flow', () => {
    it('should register a new user with normalized email and return sanitized user without passwordHash', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);
      prismaService.user.create.mockImplementation((args: any) => ({
        ...mockUser,
        email: args.data.email,
        passwordHash: args.data.passwordHash,
      }));

      const result = await authService.register({
        email: '  TEST@Example.Com  ',
        password: 'StrongPassword123!',
        firstName: 'Amrutha',
        lastName: 'K R',
      });

      expect(result).toBeDefined();
      expect(prismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            firstName: 'Amrutha',
            baseCurrency: 'INR',
          }),
        }),
      );
      const createdPasswordHash = prismaService.user.create.mock.calls[0][0].data.passwordHash;
      expect(createdPasswordHash).toContain('$');
      expect(createdPasswordHash).not.toBe('StrongPassword123!');
      expect((result.user as any).passwordHash).toBeUndefined();
      expect(result.tokens.accessToken).toBe('mocked.jwt.access.token');
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('duplicate email returns 409 Conflict', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'StrongPassword123!',
          firstName: 'Amrutha',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('3. Login Flow & Enumeration Defense', () => {
    let validPasswordHash: string;

    beforeEach(async () => {
      validPasswordHash = await authService.hashPassword('StrongPassword123!');
    });

    it('valid credentials succeed', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: validPasswordHash,
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: 'StrongPassword123!',
      });

      expect(result.user.email).toBe('test@example.com');
      expect((result.user as any).passwordHash).toBeUndefined();
      expect(result.tokens.accessToken).toBe('mocked.jwt.access.token');
    });

    it('wrong password returns generic 401', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: validPasswordHash,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'IncorrectPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('unknown email returns identical generic 401 (enumeration prevention)', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('inactive user cannot login', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        isActive: false,
        passwordHash: validPasswordHash,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('deleted user cannot login', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
        passwordHash: validPasswordHash,
      });

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'StrongPassword123!',
        }),
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('4. Refresh Token Rotation & Concurrency Security', () => {
    const rawRefreshToken = 'raw-refresh-token-1234';
    let tokenHash: string;
    let validSession: any;

    beforeEach(() => {
      tokenHash = authService.hashToken(rawRefreshToken);
      validSession = {
        id: 'session-uuid-1',
        userId: mockUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        user: mockUser,
      };
    });

    it('A. Active refresh token -> exactly one successful rotation', async () => {
      // Atomic conditional update claims the row
      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 1 });
      prismaService.refreshSession.findUnique.mockResolvedValue(validSession);

      const tokens = await authService.refresh({ refreshToken: rawRefreshToken });

      expect(tokens.accessToken).toBe('mocked.jwt.access.token');
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.refreshToken).not.toBe(rawRefreshToken);

      expect(prismaService.refreshSession.updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: {
          revokedAt: expect.any(Date),
          lastUsedAt: expect.any(Date),
        },
      });

      expect(prismaService.refreshSession.create).toHaveBeenCalledTimes(1);
      expect(prismaService.refreshSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
            tokenHash: expect.not.stringMatching(tokens.refreshToken),
          }),
        }),
      );
    });

    it('B. Same old token submitted after rotation -> 401', async () => {
      // Already revoked -> updateMany matches 0 rows
      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 0 });
      prismaService.refreshSession.findUnique.mockResolvedValue({
        ...validSession,
        revokedAt: new Date('2026-09-07T10:00:00Z'),
      });

      await expect(authService.refresh({ refreshToken: rawRefreshToken })).rejects.toThrow(
        'Invalid or revoked refresh token',
      );
      expect(prismaService.refreshSession.create).not.toHaveBeenCalled();
    });

    it('C & D. Two simultaneous refresh attempts using same token -> exactly one succeeds, one gets 401, exactly one session created', async () => {
      let claimCount = 0;
      prismaService.refreshSession.updateMany.mockImplementation(async () => {
        claimCount++;
        // Request 1 claims successfully (count: 1), Request 2 gets 0 rows (already revoked)
        return { count: claimCount === 1 ? 1 : 0 };
      });

      prismaService.refreshSession.findUnique.mockImplementation(async () => {
        if (claimCount === 1) {
          // Request 1 reading its successfully claimed session
          return validSession;
        } else {
          // Request 2 seeing session already revoked by Request 1
          return {
            ...validSession,
            revokedAt: new Date(),
          };
        }
      });

      // Execute both requests concurrently
      const [result1, result2] = await Promise.allSettled([
        authService.refresh({ refreshToken: rawRefreshToken }),
        authService.refresh({ refreshToken: rawRefreshToken }),
      ]);

      // Assert exactly one fulfilled and one rejected
      expect(result1.status).toBe('fulfilled');
      expect(result2.status).toBe('rejected');

      if (result1.status === 'fulfilled') {
        expect(result1.value.accessToken).toBe('mocked.jwt.access.token');
      }
      if (result2.status === 'rejected') {
        expect(result2.reason).toBeInstanceOf(UnauthorizedException);
        expect(result2.reason.message).toBe('Invalid or revoked refresh token');
      }

      // Assert exactly ONE replacement RefreshSession was created
      expect(prismaService.refreshSession.create).toHaveBeenCalledTimes(1);
    });

    it('E. Expired refresh token -> 401', async () => {
      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 0 });
      prismaService.refreshSession.findUnique.mockResolvedValue({
        ...validSession,
        expiresAt: new Date(Date.now() - 5000),
        revokedAt: null,
      });

      await expect(authService.refresh({ refreshToken: rawRefreshToken })).rejects.toThrow(
        'Refresh token has expired',
      );
      expect(prismaService.refreshSession.create).not.toHaveBeenCalled();
    });

    it('E2. Boundary test: expiresAt exactly at current time (expiresAt <= now) -> 401', async () => {
      const boundaryTime = new Date('2026-09-07T12:00:00.000Z');
      jest.useFakeTimers();
      jest.setSystemTime(boundaryTime);

      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 0 });
      prismaService.refreshSession.findUnique.mockResolvedValue({
        ...validSession,
        expiresAt: boundaryTime, // exactly equal to current time
        revokedAt: null,
      });

      await expect(authService.refresh({ refreshToken: rawRefreshToken })).rejects.toThrow(
        'Refresh token has expired',
      );
      expect(prismaService.refreshSession.create).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('F. Revoked refresh token -> 401', async () => {
      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 0 });
      prismaService.refreshSession.findUnique.mockResolvedValue({
        ...validSession,
        revokedAt: new Date('2026-09-07T08:00:00Z'),
      });

      await expect(authService.refresh({ refreshToken: rawRefreshToken })).rejects.toThrow(
        'Invalid or revoked refresh token',
      );
      expect(prismaService.refreshSession.create).not.toHaveBeenCalled();
    });

    it('G. Inactive user -> 401', async () => {
      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 1 });
      prismaService.refreshSession.findUnique.mockResolvedValue({
        ...validSession,
        user: { ...mockUser, isActive: false },
      });

      await expect(authService.refresh({ refreshToken: rawRefreshToken })).rejects.toThrow(
        'User account is inactive or has been deleted',
      );
      expect(prismaService.refreshSession.create).not.toHaveBeenCalled();
    });

    it('G2. Soft-deleted user -> 401', async () => {
      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 1 });
      prismaService.refreshSession.findUnique.mockResolvedValue({
        ...validSession,
        user: { ...mockUser, deletedAt: new Date() },
      });

      await expect(authService.refresh({ refreshToken: rawRefreshToken })).rejects.toThrow(
        'User account is inactive or has been deleted',
      );
      expect(prismaService.refreshSession.create).not.toHaveBeenCalled();
    });

    it('H. Transaction Rollback Contract: when user is inactive or deleted, exception escapes $transaction callback triggering DB rollback', async () => {
      let transactionStarted = false;
      let transactionCommitted = false;
      let transactionRolledBack = false;

      prismaService['$transaction'] = jest.fn(async (callback) => {
        transactionStarted = true;
        try {
          const result = await callback(prismaService);
          transactionCommitted = true;
          return result;
        } catch (error) {
          transactionRolledBack = true;
          throw error;
        }
      });

      // Claim succeeds (count: 1), but user is inactive
      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 1 });
      prismaService.refreshSession.findUnique.mockResolvedValue({
        ...validSession,
        user: { ...mockUser, isActive: false },
      });

      await expect(authService.refresh({ refreshToken: rawRefreshToken })).rejects.toThrow(
        'User account is inactive or has been deleted',
      );

      // Verify transaction lifecycle guarantees
      expect(transactionStarted).toBe(true);
      expect(transactionRolledBack).toBe(true);
      expect(transactionCommitted).toBe(false);
      // Verify no replacement session is created
      expect(prismaService.refreshSession.create).not.toHaveBeenCalled();
    });

    it('H2. Transaction Rollback Contract: soft-deleted user triggers rollback without replacement session', async () => {
      let transactionRolledBack = false;

      prismaService['$transaction'] = jest.fn(async (callback) => {
        try {
          return await callback(prismaService);
        } catch (error) {
          transactionRolledBack = true;
          throw error;
        }
      });

      // Claim succeeds (count: 1), but user is soft-deleted
      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 1 });
      prismaService.refreshSession.findUnique.mockResolvedValue({
        ...validSession,
        user: { ...mockUser, deletedAt: new Date() },
      });

      await expect(authService.refresh({ refreshToken: rawRefreshToken })).rejects.toThrow(
        'User account is inactive or has been deleted',
      );

      expect(transactionRolledBack).toBe(true);
      expect(prismaService.refreshSession.create).not.toHaveBeenCalled();
    });
  });

  describe('5. Logout Flow', () => {
    it('logout marks active refresh session as revoked via atomic updateMany', async () => {
      const rawToken = 'token-to-logout';
      const tokenHash = authService.hashToken(rawToken);

      prismaService.refreshSession.updateMany.mockResolvedValue({ count: 1 });

      const res = await authService.logout({ refreshToken: rawToken });

      expect(res.success).toBe(true);
      expect(prismaService.refreshSession.updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });
  });
});
