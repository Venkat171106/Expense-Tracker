import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { AuthResponseDto, AuthTokensDto, UserResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtAccessSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtAccessExpiresInSeconds = 15 * 60; // 15 minutes
  private readonly jwtRefreshExpiresInDays = 7; // 7 days

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtAccessSecret = this.configService.get<string>('JWT_ACCESS_SECRET') || 'default-access-secret-min-32-chars-key';
    this.jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'default-refresh-secret-min-32-chars-key';
  }

  // 1. Password hashing using Argon2id
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  }

  // 2. Password verification
  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  // 3. Cryptographic hash for refresh tokens (SHA-256)
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // 4. Generate random secure opaque refresh token string
  generateRefreshTokenString(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  // 5. Registration
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check existing
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('An account with this email address already exists');
    }

    const passwordHash = await this.hashPassword(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName ? dto.lastName.trim() : null,
          baseCurrency: 'INR',
          isActive: true,
        },
      });

      const tokens = await this.issueTokenPair(user.id);

      return {
        user: this.sanitizeUser(user),
        tokens,
      };
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('An account with this email address already exists');
      }
      this.logger.error('Registration failure', err.stack);
      throw new InternalServerErrorException('Failed to register user');
    }
  }

  // 6. Login
  async login(dto: LoginDto, metadata?: { userAgent?: string; ipAddress?: string }): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Constant-time generic failure
    const genericAuthError = new UnauthorizedException('Invalid email or password');

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      // Fake verify to mitigate timing attacks
      await this.verifyPassword(
        '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJCsgqlrqrcrvWDaJaGbCDGubxUCL00ZwYnM',
        dto.password,
      );
      throw genericAuthError;
    }

    const isMatch = await this.verifyPassword(user.passwordHash, dto.password);
    if (!isMatch) {
      throw genericAuthError;
    }

    const tokens = await this.issueTokenPair(user.id, metadata);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  // 7. Refresh Token Rotation (Atomic & Concurrency-Safe)
  async refresh(dto: RefreshTokenDto, metadata?: { userAgent?: string; ipAddress?: string }): Promise<AuthTokensDto> {
    const rawToken = dto.refreshToken;
    const incomingTokenHash = this.hashToken(rawToken);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Step 1: Atomic conditional claim (test-and-set)
      // Transition from active -> revoked ONLY IF:
      // - tokenHash matches
      // - revokedAt IS NULL
      // - expiresAt > now (strictly greater than current time; expiresAt <= now is expired)
      // Exactly ONE concurrent transaction can match and update this row in PostgreSQL.
      const claimResult = await tx.refreshSession.updateMany({
        where: {
          tokenHash: incomingTokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          lastUsedAt: now,
        },
      });

      // Step 2: Handle claim failure (either already revoked, expired, or non-existent)
      if (claimResult.count === 0) {
        const existing = await tx.refreshSession.findUnique({
          where: { tokenHash: incomingTokenHash },
        });

        if (!existing) {
          throw new UnauthorizedException('Invalid or expired refresh token');
        }

        if (existing.revokedAt !== null) {
          this.logger.warn(`Revoked refresh token reuse attempted for user ${existing.userId}`);
          throw new UnauthorizedException('Invalid or revoked refresh token');
        }

        if (existing.expiresAt <= now) {
          throw new UnauthorizedException('Refresh token has expired');
        }

        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Step 3: Retrieve associated session & user (only the winning transaction reaches here)
      const session = await tx.refreshSession.findUnique({
        where: { tokenHash: incomingTokenHash },
        include: { user: true },
      });

      // Step 4: Validate user active & not soft-deleted status
      if (!session || !session.user || !session.user.isActive || session.user.deletedAt !== null) {
        throw new UnauthorizedException('User account is inactive or has been deleted');
      }

      // Step 5: Generate and insert replacement session atomically in the same transaction
      const newRefreshToken = this.generateRefreshTokenString();
      const newRefreshTokenHash = this.hashToken(newRefreshToken);
      const expiresAt = new Date(Date.now() + this.jwtRefreshExpiresInDays * 24 * 60 * 60 * 1000);

      await tx.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: newRefreshTokenHash,
          expiresAt,
          userAgent: metadata?.userAgent,
          ipAddress: metadata?.ipAddress,
        },
      });

      const accessToken = this.jwtService.sign(
        { sub: session.userId, type: 'access' },
        {
          secret: this.jwtAccessSecret,
          expiresIn: this.jwtAccessExpiresInSeconds,
        },
      );

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: this.jwtAccessExpiresInSeconds,
        tokenType: 'Bearer',
      };
    });
  }

  // 8. Logout (Atomic & Concurrency-Safe)
  async logout(dto: RefreshTokenDto): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.hashToken(dto.refreshToken);

    await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { success: true, message: 'Logged out successfully' };
  }

  // Helper: Issue token pair
  private async issueTokenPair(
    userId: string,
    metadata?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokensDto> {
    const accessToken = this.jwtService.sign(
      { sub: userId, type: 'access' },
      {
        secret: this.jwtAccessSecret,
        expiresIn: this.jwtAccessExpiresInSeconds,
      },
    );

    const rawRefreshToken = this.generateRefreshTokenString();
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + this.jwtRefreshExpiresInDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.jwtAccessExpiresInSeconds,
      tokenType: 'Bearer',
    };
  }

  private sanitizeUser(user: any): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      baseCurrency: user.baseCurrency,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
